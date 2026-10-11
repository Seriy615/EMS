import { fail } from '../reference/errors.mjs';
import { Registry } from '../reference/registry.mjs';
import { lowerGraphToIR } from '../ir/index.mjs';
import { resolveType, unifyTypes, typeName } from './types.mjs';

function referenceType(type, node) {
  if (type.kind === 'Type' && ['Number', 'Boolean', 'String'].includes(type.name)) return type.name;
  if (type.name === 'Array' && type.arguments[0]?.name === 'Number') return 'NumberArray';
  fail('UNSUPPORTED_PROFILE', `Finite call-IR cannot represent ${typeName(type)}`, { location: node?.location });
}
function flexible(type) {
  if (type.kind === 'Variable') return { kind: 'Variable', name: type.name };
  return { ...type, arguments: type.arguments.map(flexible) };
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

/** Link typed pure SSA functions (including inferred generic instances) into the shared call-IR. */
export function lowerCheckedModule(checked, entry, baseRegistry) {
  const registry = new Registry();
  for (const item of baseRegistry.items.values()) {
    if (item.kind === 'atomic') registry.registerAtomic(item);
    else registry.registerComposite(item);
  }
  const entrySignature = checked.signatures.get(entry);
  if (!entrySignature) fail('UNKNOWN_SYMBOL', `Unknown entry ${entry}`);
  if (entrySignature.parameters.length) fail('CANNOT_INFER', 'Generic entry requires explicit concrete types');
  const instances = new Map(), building = new Set(), provenance = {};
  let nextInstance = 0;
  const version = checked.ast.package?.version ?? '0.1.0';
  function specialize(target, inputs) {
    if (target.contract) return target.name;
    if (target.async || target.declaration.requirements.some(requirement => requirement.name !== 'pure'))
      fail('UNSUPPORTED_PROFILE', `${target.name}: effects or async require a richer IR`, { location: target.declaration.location });
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
    const environment = new Map(target.inputs.map(input => [input.name, { input: input.name }]));
    const sourceMap = {};
    function operation(uses, args, node) {
      const name = `value_${graph.nodes.length}`;
      graph.nodes.push({ id: name, uses, args }); sourceMap[name] = node.location;
      return { node: name };
    }
    function expression(node) {
      referenceType(resolveType(checked.types.get(node), substitutions), node);
      switch (node.kind) {
        case 'GroupExpression': return expression(node.value);
        case 'LiteralExpression': return { literal: node.value };
        case 'ArrayExpression': return { literal: constant(node) };
        case 'NameExpression': return environment.get(node.name);
        case 'UnaryExpression':
          if (node.operator === '+') return expression(node.value);
          if (node.operator === '-') return operation('core.mul', { a: expression(node.value), b: { literal: -1 } }, node);
          break;
        case 'BinaryExpression': {
          const op = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div' }[node.operator];
          if (op) return operation(`core.${op}`, { a: expression(node.left), b: expression(node.right) }, node);
          break;
        }
        case 'CallExpression': {
          const call = checked.calls.get(node);
          if (call.algebraicConstructor) fail('UNSUPPORTED_PROFILE', 'Algebraic values require a richer IR', { location: node.location });
          const types = call.inputs.map(input => resolveType(input, substitutions));
          const uses = specialize(call.target, types);
          const args = Object.fromEntries(call.target.inputs.map((input, index) => [input.name, expression(node.arguments[index])]));
          return operation(uses, args, node);
        }
      }
      fail('UNSUPPORTED_PROFILE', `${node.kind} requires a richer IR`, { location: node.location });
    }
    for (const statement of target.declaration.body.statements) {
      if (statement.kind === 'LetDeclaration' && !statement.mutable) environment.set(statement.name, expression(statement.value));
      else if (statement.kind === 'ReturnStatement') graph.returns = expression(statement.value);
      else fail('UNSUPPORTED_PROFILE', `${statement.kind} requires control/state/effect IR`, { location: statement.location });
    }
    registry.registerComposite({ id, version, graph });
    building.delete(key); instances.set(key, id); provenance[id] = { location: target.declaration.location, nodes: sourceMap };
    return id;
  }
  const id = specialize(entrySignature, entrySignature.inputs.map(input => input.type));
  const contract = registry.resolve(id);
  if (contract.kind !== 'composite') fail('UNSUPPORTED_PROFILE', 'Entry must have an EMS body');
  return { ir: lowerGraphToIR(contract.graph, registry), registry,
    provenance: { schemaVersion: 'ems-provenance/1', functions: provenance } };
}
