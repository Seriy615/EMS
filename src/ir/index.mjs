import { fail } from '../reference/errors.mjs';
import { assertTypeName, assertValueType, typeOfValue } from '../reference/types.mjs';
import { validateGraph } from '../reference/validate.mjs';
import { executeGraph } from '../reference/runtime.mjs';
import { compileStandaloneJS } from '../reference/compiler.mjs';

export const IR_VERSION = 'ems-ir/1';
export const CORE_PROFILE = 'ems-core-finite/1';
const namePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

function object(value, fields, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    fail('INVALID_IR', `${at}: expected an object`);
  if (Reflect.ownKeys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key)))
    fail('INVALID_IR', `${at}: expected exactly ${fields.join(', ')}`);
}
function name(value, at) {
  if (typeof value !== 'string' || !namePattern.test(value)) fail('INVALID_IR', `${at}: invalid name`);
}
function text(value, at) {
  if (typeof value !== 'string' || !value.length) fail('INVALID_IR', `${at}: nonempty string required`);
}
function encodeNumber(value) { return Object.is(value, -0) ? '-0' : value; }
function encodeLiteral(value) {
  if (typeof value === 'number') return encodeNumber(value);
  if (Array.isArray(value)) return value.map(encodeNumber);
  return value;
}
function decodeNumber(value) {
  if (value === '-0') return -0;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('INVALID_IR', 'Invalid encoded Number');
  return value;
}
function requirePure(contract, registry, stack = []) {
  if (contract.effects.length || contract.capabilities.length)
    fail('UNSUPPORTED_PROFILE', `${contract.id}: ${CORE_PROFILE} accepts pure contracts only`);
  if (contract.kind !== 'composite') return;
  if (stack.includes(contract.id) || stack.length >= 32)
    fail('RECURSIVE_COMPOSITE', `Recursive composite in IR: ${contract.id}`);
  validateGraph(contract.graph, registry);
  for (const node of contract.graph.nodes) requirePure(registry.resolve(node.uses), registry, [...stack, contract.id]);
}
function fromReference(ref) {
  if (Object.hasOwn(ref, 'input')) return { kind: 'input', name: ref.input };
  if (Object.hasOwn(ref, 'node')) return { kind: 'node', id: ref.node };
  return { kind: 'literal', type: typeOfValue(ref.literal), value: encodeLiteral(ref.literal) };
}
function toReference(ref) {
  if (!ref || typeof ref !== 'object') fail('INVALID_IR', 'Expected a value reference');
  if (ref.kind === 'input') {
    object(ref, ['kind', 'name'], 'input reference'); name(ref.name, 'input reference');
    return { input: ref.name };
  }
  if (ref.kind === 'node') {
    object(ref, ['kind', 'id'], 'node reference'); name(ref.id, 'node reference');
    return { node: ref.id };
  }
  if (ref.kind !== 'literal') fail('INVALID_IR', 'Unknown reference kind');
  object(ref, ['kind', 'type', 'value'], 'literal');
  assertTypeName(ref.type, 'literal.type');
  let value = ref.value;
  if (ref.type === 'Number') value = decodeNumber(value);
  if (ref.type === 'NumberArray') {
    if (!Array.isArray(value)) fail('INVALID_IR', 'Expected an encoded NumberArray');
    value = Array.from(value, decodeNumber);
  }
  assertValueType(value, ref.type, 'IR literal');
  return { literal: value };
}

/** Lower the checked initial graph/HIR profile into a typed, versioned semantic artifact. */
export function lowerGraphToIR(graph, registry) {
  validateGraph(graph, registry);
  const operations = [...graph.nodes].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(node => {
    const contract = registry.resolve(node.uses);
    requirePure(contract, registry);
    return {
      id: node.id, contract: { id: contract.id, version: contract.version },
      arguments: Object.keys(contract.inputs).map(port => ({ port, value: fromReference(node.args[port]) })),
      type: contract.output
    };
  });
  const ir = {
    schemaVersion: IR_VERSION, profile: CORE_PROFILE, id: graph.id, version: graph.version,
    inputs: Object.entries(graph.inputs).map(([name, spec]) => ({ name, type: spec.type })),
    output: { type: graph.output.type }, operations, result: fromReference(graph.returns)
  };
  // Keep lowering and deserialization on the same structural and type gate.
  graphFromIR(ir, registry);
  return ir;
}

