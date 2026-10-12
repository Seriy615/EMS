import { resolveCompositeBoundary } from '../contracts/conditions.mjs';
import { fail } from '../reference/errors.mjs';
import { assertTypeName, assertValueType, typeOfValue } from '../reference/types.mjs';
import { validateGraph } from '../reference/validate.mjs';
import { executeGraph } from '../reference/runtime.mjs';
import { compileStandaloneJS } from '../reference/compiler.mjs';
import { analyzeGraphEffects, validateEffectSequence, checkGraphPolicy } from '../semantics/effects.mjs';
import { CONTROL_VERSION, validateControlIR, serializeControlIR } from './control.mjs';
import { executeControlIR, checkControlPolicy, controlSignature } from '../runtime/control.mjs';
import { compileControlJS } from '../compiler/control.mjs';

export const IR_VERSION = 'ems-ir/1';
export const CORE_PROFILE = 'ems-core-finite/1';
export const EFFECT_PROFILE = 'ems-effects-finite/1';
export const CONTRACT_CORE_PROFILE = 'ems-contract-core-finite/1';
export const CONTRACT_EFFECT_PROFILE = 'ems-contract-effects-finite/1';
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
  if (Object.hasOwn(contract.graph, 'sequence') && (!Array.isArray(contract.graph.sequence) || contract.graph.sequence.length)) fail('UNSUPPORTED_PROFILE', 'Core IR cannot erase nested call sequences');
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
export function lowerGraphToIR(graph, registry, { profile = CORE_PROFILE } = {}) {
  validateGraph(graph, registry);
  const boundary=resolveCompositeBoundary(graph,registry);
  if(boundary)profile=[EFFECT_PROFILE,CONTRACT_EFFECT_PROFILE].includes(profile)?CONTRACT_EFFECT_PROFILE:profile===CORE_PROFILE?CONTRACT_CORE_PROFILE:profile;
  if (![CORE_PROFILE, EFFECT_PROFILE, CONTRACT_CORE_PROFILE, CONTRACT_EFFECT_PROFILE].includes(profile)) fail('UNSUPPORTED_PROFILE', `Unknown profile ${profile}`);
  if ([CORE_PROFILE,CONTRACT_CORE_PROFILE].includes(profile) && Object.hasOwn(graph, 'sequence') && (!Array.isArray(graph.sequence) || graph.sequence.length)) fail('UNSUPPORTED_PROFILE', 'Core IR cannot erase an explicit sequence');
  if ([CORE_PROFILE,CONTRACT_CORE_PROFILE].includes(profile)) {
    const policy = analyzeGraphEffects(graph, registry);
    if (policy.effects.length || policy.capabilities.length) fail('UNSUPPORTED_PROFILE', 'Core IR cannot erase graph policy');
  }
  if(!boundary&&[CONTRACT_CORE_PROFILE,CONTRACT_EFFECT_PROFILE].includes(profile))fail('MISSING_INTERFACE_REF','Contract IR requires a composite interface');
  const policy = [EFFECT_PROFILE,CONTRACT_EFFECT_PROFILE].includes(profile) ? validateEffectSequence(graph, registry, { required: true }) : null;
  const operations = [...graph.nodes].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(node => {
    const contract = registry.resolve(node.uses);
    if ([CORE_PROFILE,CONTRACT_CORE_PROFILE].includes(profile)) requirePure(contract, registry);
    return {
      id: node.id, contract: { id: contract.id, version: contract.version },
      arguments: Object.keys(contract.inputs).map(port => ({ port, value: fromReference(node.args[port]) })),
      type: contract.output,
      ...(policy ? { policy: policy.nodes[node.id] } : {})
    };
  });
  const ir = {
    schemaVersion: IR_VERSION, profile, ...(boundary?{interfaceRef:{id:boundary.id,version:boundary.version}}:{}), id: graph.id, version: graph.version,
    inputs: Object.entries(graph.inputs).map(([name, spec]) => ({ name, type: spec.type })),
    output: { type: graph.output.type }, operations, result: fromReference(graph.returns),
    ...(policy ? { policy: { effects: policy.effects, capabilities: policy.capabilities }, sequence: graph.sequence ?? [], requirements: { effects: [...(graph.effects ?? [])].sort(), capabilities: [...(graph.capabilities ?? [])].sort() } } : {})
  };
  // Keep lowering and deserialization on the same structural and type gate.
  graphFromIR(ir, registry);
  return ir;
}

