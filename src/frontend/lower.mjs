import { fail } from '../reference/errors.mjs';
import { Registry } from '../reference/registry.mjs';
import { lowerGraphToIR, CORE_PROFILE, EFFECT_PROFILE } from '../ir/index.mjs';
import { resolveType, unifyTypes, typeName } from './types.mjs';
import { lowerControlModule } from './control.mjs';

function referenceType(type, node) {
  if (type.kind === 'Type' && ['Number', 'Boolean', 'String'].includes(type.name)) return type.name;
  if (type.name === 'Array' && type.arguments[0]?.name === 'Number') return 'NumberArray';
  fail('UNSUPPORTED_PROFILE', `Finite call-IR cannot represent ${typeName(type)}`, { location: node?.location });
}
function flexible(type) {
  if (type.kind === 'Variable') return { kind: 'Variable', name: type.name };
  return { ...type, arguments: type.arguments.map(flexible) };
}
function numericLiteral(node) {
  if(node.kind==='LiteralExpression')return typeof node.value==='number';
  if(node.kind==='GroupExpression'||node.kind==='UnaryExpression'&&['+','-'].includes(node.operator))return numericLiteral(node.value);
  return false;
}
function constant(node) {
  if (node.kind === 'LiteralExpression') return node.value;
  if (node.kind === 'GroupExpression') return constant(node.value);
  if (node.kind === 'UnaryExpression' && ['-', '+'].includes(node.operator)) {
    const value = constant(node.value); return node.operator === '-' ? -value : +value;
  }
  if (node.kind === 'ArrayExpression') return node.elements.map(constant);
  fail('UNSUPPORTED_PROFILE', 'Computed array literals require a collection IR extension', { location: node.location });
}

