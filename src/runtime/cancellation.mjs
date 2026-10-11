import { fail } from '../reference/errors.mjs';

export function assertSignal(signal) {
  if (signal !== undefined && (!signal || typeof signal.aborted !== 'boolean' ||
      typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function'))
    fail('INVALID_SIGNAL', 'Expected an AbortSignal');
}
export function checkCancellation(signal) {
  if (signal?.aborted) fail('CANCELLED', 'EMS execution cancelled');
}

/** Stop awaiting a cancelled host future. The host must cooperate to stop its own external work. */
export function awaitCancellable(value, signal) {
  if (!signal) return Promise.resolve(value);
  return new Promise((resolve, reject) => {
    const finish = (callback, result) => { signal.removeEventListener('abort', abort); callback(result); };
    const abort = () => {
      try { checkCancellation(signal); } catch (error) { finish(reject, error); }
    };
    // Always attach a rejection handler, even when already aborted.
    Promise.resolve(value).then(result => finish(resolve, result), error => finish(reject, error));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
