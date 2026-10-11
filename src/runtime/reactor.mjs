import { fail } from '../reference/errors.mjs';
import { Registry } from '../reference/registry.mjs';
import { assertTypeName, assertValueType } from '../reference/types.mjs';
import { validateRuntimeInputs } from '../reference/validate.mjs';
import { checkGraphPolicy, assertPolicyNames } from '../semantics/effects.mjs';
import { graphFromIR, executeIR } from '../ir/index.mjs';
import { assertSignal, checkCancellation } from './cancellation.mjs';

const copy = value => structuredClone(value);
const namePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
function fields(value, required, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).length !== required.length || required.some(key => !Object.hasOwn(value, key)))
    fail('INVALID_REACTOR', `${at}: expected exactly ${required.join(', ')}`);
}
function declarations(state) {
  if (!Array.isArray(state) || Object.keys(state).length !== state.length) fail('INVALID_REACTOR', 'Expected dense state declarations');
  const slots = new Map();
  for (const slot of state) {
    fields(slot, ['id', 'type', 'initial'], 'state');
    if (typeof slot.id !== 'string' || !namePattern.test(slot.id) || slots.has(slot.id)) fail('INVALID_REACTOR', 'Invalid or duplicate state ID');
    assertTypeName(slot.type, `state.${slot.id}`); assertValueType(slot.initial, slot.type, `state.${slot.id}.initial`);
    slots.set(slot.id, { type: slot.type, initial: copy(slot.initial) });
  }
  return slots;
}
function copyRegistry(base) {
  const registry = new Registry();
  for (const contract of base.items.values()) {
    if (contract.kind === 'atomic') registry.registerAtomic(contract);
    else registry.registerComposite(contract);
  }
  return registry;
}
function stateContext(context) {
  if (!context?.state) fail('STATE_CONTEXT', 'State contracts require an active event transaction');
  return context.state;
}

/** Install typed state interfaces. Memory belongs to each reactor session, never to this registry. */
export function createStateRegistry(base, state) {
  const registry = copyRegistry(base);
  for (const [id, slot] of declarations(state)) {
    registry.registerAtomic({ id: `state.${id}.read`, inputs: {}, output: slot.type,
      effects: ['state.read'], capabilities: ['state.read'], execute: (_, context) => stateContext(context).read(id) });
    registry.registerAtomic({ id: `state.${id}.write`, inputs: { value: slot.type }, output: slot.type,
      effects: ['state.write'], capabilities: ['state.write'], execute: ({ value }, context) => stateContext(context).write(id, value) });
  }
  return registry;
}