/** Validate a semantic artifact against the exact declared contract versions. */
export function graphFromIR(ir, registry) {
  if (!ir || ir.schemaVersion !== IR_VERSION) fail('IR_VERSION', `Expected ${IR_VERSION}`);
  if (ir.profile !== CORE_PROFILE) fail('UNSUPPORTED_PROFILE', `Expected ${CORE_PROFILE}`);
  object(ir, ['schemaVersion', 'profile', 'id', 'version', 'inputs', 'output', 'operations', 'result'], 'IR');
  text(ir.id, 'IR.id'); text(ir.version, 'IR.version');
  if (!Array.isArray(ir.inputs) || !Array.isArray(ir.operations)) fail('INVALID_IR', 'Expected input/operation arrays');
  object(ir.output, ['type'], 'IR.output'); assertTypeName(ir.output.type, 'IR.output');
  const names = new Set();
  const inputs = Object.fromEntries(Array.from(ir.inputs, input => {
    object(input, ['name', 'type'], 'IR.input'); name(input.name, 'IR.input.name');
    if (names.has(input.name)) fail('INVALID_IR', `Duplicate input ${input.name}`);
    names.add(input.name); assertTypeName(input.type, `IR.input.${input.name}`);
    return [input.name, { type: input.type }];
  }));
  const nodes = Array.from(ir.operations, operation => {
    object(operation, ['id', 'contract', 'arguments', 'type'], 'IR.operation'); name(operation.id, 'IR.operation.id');
    object(operation.contract, ['id', 'version'], 'IR.contract');
    text(operation.contract.id, 'IR.contract.id'); text(operation.contract.version, 'IR.contract.version');
    const contract = registry.resolve(operation.contract.id);
    if (contract.version !== operation.contract.version)
      fail('CONTRACT_VERSION', `${contract.id}: expected ${operation.contract.version}, registered ${contract.version}`);
    requirePure(contract, registry);
    if (operation.type !== contract.output) fail('TYPE_MISMATCH', `${operation.id}: declared output disagrees with contract`);
    const ports = Object.keys(contract.inputs);
    if (!Array.isArray(operation.arguments) || operation.arguments.length !== ports.length)
      fail('INVALID_IR', `${operation.id}: argument signature mismatch`);
    const args = Object.fromEntries(Array.from(operation.arguments, (argument, index) => {
      object(argument, ['port', 'value'], 'IR.argument');
      name(argument.port, 'IR.argument.port');
      if (argument.port !== ports[index]) fail('INVALID_IR', `${operation.id}: argument port order mismatch`);
      return [argument.port, toReference(argument.value)];
    }));
    return { id: operation.id, uses: contract.id, args };
  });
  const graph = { schemaVersion: '0.1', id: ir.id, version: ir.version, inputs,
    output: { type: ir.output.type }, nodes, returns: toReference(ir.result) };
  validateGraph(graph, registry);
  return graph;
}

/** Deterministic semantic serialization; canvas and provenance are separate artifacts. */
export function serializeIR(ir, registry) {
  return JSON.stringify(lowerGraphToIR(graphFromIR(ir, registry), registry), null, 2) + '\n';
}
export function parseIR(source, registry) {
  let ir;
  try { ir = JSON.parse(source); } catch { fail('INVALID_IR', 'Malformed IR JSON'); }
  graphFromIR(ir, registry);
  return lowerGraphToIR(graphFromIR(ir, registry), registry);
}
export function executeIR(ir, inputs, registry) {
  return executeGraph(graphFromIR(ir, registry), inputs, registry);
}
export function compileIRToJS(ir, registry) {
  return compileStandaloneJS(graphFromIR(ir, registry), registry);
}

/** Return a sidecar mapping; source locations never participate in IR identity. */
export function graphProvenance(graph, source) {
  text(source, 'source');
  return { schemaVersion: 'ems-provenance/1', source,
    nodes: Object.fromEntries(graph.nodes.map((node, index) => [node.id, { pointer: `/nodes/${index}` }])) };
}
