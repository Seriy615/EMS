import { terminalControlError } from '../semantics/control-errors.mjs';
import { fail } from '../reference/errors.mjs';
import { assertSignal, checkCancellation, awaitCancellable } from './cancellation.mjs';

/** Execution-owned hot tasks. Handles have no then method and never cross serialized program boundaries. */
export function createFutureScope(options, validate) {
  assertSignal(options.signal); checkCancellation(options.signal);
  const maxFutures = options.maxFutures ?? 1024;
  if (!Number.isSafeInteger(maxFutures) || maxFutures < 1 || maxFutures > 100000)
    fail('INVALID_BUDGET', 'Expected future budget between 1 and 100000');
  const controller = new AbortController(), futures = new WeakMap(), tasks = [];
  let closed = false, terminalFailure;
  const relay = () => controller.abort();
  options.signal?.addEventListener('abort', relay, { once: true });
  if (options.signal?.aborted) relay();
  function failure(error) {
    if (terminalControlError(error)) { terminalFailure ??= error; controller.abort(); }
    return { error, failed: true };
  }
  function check(value, type) {
    const task = value !== null && typeof value === 'object' ? futures.get(value) : null;
    return !!task && task.type === type && !closed;
  }
  function start(type, operation) {
    checkCancellation(controller.signal);
    if (closed) fail('FUTURE_SCOPE', 'Future scope has ended');
    if (tasks.length >= maxFutures) fail('FUTURE_LIMIT', 'Control future budget exhausted', { maxFutures });
    const handle = Object.freeze(Object.create(null)), task = { type, observed: false };
    futures.set(handle, task); tasks.push(task);
    // Attach both outcome handlers immediately: abandoned failures are supervised, never unhandled rejections.
    task.outcome = Promise.resolve().then(() => {
      checkCancellation(controller.signal); return awaitCancellable(operation(), controller.signal);
    }).then(value => { checkCancellation(controller.signal); validate(value, type, 'future result'); return { value }; }, failure);
    // Validation can itself fail in the fulfillment handler.
    task.outcome = task.outcome.catch(failure);
    return handle;
  }
  async function wait(handle, type) {
    checkCancellation(controller.signal);
    if (!check(handle, type)) fail('TYPE_MISMATCH', 'Await requires an execution-owned typed Future');
    const task = futures.get(handle); task.observed = true;
    const outcome = await awaitCancellable(task.outcome, controller.signal);
    checkCancellation(controller.signal);
    if (outcome.failed) throw outcome.error;
    return outcome.value;
  }
  async function join() {
    // Tasks may create further tasks while settling. Join in creation order; caught await failures stay handled.
    for (let index = 0; index < tasks.length; index++) {
      const task = tasks[index], outcome = await awaitCancellable(task.outcome, controller.signal);
      if (outcome.failed && !task.observed) throw outcome.error;
    }
    checkCancellation(controller.signal);
  }
  async function abort() {
    controller.abort();
    // Every EMS task checks the signal or awaits cancellably. Uncooperative external work can outlive its EMS outcome.
    for (let index = 0; index < tasks.length; index++) await tasks[index].outcome;
  }
  function close() { closed = true; options.signal?.removeEventListener('abort', relay); }
  return { signal: controller.signal, start, wait, join, abort, close, check, terminalFailure: () => terminalFailure };
}
