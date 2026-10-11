import { fail } from '../reference/errors.mjs';
import { assertSignal, checkCancellation } from './cancellation.mjs';
import { parseControlType, assertControlValueType, cloneControlValue } from '../semantics/control-algebraic.mjs';

export function streamBudgetOptions(options) {
  const maxStreams = options.maxStreams ?? 64, maxStreamCapacity = options.maxStreamCapacity ?? 1024,
    maxPendingStreamOps = options.maxPendingStreamOps ?? 64;
  for (const [name, value, upper] of [['maxStreams',maxStreams,1024],['maxStreamCapacity',maxStreamCapacity,65536],['maxPendingStreamOps',maxPendingStreamOps,100000]])
    if (!Number.isSafeInteger(value) || value < 1 || value > upper) fail('INVALID_BUDGET', 'Invalid ' + name);
  return { maxStreams, maxStreamCapacity, maxPendingStreamOps };
}

/** Bounded FIFO channels and snapshot sources owned by one execution. No user thenable/iterator is invoked. */
export function createStreamScope(options) {
  assertSignal(options.signal); checkCancellation(options.signal);
  const { maxStreams, maxStreamCapacity, maxPendingStreamOps } = streamBudgetOptions(options);
  const streams = new WeakMap(), states = []; let ended = false, pending = 0;
  function check(handle, type) {
    const state = handle !== null && typeof handle === 'object' ? streams.get(handle) : null;
    return !!state && state.type === type && !ended;
  }
  function state(handle) {
    checkCancellation(options.signal);
    if (ended) fail('STREAM_SCOPE', 'Stream scope has ended');
    const value = handle !== null && typeof handle === 'object' ? streams.get(handle) : null;
    if (!value) fail('TYPE_MISMATCH', 'Expected execution-owned Stream');
    return value;
  }
  function allocate(type, capacity, values = null) {
    checkCancellation(options.signal);
    if (ended) fail('STREAM_SCOPE', 'Stream scope has ended');
    parseControlType(type);
    if (states.length >= maxStreams) fail('STREAM_LIMIT', 'Control stream budget exhausted', { maxStreams });
    const handle = Object.freeze(Object.create(null)), value = { type, capacity, values, index: 0, buffer: [], readers: [], writers: [], closed: false };
    streams.set(handle, value); states.push(value); return handle;
  }
  function channel(type, capacity) {
    checkCancellation(options.signal);
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > maxStreamCapacity)
      fail('STREAM_CAPACITY', 'Channel capacity is outside limits', { capacity, maxStreamCapacity });
    return allocate(type, capacity);
  }
  function fromArray(values) {
    checkCancellation(options.signal);
    assertControlValueType(values, 'NumberArray', 'stream source'); return allocate('Number', 0, [...values]);
  }
  function enqueue(queue, value) {
    if (pending >= maxPendingStreamOps) fail('STREAM_PENDING_LIMIT', 'Control stream wait budget exhausted', { maxPendingStreamOps });
    pending++; return new Promise((resolve, reject) => queue.push({ value, resolve, reject }));
  }
  function shift(queue) { pending--; return queue.shift(); }
  function some(value) { return { tag: 'Some', value: cloneControlValue(value) }; }
  function next(handle) {
    const value = state(handle);
    if (value.values !== null) return Promise.resolve(value.closed || value.index >= value.values.length ? { tag: 'None' } : some(value.values[value.index++]));
    if (value.buffer.length) {
      const item = value.buffer.shift();
      if (value.writers.length) { const writer = shift(value.writers); value.buffer.push(writer.value); writer.resolve(true); }
      return Promise.resolve(some(item));
    }
    if (value.closed) return Promise.resolve({ tag: 'None' });
    return enqueue(value.readers);
  }
  function send(handle, item) {
    const value = state(handle);
    assertControlValueType(item, value.type, 'stream send');
    if (value.values !== null || value.closed) fail('STREAM_CLOSED', 'Stream does not accept sends');
    const copy = cloneControlValue(item);
    if (value.readers.length) { shift(value.readers).resolve(some(copy)); return Promise.resolve(true); }
    if (value.buffer.length < value.capacity) { value.buffer.push(copy); return Promise.resolve(true); }
    return enqueue(value.writers, copy);
  }
  function close(handle) {
    const value = state(handle);
    if (value.closed) return false;
    value.closed = true;
    while (value.readers.length) shift(value.readers).resolve({ tag: 'None' });
    while (value.writers.length) {
      const writer = shift(value.writers); try { fail('STREAM_CLOSED', 'Stream closed before send completed'); } catch (error) { writer.reject(error); }
    }
    return true;
  }
  function abort() {
    for (const value of states) {
      value.closed = true; value.buffer.length = 0; value.values = null;
      for (const queue of [value.readers, value.writers]) while (queue.length) {
        const waiter = shift(queue); try { fail('CANCELLED', 'EMS execution cancelled'); } catch (error) { waiter.reject(error); }
      }
    }
  }
  options.signal?.addEventListener('abort', abort, { once: true });
  function finish() { ended = true; options.signal?.removeEventListener('abort', abort); abort(); }
  return { check, channel, fromArray, next, send, close, finish };
}

/** Typed language intrinsics shared verbatim by interpreter and standalone emitter. */
export function executeStreamOperation(operation, type, args, streams, futures) {
  switch (operation) {
    case 'channel': return streams.channel(type.slice(7,-1), args[0]);
    case 'fromArray': return streams.fromArray(args[0]);
    case 'next': return futures.start(type.slice(7,-1), () => streams.next(args[0]));
    case 'send': { const value = cloneControlValue(args[1]); return futures.start('Boolean', () => streams.send(args[0], value)); }
    case 'close': return streams.close(args[0]);
  }
  fail('INVALID_IR', 'Unknown stream operation');
}