/** Link typed SSA functions (including inferred generic instances) into the shared call-IR. */
function lowerCallModule(checked, entry, baseRegistry, eager = false, preserveGraphIdentity = false) {
  const registry = new Registry();
  for (const item of baseRegistry.items.values()) {
    if (item.kind === 'atomic') registry.registerAtomic(item);
    else if(item.kind==='resource')registry.registerResource(item);
    else if(item.kind==='collection')registry.items.set(item.id,item);
    else registry.registerComposite(item);
  }
  const entrySignature = checked.signatures.get(entry);
  if (!entrySignature) fail('UNKNOWN_SYMBOL', `Unknown entry ${entry}`);
  if (entrySignature.parameters.length) fail('CANNOT_INFER', 'Generic entry requires explicit concrete types');
  const instances = new Map(), building = new Set(), provenance = {};
  let nextInstance = 0;
  const version = checked.ast.package?.version ?? '0.1.0';
  function specialize(target, inputs) {
    if(target.arrayTemplate||target.mapTemplate)fail('UNSUPPORTED_PROFILE','Typed array specializations require control IR');
    if (target.contract) return target.name;
    if (target.async)
      fail('UNSUPPORTED_PROFILE', `${target.name}: async EMS requires a richer IR`, { location: target.declaration.location });
    if (target.declaration.external) {
      const contract = registry.resolve(target.name);
      const declaredInputs = target.inputs.map((input, index) => [input.name, referenceType(inputs[index], target.declaration)]);
      const actualInputs = Object.entries(contract.inputs).map(([name, spec]) => [name, typeof spec === 'string' ? spec : spec.type]);
      if (JSON.stringify(declaredInputs) !== JSON.stringify(actualInputs) || referenceType(target.output, target.declaration) !== contract.output)
        fail('BINDING_SIGNATURE', `External declaration disagrees with ${target.name}`, { location: target.declaration.location });
      return target.name;
    }
    const key = `${target.name}:${inputs.map(typeName).join(',')}`;
    if (building.has(key)) fail('RECURSIVE_COMPOSITE', `Recursive pure function ${target.name}`, { location: target.declaration.location });
    if (instances.has(key)) return instances.get(key);
    const substitutions = new Map();
    target.inputs.forEach((input, index) => unifyTypes(flexible(input.type), inputs[index], substitutions));
    const id = target.parameters.length ? `${target.name}.specialization_${nextInstance++}` : target.name;
    building.add(key);
    const graph = { schemaVersion: '0.1', id, version,
      inputs: Object.fromEntries(target.inputs.map((input, index) => [input.name, { type: referenceType(inputs[index], target.declaration) }])),
      output: { type: referenceType(resolveType(target.output, substitutions), target.declaration) }, nodes: [], returns: null };
    const policy = checked.policies.get(target.name);
    let sequential = eager || policy.effects.length || policy.capabilities.length || target.declaration.body.statements.some(statement => statement.kind === 'ExpressionStatement');
    if (sequential) Object.assign(graph, { effects: policy.effects, capabilities: policy.capabilities, sequence: [] });
    const environment = new Map(target.inputs.map(input => [input.name, { input: input.name }]));
    const sourceMap = {};
    function operation(uses, args, node, hint) {
      const implementation = registry.resolve(uses);
      if(implementation.kind==='collection')fail('UNSUPPORTED_PROFILE','Visual collection bindings require their graph frontend',{location:node.location});
      if (!sequential && implementation.kind === 'composite' && Object.hasOwn(implementation.graph, 'sequence')) {
        sequential = true;
        Object.assign(graph, { effects: policy.effects, capabilities: policy.capabilities, sequence: graph.nodes.map(node => node.id) });
      }
      let index=graph.nodes.length;
      let name = preserveGraphIdentity && hint && !Object.hasOwn(graph.inputs,hint) && !graph.nodes.some(node=>node.id===hint) ? hint : `value_${index}`;
      while(Object.hasOwn(graph.inputs,name)||graph.nodes.some(node=>node.id===name))name=`value_${++index}`;
      graph.nodes.push({ id: name, uses, args });
      if (sequential) graph.sequence.push(name);
      sourceMap[name] = node.location;
      return { node: name };
    }
    function expression(node, hint) {
      referenceType(resolveType(checked.types.get(node), substitutions), node);
      switch (node.kind) {
        case 'GroupExpression': return expression(node.value,hint);
        case 'LiteralExpression': return { literal: node.value };
        case 'ArrayExpression': return { literal: constant(node) };
        case 'NameExpression': return environment.get(node.name);
        case 'UnaryExpression':
          if(preserveGraphIdentity&&numericLiteral(node))return {literal:constant(node)};
          if (node.operator === '+') return expression(node.value,hint);
          if (node.operator === '-') return operation('core.mul', { a: expression(node.value), b: { literal: -1 } }, node,hint);
          break;
        case 'BinaryExpression': {
          const op = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div' }[node.operator];
          if (op) return operation(`core.${op}`, { a: expression(node.left), b: expression(node.right) }, node,hint);
          break;
        }
        case 'CallExpression': {
          const call = checked.calls.get(node);
          if (call.algebraicConstructor) fail('UNSUPPORTED_PROFILE', 'Algebraic values require a richer IR', { location: node.location });
          const types = call.inputs.map(input => resolveType(input, substitutions));
          const uses = specialize(call.target, types);
          const args = Object.fromEntries(call.target.inputs.map((input, index) => [input.name, expression(node.arguments[index])]));
          return operation(uses, args, node,hint);
        }
      }
      fail('UNSUPPORTED_PROFILE', `${node.kind} requires a richer IR`, { location: node.location });
    }
    for (const statement of target.declaration.body.statements) {
      if (statement.kind === 'LetDeclaration' && !statement.mutable) environment.set(statement.name, expression(statement.value,statement.name));
      else if (statement.kind === 'ReturnStatement') graph.returns = expression(statement.value);
      else if (statement.kind === 'ExpressionStatement') expression(statement.value);
      else fail('UNSUPPORTED_PROFILE', `${statement.kind} requires control/state/effect IR`, { location: statement.location });
    }
    registry.registerComposite({ id, version, graph, ...policy });
    building.delete(key); instances.set(key, id); provenance[id] = { location: target.declaration.location, nodes: sourceMap };
    return id;
  }
  const id = specialize(entrySignature, entrySignature.inputs.map(input => input.type));
  const contract = registry.resolve(id);
  if (contract.kind !== 'composite') fail('UNSUPPORTED_PROFILE', 'Entry must have an EMS body');
  return { ir: lowerGraphToIR(contract.graph, registry, { profile: contract.graph.sequence || contract.effects.length || contract.capabilities.length ? EFFECT_PROFILE : CORE_PROFILE }), registry,
    provenance: { schemaVersion: 'ems-provenance/1', functions: provenance } };
}

