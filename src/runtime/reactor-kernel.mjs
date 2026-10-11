import {fail} from '../reference/errors.mjs';
import {assertTypeName,assertValueType} from '../reference/types.mjs';
import {validateControlInputs} from '../semantics/control-algebraic.mjs';
import {assertPolicyNames} from '../semantics/effects.mjs';
import {assertSignal,checkCancellation} from './cancellation.mjs';

const copy = value => structuredClone(value);
const namePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
export function fields(value, required, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).length !== required.length || required.some(key => !Object.hasOwn(value, key)))
    fail('INVALID_REACTOR', `${at}: expected exactly ${required.join(', ')}`);
}
export function declarations(state) {
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

/** Shared execution-owned FIFO transaction engine. Handler callbacks are trusted linked implementations. */
export class ReactorKernel {
  #slots; #values; #handlers = new Map(); #policy; #maxQueue; #recordTrace;
  #queue = []; #running = false; #closed = false; #active = null; #idle = []; #trace = []; #next = 0;
  constructor(state, handlers, { policy = {}, maxQueue = 64, recordTrace = false } = {}) {
    if (!Number.isSafeInteger(maxQueue) || maxQueue < 1) fail('INVALID_REACTOR', 'maxQueue must be a positive safe integer');
    if (typeof recordTrace !== 'boolean') fail('INVALID_REACTOR', 'recordTrace must be Boolean');
    this.#slots = declarations(state);
    this.#values = new Map([...this.#slots].map(([id, slot]) => [id, copy(slot.initial)]));
    fields(policy, Object.keys(policy), 'policy');
    if (Object.keys(policy).some(key => !['capabilities', 'allowedEffects'].includes(key))) fail('INVALID_POLICY', 'Unknown policy field');
    assertPolicyNames(Object.hasOwn(policy, 'capabilities') ? policy.capabilities : [], 'capabilities');
    assertPolicyNames(Object.hasOwn(policy, 'allowedEffects') ? policy.allowedEffects : [], 'allowedEffects');
    this.#policy = copy(policy); this.#maxQueue = maxQueue; this.#recordTrace = recordTrace;
    for (const handler of handlers) {
      if (typeof handler.event !== 'string' || !namePattern.test(handler.event) || this.#handlers.has(handler.event))
        fail('INVALID_REACTOR', 'Invalid or duplicate event name');
      this.#handlers.set(handler.event, handler);
    }
  }
  snapshot() { return Object.fromEntries([...this.#values].map(([id, value]) => [id, copy(value)])); }
  trace() { return copy(this.#trace); }
  async dispatch(event, inputs = {}, { signal,onControlEnter,onNodeEnter,onFrameExit } = {}) {
    if (this.#closed) fail('SESSION_CLOSED', 'Reactor session is closed');
    for(const hook of [onControlEnter,onNodeEnter,onFrameExit])if(hook!==undefined&&typeof hook!=='function')fail('INVALID_OPTION','Expected diagnostic observer');
    assertSignal(signal);
    const handler = this.#handlers.get(event);
    if (!handler) fail('UNKNOWN_EVENT', `Unknown reactor event ${event}`);
    validateControlInputs({ inputs: handler.inputs }, inputs);
    handler.checkPolicy(this.#policy);
    if (this.#queue.length >= this.#maxQueue) fail('QUEUE_FULL', 'Reactor event queue is full');
    const payload = copy(inputs);
    return new Promise((resolve, reject) => {
      this.#queue.push({ sequence: this.#next++, event, inputs: payload, handler, signal,onControlEnter,onNodeEnter,onFrameExit, resolve, reject });
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
        const result = await job.handler.execute(job.inputs, {
          ...this.#policy, signal: controller.signal, state,onControlEnter:job.onControlEnter,onNodeEnter:job.onNodeEnter,onFrameExit:job.onFrameExit
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