/** Validate a semantic artifact against the exact declared contract versions. */
export function graphFromIR(ir, registry) {
  if (!ir || ir.schemaVersion !== IR_VERSION) fail('IR_VERSION', `Expected ${IR_VERSION}`);
  if (![CORE_PROFILE, EFFECT_PROFILE, CONTRACT_CORE_PROFILE, CONTRACT_EFFECT_PROFILE].includes(ir.profile)) fail('UNSUPPORTED_PROFILE', 'Unknown IR profile');
  const effectful = [EFFECT_PROFILE,CONTRACT_EFFECT_PROFILE].includes(ir.profile),bound=[CONTRACT_CORE_PROFILE,CONTRACT_EFFECT_PROFILE].includes(ir.profile);
  object(ir, ['schemaVersion', 'profile', 'id', 'version', 'inputs', 'output', 'operations', 'result', ...(bound?['interfaceRef']:[]), ...(effectful ? ['policy', 'sequence', 'requirements'] : [])], 'IR');
  text(ir.id, 'IR.id'); text(ir.version, 'IR.version');
  if(bound){object(ir.interfaceRef,['id','version'],'IR.interfaceRef');text(ir.interfaceRef.id,'interface id');text(ir.interfaceRef.version,'interface version');}
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
    object(operation, ['id', 'contract', 'arguments', 'type', ...(effectful ? ['policy'] : [])], 'IR.operation'); name(operation.id, 'IR.operation.id');
    object(operation.contract, ['id', 'version'], 'IR.contract');
    text(operation.contract.id, 'IR.contract.id'); text(operation.contract.version, 'IR.contract.version');
    const contract = registry.resolve(operation.contract.id);
    if (contract.version !== operation.contract.version)
      fail('CONTRACT_VERSION', `${contract.id}: expected ${operation.contract.version}, registered ${contract.version}`);
    if (!effectful) requirePure(contract, registry);
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
  const graph = { schemaVersion: bound?'ems-contract-graph/1':'0.1', ...(bound?{interfaceRef:ir.interfaceRef}:{}), id: ir.id, version: ir.version, inputs,
    output: { type: ir.output.type }, nodes, returns: toReference(ir.result),
    ...(effectful ? { sequence: ir.sequence, effects: ir.requirements?.effects, capabilities: ir.requirements?.capabilities } : {}) };
  validateGraph(graph, registry);
  if (effectful) {
    object(ir.requirements, ['effects', 'capabilities'], 'IR.requirements');
    const summary = validateEffectSequence(graph, registry, { required: true });
    function samePolicy(actual, expected) {
      object(actual, ['effects', 'capabilities'], 'IR.policy');
      if (!Array.isArray(actual.effects) || !Array.isArray(actual.capabilities) ||
          JSON.stringify(actual.effects) !== JSON.stringify(expected.effects) ||
          JSON.stringify(actual.capabilities) !== JSON.stringify(expected.capabilities))
        fail('EFFECT_MISMATCH', 'IR policy disagrees with linked transitive declarations');
    }
    samePolicy(ir.policy, summary);
    for (const operation of ir.operations) samePolicy(operation.policy, summary.nodes[operation.id]);
  }
  return graph;
}

/** Deterministic semantic serialization; canvas and provenance are separate artifacts. */
export function serializeIR(ir, registry) {
  if (ir?.schemaVersion === CONTROL_VERSION) return serializeControlIR(ir, registry);
  return JSON.stringify(lowerGraphToIR(graphFromIR(ir, registry), registry, { profile: ir.profile }), null, 2) + '\n';
}
export function parseIR(source, registry) {
  let ir;
  try { ir = JSON.parse(source); } catch { fail('INVALID_IR', 'Malformed IR JSON'); }
  if (ir?.schemaVersion === CONTROL_VERSION) { validateControlIR(ir, registry); return JSON.parse(serializeControlIR(ir, registry)); }
  graphFromIR(ir, registry);
  return lowerGraphToIR(graphFromIR(ir, registry), registry, { profile: ir.profile });
}
export function executeIR(ir, inputs, registry, options = {}) {
  if (ir?.schemaVersion === CONTROL_VERSION) return executeControlIR(ir, inputs, registry, options);
  return executeGraph(graphFromIR(ir, registry), inputs, registry, options);
}
export function compileIRToJS(ir, registry) {
  if (ir?.schemaVersion === CONTROL_VERSION) return compileControlJS(ir, registry);
  return compileStandaloneJS(graphFromIR(ir, registry), registry);
}

/** Return a sidecar mapping; source locations never participate in IR identity. */
export function graphProvenance(graph, source) {
  text(source, 'source');
  return { schemaVersion: 'ems-provenance/1', source,
    nodes: Object.fromEntries(graph.nodes.map((node, index) => [node.id, { pointer: `/nodes/${index}` }])) };
}

/** Return the validated public input/output signature without pretending control IR is a dataflow graph. */
export function signatureIR(ir, registry) {
  if (ir?.schemaVersion === CONTROL_VERSION) return controlSignature(validateControlIR(ir, registry).entry);
  const graph = graphFromIR(ir, registry); return { id: graph.id, inputs: graph.inputs, output: graph.output };
}
export function checkIRPolicy(ir, registry, options = {}) {
  if (ir?.schemaVersion === CONTROL_VERSION) return checkControlPolicy(validateControlIR(ir, registry).policy, options);
  return checkGraphPolicy(graphFromIR(ir, registry), registry, options);
}

export {analyzeControlOrigins} from '../semantics/control-origins.mjs';

export {normalizeOriginPolicy,classifyControlOrigins,createBoundOriginPolicy,verifyBoundOriginPolicy,classifyBoundControlOrigins} from '../semantics/origin-policy.mjs';
