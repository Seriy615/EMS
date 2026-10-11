import { fail } from './errors.mjs';
import { assertValueType } from './types.mjs';
import { validateGraph, validateRuntimeInputs } from './validate.mjs';
import { checkGraphPolicy } from '../semantics/effects.mjs';

/** Reference-only synchronous dataflow evaluator. Not a security sandbox, production scheduler or real-time engine. */
export async function executeGraph(graph, inputs, registry, options = {}) {
  const { nodes } = validateGraph(graph, registry);
  validateRuntimeInputs(graph, inputs);
  checkGraphPolicy(graph, registry, options);
  const allowed = new Set(options.capabilities ?? []);
  const callStack = options.callStack ?? [];
  if (callStack.includes(graph.id) || callStack.length >= 32) fail('RECURSIVE_COMPOSITE', `Recursive or too-deep composite ${graph.id}`);
  const nextStack = [...callStack, graph.id];
  const memo = new Map();
  async function refValue(ref) {
    if (Object.hasOwn(ref, 'input')) return inputs[ref.input];
    if (Object.hasOwn(ref, 'literal')) return ref.literal;
    return compute(ref.node);
  }
  async function compute(id) {
    if (memo.has(id)) return memo.get(id);
    const node = nodes.get(id);
    const contract = registry.resolve(node.uses);
    for (const cap of contract.capabilities) {
      if (!allowed.has(cap)) fail('PERMISSION_DENIED', `${contract.id} requires ${cap}`, { contract: contract.id, capability: cap });
    }
    const params = Object.create(null);
    for (const key of Object.keys(contract.inputs)) params[key] = await refValue(node.args[key]);
    const result = contract.kind === 'composite'
      ? await executeGraph(contract.graph, params, registry, { capabilities: [...allowed], allowedEffects: options.allowedEffects ?? [], callStack: nextStack })
      : await contract.execute(params);
    assertValueType(result, contract.output, `result of ${contract.id}`);
    memo.set(id, result);
    return result;
  }
  const result = await refValue(graph.returns);
  assertValueType(result, graph.output.type, 'graph result');
  return result;
}
