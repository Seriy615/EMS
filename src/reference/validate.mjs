import { resolveCompositeBoundary } from '../contracts/conditions.mjs';
import { fail } from './errors.mjs';
import { assertTypeName, assertValueType, typeOfValue } from './types.mjs';

function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

export function validateGraph(graph, registry) {
  if (!isPlainObject(graph) || !['0.1','ems-contract-graph/1'].includes(graph.schemaVersion)) fail('SCHEMA_VERSION', 'Unsupported graph schemaVersion');
  if (!graph.id || !isPlainObject(graph.inputs) || !isPlainObject(graph.output) || !Array.isArray(graph.nodes)) fail('INVALID_GRAPH', 'Missing graph fields');
  if (!graph.output.type) fail('INVALID_GRAPH', 'Missing output.type');
  for (const [key, entry] of Object.entries(graph.inputs)) assertTypeName(entry.type, `graph.inputs.${key}`);
  assertTypeName(graph.output.type, 'graph.output.type');
  resolveCompositeBoundary(graph,registry);
  const nodes = new Map();
  for (const node of graph.nodes) {
    if (!node.id || !node.uses || !isPlainObject(node.args)) fail('INVALID_NODE', `Malformed node ${node?.id}`);
    if (nodes.has(node.id) || Object.hasOwn(graph.inputs, node.id)) fail('DUPLICATE_NODE', `Duplicate node or conflicting input ${node.id}`);
    nodes.set(node.id, node);
  }
  const resolved = new Map();
  const visiting = new Set();
  function resolveRef(ref, at) {
    if (!isPlainObject(ref)) fail('INVALID_REF', `${at}: expected reference object`);
    const keys = Object.keys(ref);
    if (keys.length !== 1) fail('INVALID_REF', `${at}: reference must contain exactly one of input/node/literal`);
    if (Object.hasOwn(ref, 'input')) {
      const entry = Object.hasOwn(graph.inputs, ref.input) ? graph.inputs[ref.input] : undefined;
      if (!entry) fail('UNKNOWN_INPUT', `${at}: unknown input ${ref.input}`);
      return entry.type;
    }
    if (Object.hasOwn(ref, 'node')) {
      const node = nodes.get(ref.node);
      if (!node) fail('UNKNOWN_NODE', `${at}: unknown node ${ref.node}`);
      return visit(node).output;
    }
    if (Object.hasOwn(ref, 'literal')) {
      const value = ref.literal;
      const type = typeOfValue(value);
      if (type !== 'Unknown') return type;
      fail('UNKNOWN_LITERAL', `${at}: unsupported literal`);
    }
    fail('INVALID_REF', `${at}: unknown reference kind`);
  }
  function visit(node) {
    if (resolved.has(node.id)) return resolved.get(node.id);
    if (visiting.has(node.id)) fail('GRAPH_CYCLE', `Cycle detected at ${node.id}`);
    visiting.add(node.id);
    const contract = registry.resolve(node.uses);
    if(contract.valueProfile!==undefined)fail('UNSUPPORTED_PROFILE','Algebraic atomic contracts require structured control IR');
    if(contract.kind==='resource')fail('UNSUPPORTED_PROFILE','Resource bindings require resource control IR');
    for (const [arg, typ] of Object.entries(contract.inputs)) {
      const ref = node.args[arg];
      if (!ref) fail('MISSING_ARGUMENT', `${node.id}: missing argument ${arg}`);
      const actualType = resolveRef(ref, `${node.id}.${arg}`);
      const expectedType = typeof typ === 'string' ? typ : typ.type;
      if (actualType !== expectedType) fail('TYPE_MISMATCH', `${node.id}.${arg}: ${actualType} cannot connect to ${expectedType}`);
    }
    for (const key of Object.keys(node.args)) if (!Object.hasOwn(contract.inputs, key)) fail('EXTRA_ARGUMENT', `${node.id}: unexpected argument ${key}`);
    visiting.delete(node.id);
    const result = { output: contract.output, contract };
    resolved.set(node.id, result);
    return result;
  }
  for (const node of graph.nodes) visit(node);
  const out = resolveRef(graph.returns, 'returns');
  if (out !== graph.output.type) fail('TYPE_MISMATCH', `Output ${out} does not match ${graph.output.type}`);
  return { nodes, resolved };
}

export function validateRuntimeInputs(graph, inputs) {
  if (!isPlainObject(inputs)) fail('INVALID_INPUT', 'Input values must be an object');
  for (const [key, value] of Object.entries(graph.inputs)) {
    if (!Object.hasOwn(inputs, key)) fail('MISSING_INPUT', `Missing input ${key}`);
    assertValueType(inputs[key], value.type, `inputs.${key}`);
  }
  for (const key of Object.keys(inputs)) if (!Object.hasOwn(graph.inputs, key)) fail('EXTRA_INPUT', `Unexpected input ${key}`);
}
