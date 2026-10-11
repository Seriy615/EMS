import { resolveCompositeBoundary, checkContractConditions, checkContractFailure } from '../contracts/conditions.mjs';
import { fail } from './errors.mjs';
import { assertValueType } from './types.mjs';
import { validateGraph, validateRuntimeInputs } from './validate.mjs';
import { checkGraphPolicy, validateEffectSequence } from '../semantics/effects.mjs';
import { assertSignal, checkCancellation, awaitCancellable } from '../runtime/cancellation.mjs';

/** Reference-only sequential async dataflow evaluator. Not a security sandbox, production scheduler or real-time engine. */
export async function executeGraph(graph, inputs, registry, options = {}) {
  assertSignal(options.signal);
  checkCancellation(options.signal);
  const { nodes } = validateGraph(graph, registry);
  validateRuntimeInputs(graph, inputs);
  checkGraphPolicy(graph, registry, options);
  validateEffectSequence(graph, registry);
  const boundary=resolveCompositeBoundary(graph,registry);
  if(boundary)checkContractConditions(boundary.conditions.pre,inputs,undefined,'pre',boundary.id);
  try {
  const allowed = new Set(options.capabilities ?? []);
  const callStack = options.callStack ?? [];
  if (callStack.includes(graph.id) || callStack.length >= 32) fail('RECURSIVE_COMPOSITE', `Recursive or too-deep composite ${graph.id}`);
  const nextStack = [...callStack, graph.id];
  const memo = new Map();
  async function refValue(ref) {
    checkCancellation(options.signal);
    if (Object.hasOwn(ref, 'input')) return inputs[ref.input];
    if (Object.hasOwn(ref, 'literal')) return ref.literal;
    return compute(ref.node);
  }
  async function compute(id) {
    checkCancellation(options.signal);
    if (memo.has(id)) return memo.get(id);
    const node = nodes.get(id);
    const contract = registry.resolve(node.uses);
    for (const cap of contract.capabilities) {
      if (!allowed.has(cap)) fail('PERMISSION_DENIED', `${contract.id} requires ${cap}`, { contract: contract.id, capability: cap });
    }
    const params = Object.create(null);
    for (const key of Object.keys(contract.inputs)) params[key] = await refValue(node.args[key]);
    checkCancellation(options.signal);
    const result = contract.kind === 'composite'
      ? await executeGraph(contract.graph, params, registry, { capabilities: [...allowed], allowedEffects: options.allowedEffects ?? [], callStack: nextStack, signal: options.signal, state: options.state })
      : await awaitCancellable(contract.execute(params, Object.freeze({ signal: options.signal, state: options.state })), options.signal);
    checkCancellation(options.signal);
    assertValueType(result, contract.output, `result of ${contract.id}`);
    memo.set(id, result);
    return result;
  }
  for (const id of graph.sequence ?? []) await compute(id);
  const result = await refValue(graph.returns);
  checkCancellation(options.signal);
  assertValueType(result, graph.output.type, 'graph result');
  if(boundary)checkContractConditions(boundary.conditions.post,inputs,result,'post',boundary.id);
  return result;
  }catch(error){if(boundary)checkContractFailure(error,boundary.errors,boundary.id);throw error;}
}
