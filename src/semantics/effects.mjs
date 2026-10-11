import { resolveCompositeBoundary } from '../contracts/conditions.mjs';
import { fail } from '../reference/errors.mjs';
import { validateGraph } from '../reference/validate.mjs';

/** Validate explicit declaration/grant lists; a string is never an implicit list. */
export function assertPolicyNames(names, label) {
  if (!Array.isArray(names) || names.some(name => typeof name !== 'string' || !/^[-a-zA-Z0-9_.]+$/.test(name)) ||
      Object.keys(names).length !== names.length || Object.keys(names).some((key,index)=>key!==String(index)) ||
      new Set(names).size !== names.length)
    fail('INVALID_POLICY', `${label} must be a dense array of unique nonempty policy names`, { field: label });
}

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
    const declaredEffects = Object.hasOwn(current, 'effects') ? current.effects : [];
    const declaredCapabilities = Object.hasOwn(current, 'capabilities') ? current.capabilities : [];
    assertPolicyNames(declaredEffects, 'effects');
    assertPolicyNames(declaredCapabilities, 'capabilities');
    const boundary=resolveCompositeBoundary(current,registry);
    const effects = new Set([...declaredEffects,...(boundary?.semantics.effects??[])]), capabilities = new Set([...declaredCapabilities,...(boundary?.semantics.capabilities??[])]), nodes = {};
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
  assertPolicyNames(capabilities, 'capabilities');
  assertPolicyNames(allowedEffects, 'allowedEffects');
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

/** An explicit sequence must cover every observable call and respect data dependencies. */
export function validateEffectSequence(graph, registry, { required = false } = {}) {
  return validateSequence(graph, registry, required, new Map());
}
function validateSequence(graph, registry, required, inspected) {
  if (inspected.has(graph)) return inspected.get(graph);
  const summary = analyzeGraphEffects(graph, registry);
  inspected.set(graph, summary);
  for (const id of new Set(graph.nodes.map(node => node.uses))) {
    const contract = registry.resolve(id);
    if (contract.kind === 'composite') validateSequence(contract.graph, registry, required, inspected);
  }
  const observable = new Set(Object.entries(summary.nodes)
    .filter(([, policy]) => policy.effects.length || policy.capabilities.length).map(([id]) => id));
  if (!Object.hasOwn(graph, 'sequence')) {
    if (required && observable.size) fail('EFFECT_SEQUENCE', 'Observable calls require an explicit sequence');
    return summary;
  }
  const sequence = graph.sequence;
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  if (!Array.isArray(sequence) || Object.keys(sequence).length !== sequence.length ||
      sequence.some(id => typeof id !== 'string' || !nodes.has(id)) || new Set(sequence).size !== sequence.length)
    fail('EFFECT_SEQUENCE', 'Sequence must contain unique existing node IDs');
  const positions = new Map(sequence.map((id, index) => [id, index]));
  for (const id of observable) if (!positions.has(id)) fail('EFFECT_SEQUENCE', `Sequence omits observable node ${id}`);
  for (const [id, index] of positions) {
    const seen = new Set();
    function dependency(node) {
      if (seen.has(node.id)) return;
      seen.add(node.id);
      for (const ref of Object.values(node.args)) if (Object.hasOwn(ref, 'node')) {
        if (positions.has(ref.node) && positions.get(ref.node) >= index)
          fail('EFFECT_SEQUENCE', `${id} depends on later sequenced node ${ref.node}`);
        dependency(nodes.get(ref.node));
      }
    }
    dependency(nodes.get(id));
  }
  return summary;
}