/** Single-owner transactional event runner for finite EMS IR. No external-effect rollback or plugin sandbox. */
export class ReactorSession {
  #registry; #slots; #values; #handlers = new Map(); #policy; #maxQueue; #recordTrace;
  #queue = []; #running = false; #closed = false; #active = null; #idle = []; #trace = []; #next = 0;
  constructor(manifest, registry, { policy = {}, maxQueue = 64, recordTrace = false } = {}) {
    fields(manifest, ['schemaVersion', 'id', 'version', 'state', 'handlers'], 'reactor');
    if (manifest.schemaVersion !== 'ems-reactor/1') fail('REACTOR_VERSION', 'Expected ems-reactor/1');
    if (typeof manifest.id !== 'string' || !manifest.id || typeof manifest.version !== 'string' || !manifest.version)
      fail('INVALID_REACTOR', 'Reactor identity/version required');
    if (!Number.isSafeInteger(maxQueue) || maxQueue < 1) fail('INVALID_REACTOR', 'maxQueue must be a positive safe integer');
    if (typeof recordTrace !== 'boolean') fail('INVALID_REACTOR', 'recordTrace must be Boolean');
    this.#slots = declarations(manifest.state);
    this.#values = new Map([...this.#slots].map(([id, slot]) => [id, copy(slot.initial)]));
    this.#registry = copyRegistry(registry);
    for (const [id, slot] of this.#slots) for (const action of ['read', 'write']) {
      const binding = this.#registry.resolve(`state.${id}.${action}`);
      const inputs = Object.entries(binding.inputs).map(([name, spec]) => [name, typeof spec === 'string' ? spec : spec.type]);
      if (binding.kind !== 'atomic' || binding.output !== slot.type ||
          JSON.stringify(inputs) !== JSON.stringify(action === 'read' ? [] : [['value', slot.type]]) ||
          !binding.effects.includes(`state.${action}`) || !binding.capabilities.includes(`state.${action}`))
        fail('INVALID_STATE_BINDING', `State binding disagrees with ${id}.${action}`);
    }
    fields(policy, Object.keys(policy), 'policy');
    if (Object.keys(policy).some(key => !['capabilities', 'allowedEffects'].includes(key))) fail('INVALID_POLICY', 'Unknown policy field');
    assertPolicyNames(Object.hasOwn(policy, 'capabilities') ? policy.capabilities : [], 'capabilities');
    assertPolicyNames(Object.hasOwn(policy, 'allowedEffects') ? policy.allowedEffects : [], 'allowedEffects');
    this.#policy = copy(policy); this.#maxQueue = maxQueue; this.#recordTrace = recordTrace;
    if (!Array.isArray(manifest.handlers) || Object.keys(manifest.handlers).length !== manifest.handlers.length)
      fail('INVALID_REACTOR', 'Expected dense event handlers');
    for (const handler of manifest.handlers) {
      fields(handler, ['event', 'program'], 'handler');
      if (typeof handler.event !== 'string' || !namePattern.test(handler.event) || this.#handlers.has(handler.event))
        fail('INVALID_REACTOR', 'Invalid or duplicate event name');
      const program = copy(handler.program), graph = graphFromIR(program, this.#registry);
      this.#handlers.set(handler.event, { program, graph });
    }
  }
  snapshot() { return Object.fromEntries([...this.#values].map(([id, value]) => [id, copy(value)])); }
  trace() { return copy(this.#trace); }
  async dispatch(event, inputs = {}, { signal } = {}) {
    if (this.#closed) fail('SESSION_CLOSED', 'Reactor session is closed');
    assertSignal(signal);
    const handler = this.#handlers.get(event);
    if (!handler) fail('UNKNOWN_EVENT', `Unknown reactor event ${event}`);
    validateRuntimeInputs(handler.graph, inputs);
    checkGraphPolicy(handler.graph, this.#registry, this.#policy);
    if (this.#queue.length >= this.#maxQueue) fail('QUEUE_FULL', 'Reactor event queue is full');
    const payload = copy(inputs);
    return new Promise((resolve, reject) => {
      this.#queue.push({ sequence: this.#next++, event, inputs: payload, handler, signal, resolve, reject });
      if (!this.#running) { this.#running = true; queueMicrotask(() => this.#pump()); }
    });
  }
  async #pump() {
    while (this.#queue.length) {
      const job = this.#queue.shift(), controller = new AbortController();
      this.#active = controller;
      const abort = () => controller.abort();
      job.signal?.addEventListener('abort', abort, { once: true });
      if (this.#closed || job.signal?.aborted) controller.abort();
      const before = this.#recordTrace ? this.snapshot() : undefined;
      const draft = new Map([...this.#values].map(([id, value]) => [id, copy(value)]));
      let active = true;
      const slot = id => {
        checkCancellation(controller.signal);
        if (!active) fail('STATE_CONTEXT', 'Event transaction has ended');
        const declaration = this.#slots.get(id);
        if (!declaration) fail('UNKNOWN_STATE', `Unknown state ${id}`);
        return declaration;
      };
      const state = Object.freeze({
        read: id => { slot(id); return copy(draft.get(id)); },
        write: (id, value) => {
          const declaration = slot(id); assertValueType(value, declaration.type, `state.${id}`);
          draft.set(id, copy(value)); return copy(value);
        }
      });
      try {
        const result = await executeIR(job.handler.program, job.inputs, this.#registry, {
          ...this.#policy, signal: controller.signal, state
        });
        checkCancellation(controller.signal);
        const detachedResult = copy(result);
        active = false; this.#values = draft;
        if (this.#recordTrace) this.#trace.push({ sequence: job.sequence, event: job.event, inputs: copy(job.inputs),
          status: 'committed', result: copy(result), before, after: this.snapshot() });
        job.resolve(detachedResult);
      } catch (error) {
        active = false;
        if (this.#recordTrace) this.#trace.push({ sequence: job.sequence, event: job.event, inputs: copy(job.inputs),
          status: error?.code === 'CANCELLED' ? 'cancelled' : 'failed', error: error?.code ?? 'HOST_ERROR', before, after: this.snapshot() });
        job.reject(error);
      } finally {
        job.signal?.removeEventListener('abort', abort); this.#active = null;
      }
    }
    this.#running = false;
    for (const resolve of this.#idle.splice(0)) resolve();
  }
  async close() {
    this.#closed = true; this.#active?.abort();
    if (this.#running) await new Promise(resolve => this.#idle.push(resolve));
  }
}

/** Replay accepted event order. Determinism also requires deterministic bound host implementations. */
export async function replayEvents(session, events) {
  const outcomes = [];
  for (const event of events) {
    const controller = new AbortController();
    if (event.status === 'cancelled') controller.abort();
    try { outcomes.push({ status: 'committed', result: await session.dispatch(event.event, event.inputs, { signal: controller.signal }) }); }
    catch (error) { outcomes.push({ status: error?.code === 'CANCELLED' ? 'cancelled' : 'failed', error: error?.code ?? 'HOST_ERROR' }); }
  }
  return outcomes;
}