/** Select one semantic profile from the checked module; preserve the working call-IR backend. */
export function lowerCheckedModule(checked, entry, registry, { profile = 'auto', preserveGraphIdentity = false } = {}) {
  if (!['auto', 'call', 'control'].includes(profile)) fail('UNSUPPORTED_PROFILE', 'Unknown frontend lowering profile');
  let control = profile === 'auto' && checked.signatures.get(entry)?.async || profile === 'control' || profile === 'auto' && checked.signatures.get(entry)?.inputs.some(input => ['Map','Option','Result','Future','Stream','ResourceHandle'].includes(input.type.name));
  const entryTarget = checked.signatures.get(entry);
  const pending = entryTarget?.declaration.body ? [entryTarget.declaration.body] : [];
  const visited = new Set([entry]);
  while (profile === 'auto' && pending.length) {
    const node = pending.pop(); if (!node || typeof node !== 'object') continue;
    const target = checked.calls.get(node)?.target;
    if (target && !target.contract && !target.arrayTemplate && !target.mapTemplate && !target.declaration.external && !visited.has(target.name)) {
      visited.add(target.name); pending.push(target.declaration.body);
    }
    if (['IfStatement','WhileStatement','ForStatement','BreakStatement','ContinueStatement','AssignmentExpression','IndexExpression','ThrowStatement','TryStatement','MatchStatement'].includes(node.kind) ||
        node.kind === 'LetDeclaration' && node.mutable || node.kind === 'UnaryExpression' && node.operator === '!' ||
        node.kind === 'BinaryExpression' && !['+','-','*','/'].includes(node.operator)) control = true;
    if(target?.arrayTemplate||target?.mapTemplate)control=true;
    if (target?.async || node.kind === 'UnaryExpression' && node.operator === 'await') control = true;
    if(checked.calls.get(node)?.resourceOperation || target?.contract?.kind==='resource' || checked.types.get(node)?.name==='ResourceHandle' || node.kind==='UsingDeclaration')control=true;
    if (checked.calls.get(node)?.streamOperation || node.kind === 'ForStatement' && node.asynchronous) control = true;
    if (checked.calls.get(node)?.algebraicConstructor || checked.types.get(node)?.name === 'Map' || checked.types.get(node)?.name === 'Option' || checked.types.get(node)?.name === 'Result') control = true;
    if(checked.types.get(node)?.name==='Array'&&checked.types.get(node)?.arguments[0]?.name!=='Number')control=true;
    if (node.kind === 'ArrayExpression') { try { constant(node); } catch { control = true; } }
    for (const [key, value] of Object.entries(node)) if (key !== 'location') {
      if (Array.isArray(value)) pending.push(...value); else if (value && typeof value === 'object') pending.push(value);
    }
  }
  if (control) return lowerControlModule(checked, entry, registry);
  try { return lowerCallModule(checked, entry, registry, profile === 'auto',preserveGraphIdentity); }
  catch (error) { if (profile === 'auto' && error.code === 'RECURSIVE_COMPOSITE') return lowerControlModule(checked, entry, registry); throw error; }
}
