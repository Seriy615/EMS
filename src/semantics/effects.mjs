import { fail } from '../reference/errors.mjs';
import { validateGraph } from '../reference/validate.mjs';

/** Compute transitive declarations without invoking trusted or foreign implementations. */
export function analyzeGraphEffects(graph, registry) {
  const summaries = new Map();
  function contractSummary(contract, stack) {
    if (summaries.has(contract.id)) return summaries.get(contract.id);
    if (stack.includes(contract.id) || stack.length >= 32) fail('RECURSIVE_COMPOSITE', `Recursive effect analysis at ${contract.id}`);
    const effects = new Set(contract.effects), capabilities = new Set(contract.capabilities);
    if (contract.kind === 'composite') {
      const nested = analyze(contract.graph, [...stack, contract.id]);
      for (const effect of nested.effects) effects.add(effect);
      for (const capability of nested.capabilities) capabilities.add(capability);
    }
    const summary = { effects: [...effects].sort(), capabilities: [...capabilities].sort() };
    summaries.set(contract.id, summary); return summary;
  }
  function analyze(current, stack) {
    validateGraph(current, registry);
    const effects = new Set(), capabilities = new Set(), nodes = {};
    for (const node of current.nodes) {
      const summary = contractSummary(registry.resolve(node.uses), stack);
      Object.defineProperty(nodes, node.id, { value: summary, enumerable: true });
      for (const effect of summary.effects) effects.add(effect);
      for (const capability of summary.capabilities) capabilities.add(capability);
    }
    return { effects: [...effects].sort(), capabilities: [...capabilities].sort(), nodes };
  }
  return analyze(graph, [graph.id]);
}

/** Verify declared grants/allowed effects before any graph execution. Metadata is not OS isolation. */
export function checkGraphPolicy(graph, registry, { capabilities = [], allowedEffects = [] } = {}) {
  const summary = analyzeGraphEffects(graph, registry);
  const grants = new Set(capabilities), permitted = new Set(allowedEffects);
  for (const capability of summary.capabilities) {
    if (!grants.has(capability)) fail('PERMISSION_DENIED', `Graph requires ${capability}`, { capability });
  }
  for (const effect of summary.effects) {
    if (!permitted.has(effect)) fail('EFFECT_DENIED', `Graph declares ${effect}`, { effect });
  }
  return summary;
}
