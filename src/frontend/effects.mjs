import { fail } from '../reference/errors.mjs';
import { analyzeGraphEffects, assertPolicyNames } from '../semantics/effects.mjs';

/** Infer conservative call effects without executing bindings; requirements are interface budgets. */
export function checkModuleEffects(checked, registry) {
  const entries = new Map(), linked = new Map();
  const diagnostic = (code, message, node) => fail(code, message, { location: node?.location });
  function contractPolicy(contract) {
    if (linked.has(contract.id)) return linked.get(contract.id);
    const policy = contract.kind === 'composite' ? analyzeGraphEffects(contract.graph, registry)
      : { effects: contract.effects, capabilities: contract.capabilities };
    const result = { effects: [...new Set([...contract.effects, ...policy.effects])],
      capabilities: [...new Set([...contract.capabilities, ...policy.capabilities])] };
    linked.set(contract.id, result); return result;
  }
  for (const target of checked.signatures.values()) {
    const declared = { effects: [], capabilities: [] }, requirements = target.declaration.requirements;
    let pure = false;
    for (const requirement of requirements) {
      if (requirement.name === 'pure') {
        if (pure) diagnostic('INVALID_REQUIREMENT', 'Duplicate pure requirement', requirement);
        pure = true;
      } else {
        const field = new Map([['effect', 'effects'], ['capability', 'capabilities']]).get(requirement.name);
        if (!field) diagnostic('INVALID_REQUIREMENT', `Unknown requirement ${requirement.name}`, requirement);
        declared[field].push(requirement.value);
      }
    }
    try { for (const field of ['effects', 'capabilities']) assertPolicyNames(declared[field], field); }
    catch (error) { diagnostic(error.code, error.message, target.declaration); }
    if (pure && (declared.effects.length || declared.capabilities.length))
      diagnostic('INVALID_REQUIREMENT', 'pure cannot be combined with effects or capabilities', target.declaration);
    const entry = { target, declared, pure, explicit: requirements.length > 0,
      effects: new Set(declared.effects), capabilities: new Set(declared.capabilities), calls: [] };
    if (target.declaration.external && registry.items.has(target.name)) {
      const policy = contractPolicy(registry.resolve(target.name));
      for (const field of ['effects', 'capabilities']) for (const value of policy[field]) entry[field].add(value);
    }
    const pending = target.declaration.body ? [target.declaration.body] : [];
    while (pending.length) {
      const node = pending.pop();
      if (!node || typeof node !== 'object') continue;
      const call = checked.calls.get(node);
      if (call?.target) entry.calls.push({ target: call.target, node });
      for (const [key, value] of Object.entries(node)) {
        if (key === 'location') continue;
        if (Array.isArray(value)) pending.push(...value);
        else if (value && typeof value === 'object') pending.push(value);
      }
    }
    entries.set(target.name, entry);
  }
  const dependents = new Map([...entries.keys()].map(name => [name, new Set()]));
  for (const entry of entries.values()) for (const call of entry.calls) {
    if (call.target.contract) {
      const policy = contractPolicy(call.target.contract);
      for (const field of ['effects', 'capabilities']) for (const value of policy[field]) entry[field].add(value);
    } else dependents.get(call.target.name).add(entry.target.name);
  }
  const queue = [...entries.keys()], queued = new Set(queue);
  for (let index = 0; index < queue.length; index++) {
    const name = queue[index]; queued.delete(name);
    const source = entries.get(name);
    for (const parent of dependents.get(name)) {
      const destination = entries.get(parent); let changed = false;
      for (const field of ['effects', 'capabilities']) for (const value of source[field]) {
        if (!destination[field].has(value)) { destination[field].add(value); changed = true; }
      }
      if (changed && !queued.has(parent)) { queue.push(parent); queued.add(parent); }
    }
  }
  const policies = new Map();
  for (const [name, entry] of entries) {
    for (const field of ['effects', 'capabilities']) {
      if (entry.explicit && [...entry[field]].some(value => !entry.declared[field].includes(value)))
        diagnostic('EFFECT_MISMATCH', `${name}: inferred ${field} exceed declared requirements`, entry.target.declaration);
    }
    policies.set(name, { effects: [...entry.effects].sort(), capabilities: [...entry.capabilities].sort() });
  }
  return policies;
}
