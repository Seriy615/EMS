import { fail } from '../reference/errors.mjs';
import { resolveType, unifyTypes, typeName } from './types.mjs';
import { CONTROL_VERSION, CONTROL_PROFILE, CONTROL_ERROR_PROFILE, CONTROL_ALGEBRAIC_PROFILE, CONTROL_FUTURE_PROFILE, validateControlIR } from '../ir/control.mjs';

function controlType(type, node) {
  if (type.kind === 'Type' && ['Number', 'Boolean', 'String'].includes(type.name)) return type.name;
  if (type.name === 'Array' && type.arguments[0]?.name === 'Number') return 'NumberArray';
  if (['Option', 'Result', 'Future'].includes(type.name)) return `${type.name}<${type.arguments.map(argument => controlType(argument, node)).join(',')}>`;
  fail('UNSUPPORTED_PROFILE', `Control IR cannot represent ${typeName(type)}`, { location: node?.location });
}
const flexible = type => type.kind === 'Variable' ? { kind: 'Variable', name: type.name } : { ...type, arguments: type.arguments.map(flexible) };

/** Specialize typed functions into semantic control blocks; locations remain a separate sidecar. */
export function lowerControlModule(checked, entry, registry) {
  const functions = [], instances = new Map(), provenance = {};
  let next = 0, errors = false, algebraic = false, futures = false;
  const diagnostic = node => fail('UNSUPPORTED_PROFILE', `${node.kind} requires another IR profile`, { location: node.location });
  function specialize(target, inputs) {
    if (target.async) futures = true;
    if (target.contract || target.declaration.external) {
      const contract = target.contract ?? registry.resolve(target.name);
      const signature = target.inputs.map((input, index) => [input.name, controlType(inputs[index], target.declaration)]);
      const actual = Object.entries(contract.inputs).map(([name, type]) => [name, typeof type === 'string' ? type : type.type]);
      if (JSON.stringify(signature) !== JSON.stringify(actual) || controlType(target.output, target.declaration) !== contract.output)
        fail('BINDING_SIGNATURE', `Extern signature disagrees with ${contract.id}`, { location: target.declaration?.location });
      return { kind: 'contract', id: contract.id, version: contract.version, ...(target.async ? { async: true } : {}) };
    }
    const key = `${target.name}:${inputs.map(typeName).join(',')}`;
    if (instances.has(key)) return instances.get(key);
    if (functions.length >= 1000) fail('IR_LIMIT', 'Too many specializations');
    const substitutions = new Map(); target.inputs.forEach((input, index) => unifyTypes(flexible(input.type), inputs[index], substitutions));
    const id = target.parameters.length ? `${target.name}.specialization_${next++}` : target.name;
    const reference = { kind: 'function', id }; instances.set(key, reference);
    const fn = { id, inputs: target.inputs.map((input, index) => ({ name: input.name, type: controlType(inputs[index], target.declaration) })),
      output: { type: controlType(resolveType(target.output, substitutions), target.declaration) }, requirements: { effects: target.declaration.requirements.filter(r => r.name === 'effect').map(r => r.value).sort(), capabilities: target.declaration.requirements.filter(r => r.name === 'capability').map(r => r.value).sort() }, policy: structuredClone(checked.policies.get(target.name)), body: [] };
    fn.async = target.async;
    functions.push(fn); provenance[id] = { location: target.declaration.location };
    const typeOf = node => { const type = controlType(resolveType(checked.types.get(node), substitutions), node); if (type.includes('Future<')) futures = true; return type; };
    if ([...fn.inputs.map(input => input.type), fn.output.type].some(type => type.includes('Future<'))) futures = true;
    if ([...fn.inputs.map(input => input.type), fn.output.type].some(type => type.includes('<'))) algebraic = true;
    function pattern(node, actual) {
      if (node.kind === 'WildcardPattern') return { kind: 'wildcard' };
      if (node.kind === 'BindingPattern') return node.name === 'None' && actual.name === 'Option' ? { kind: 'constructor', tag: 'None', arguments: [] } : { kind: 'binding', name: node.name };
      if (node.kind === 'LiteralPattern') return { kind: 'literal', type: typeOf(node.value), value: node.value.value };
      return { kind: 'constructor', tag: node.name, arguments: node.arguments.map(argument => pattern(argument, actual.arguments[node.name === 'Err' ? 1 : 0])) };
    }
    function expression(node) {
      if (node.kind === 'GroupExpression') return expression(node.value);
      const type = typeOf(node); if (type.includes('<')) algebraic = true;
      switch (node.kind) {
        case 'LiteralExpression': return { kind: 'literal', type, value: Object.is(node.value, -0) ? '-0' : node.value };
        case 'NameExpression': return { kind: 'local', type, name: node.name };
        case 'ArrayExpression': return { kind: 'array', type, elements: node.elements.map(expression) };
        case 'IndexExpression': return { kind: 'index', type, value: expression(node.value), index: expression(node.index) };
        case 'UnaryExpression': if (node.operator === 'await') { futures = true; return { kind: 'await', type, value: expression(node.value) }; } if (['+', '-', '!'].includes(node.operator)) return { kind: 'unary', type, operator: node.operator, value: expression(node.value) }; break;
        case 'BinaryExpression': return { kind: 'binary', type, operator: node.operator, left: expression(node.left), right: expression(node.right) };
        case 'AssignmentExpression': return { kind: 'assign', type, name: node.left.name, value: expression(node.right) };
        case 'CallExpression': {
          const call = checked.calls.get(node); if (call.algebraicConstructor) { algebraic = true; return { kind: 'construct', type, tag: call.algebraicConstructor, arguments: node.arguments.map(expression) }; }
          const target = specialize(call.target, call.inputs.map(input => resolveType(input, substitutions)));
          return { kind: 'call', type, target, arguments: node.arguments.map(expression) };
        }
      }
      diagnostic(node);
    }
    function block(node) { return node.statements.map(statement); }
    function statement(node) {
      switch (node.kind) {
        case 'LetDeclaration': return { kind: 'let', name: node.name, type: typeOf(node.value), mutable: node.mutable, value: expression(node.value) };
        case 'ExpressionStatement': return { kind: 'expression', value: expression(node.value) };
        case 'ReturnStatement': return { kind: 'return', value: expression(node.value) };
        case 'ThrowStatement': errors = true; return { kind: 'throw', value: expression(node.value) };
        case 'TryStatement': {
          errors = true;
          const type = node.handler ? controlType(resolveType(checked.catchTypes.get(node.handler), substitutions), node.handler) : null;
          if (type?.includes('<')) algebraic = true;
          if (type?.includes('Future<')) futures = true;
          return { kind: 'try', body: block(node.body),
            handler: node.handler ? { binding: node.handler.binding, type, body: block(node.handler.body) } : null,
            finalizer: node.finalizer ? block(node.finalizer) : null };
        }
        case 'MatchStatement': algebraic = true; return { kind: 'match', value: expression(node.value), arms: node.arms.map(arm => ({ pattern: pattern(arm.pattern, resolveType(checked.types.get(node.value), substitutions)), body: block(arm.body) })) };
        case 'Block': return { kind: 'block', body: block(node) };
        case 'IfStatement': return { kind: 'if', condition: expression(node.condition), then: block(node.then),
          otherwise: node.otherwise ? node.otherwise.kind === 'Block' ? block(node.otherwise) : [statement(node.otherwise)] : [] };
        case 'WhileStatement': return { kind: 'while', condition: expression(node.condition), body: block(node.body) };
        case 'ForStatement': return { kind: 'for', binding: node.binding, iterable: expression(node.iterable), body: block(node.body) };
        case 'BreakStatement': return { kind: 'break' };
        case 'ContinueStatement': return { kind: 'continue' };
      }
      diagnostic(node);
    }
    fn.body = block(target.declaration.body); return reference;
  }
  const target = checked.signatures.get(entry);
  if (!target) fail('UNKNOWN_SYMBOL', `Unknown entry ${entry}`);
  if (target.parameters.length) fail('CANNOT_INFER', 'Generic entry requires concrete types');
  const linked = specialize(target, target.inputs.map(input => input.type));
  if (linked.kind !== 'function') fail('UNSUPPORTED_PROFILE', 'Entry must have an EMS body');
  const ir = { schemaVersion: CONTROL_VERSION, profile: futures ? CONTROL_FUTURE_PROFILE : algebraic ? CONTROL_ALGEBRAIC_PROFILE : errors ? CONTROL_ERROR_PROFILE : CONTROL_PROFILE, id: entry,
    version: checked.ast.package?.version ?? '0.1.0', entry: linked.id, functions };
  if (!futures) for (const fn of functions) delete fn.async;
  else {
    function normalize(node) {
      if (!node || typeof node !== 'object') return;
      if (node.kind === 'contract') node.async ??= false;
      for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(normalize); else normalize(value);
    }
    functions.forEach(normalize);
  }
  validateControlIR(ir, registry);
  return { ir, registry, provenance: { schemaVersion: 'ems-provenance/1', functions: provenance } };
}
