import { fail } from '../reference/errors.mjs';
import { resolveType, unifyTypes, typeName } from './types.mjs';
import { CONTROL_VERSION, CONTROL_PROFILE, validateControlIR } from '../ir/control.mjs';

function finite(type, node) {
  if (type.kind === 'Type' && ['Number', 'Boolean', 'String'].includes(type.name)) return type.name;
  if (type.name === 'Array' && type.arguments[0]?.name === 'Number') return 'NumberArray';
  fail('UNSUPPORTED_PROFILE', `Control finite IR cannot represent ${typeName(type)}`, { location: node?.location });
}
const flexible = type => type.kind === 'Variable' ? { kind: 'Variable', name: type.name } : { ...type, arguments: type.arguments.map(flexible) };

/** Specialize typed functions into semantic control blocks; locations remain a separate sidecar. */
export function lowerControlModule(checked, entry, registry) {
  const functions = [], instances = new Map(), provenance = {};
  let next = 0;
  const diagnostic = node => fail('UNSUPPORTED_PROFILE', `${node.kind} requires another IR profile`, { location: node.location });
  function specialize(target, inputs) {
    if (target.async) diagnostic(target.declaration);
    if (target.contract || target.declaration.external) {
      const contract = target.contract ?? registry.resolve(target.name);
      const signature = target.inputs.map((input, index) => [input.name, finite(inputs[index], target.declaration)]);
      const actual = Object.entries(contract.inputs).map(([name, type]) => [name, typeof type === 'string' ? type : type.type]);
      if (JSON.stringify(signature) !== JSON.stringify(actual) || finite(target.output, target.declaration) !== contract.output)
        fail('BINDING_SIGNATURE', `Extern signature disagrees with ${contract.id}`, { location: target.declaration?.location });
      return { kind: 'contract', id: contract.id, version: contract.version };
    }
    const key = `${target.name}:${inputs.map(typeName).join(',')}`;
    if (instances.has(key)) return instances.get(key);
    if (functions.length >= 1000) fail('IR_LIMIT', 'Too many specializations');
    const substitutions = new Map(); target.inputs.forEach((input, index) => unifyTypes(flexible(input.type), inputs[index], substitutions));
    const id = target.parameters.length ? `${target.name}.specialization_${next++}` : target.name;
    const reference = { kind: 'function', id }; instances.set(key, reference);
    const fn = { id, inputs: target.inputs.map((input, index) => ({ name: input.name, type: finite(inputs[index], target.declaration) })),
      output: { type: finite(resolveType(target.output, substitutions), target.declaration) }, requirements: { effects: target.declaration.requirements.filter(r => r.name === 'effect').map(r => r.value).sort(), capabilities: target.declaration.requirements.filter(r => r.name === 'capability').map(r => r.value).sort() }, policy: structuredClone(checked.policies.get(target.name)), body: [] };
    functions.push(fn); provenance[id] = { location: target.declaration.location };
    const typeOf = node => finite(resolveType(checked.types.get(node), substitutions), node);
    function expression(node) {
      if (node.kind === 'GroupExpression') return expression(node.value);
      const type = typeOf(node);
      switch (node.kind) {
        case 'LiteralExpression': return { kind: 'literal', type, value: Object.is(node.value, -0) ? '-0' : node.value };
        case 'NameExpression': return { kind: 'local', type, name: node.name };
        case 'ArrayExpression': return { kind: 'array', type, elements: node.elements.map(expression) };
        case 'IndexExpression': return { kind: 'index', type, value: expression(node.value), index: expression(node.index) };
        case 'UnaryExpression': if (['+', '-', '!'].includes(node.operator)) return { kind: 'unary', type, operator: node.operator, value: expression(node.value) }; break;
        case 'BinaryExpression': return { kind: 'binary', type, operator: node.operator, left: expression(node.left), right: expression(node.right) };
        case 'AssignmentExpression': return { kind: 'assign', type, name: node.left.name, value: expression(node.right) };
        case 'CallExpression': {
          const call = checked.calls.get(node); if (call.algebraicConstructor) diagnostic(node);
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
  const ir = { schemaVersion: CONTROL_VERSION, profile: CONTROL_PROFILE, id: entry,
    version: checked.ast.package?.version ?? '0.1.0', entry: linked.id, functions };
  validateControlIR(ir, registry);
  return { ir, registry, provenance: { schemaVersion: 'ems-provenance/1', functions: provenance } };
}
