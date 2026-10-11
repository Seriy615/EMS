import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoreRegistry, executeGraph } from '../src/reference/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import { executeIR, compileIRToJS } from '../src/ir/index.mjs';
import { createStateRegistry, ReactorSession, replayEvents } from '../src/runtime/reactor.mjs';

const policy = { capabilities: ['state.read', 'state.write'], allowedEffects: ['state.read', 'state.write'] };
const source = 'fn update(delta: Number, denominator: Number) -> Number { let next = state.count.read() + delta; state.count.write(next); return next / denominator; }';
function fixture({ initial = 0, extra = registry => registry, program = source } = {}) {
  const state = [{ id: 'count', type: 'Number', initial }];
  const base = extra(createStateRegistry(createCoreRegistry(), state));
  const bundle = lowerCheckedModule(typecheckModule(parseEMSModule(program), base), 'update', base);
  const manifest = { schemaVersion: 'ems-reactor/1', id: 'test.counter', version: '1.0.0', state,
    handlers: [{ event: 'update', program: bundle.ir }] };
  return { bundle, manifest, session: options => new ReactorSession(manifest, bundle.registry, { policy, recordTrace: true, ...options }) };
}

test('textual state contracts run in isolated event transactions and replay deterministically', async () => {
  const f = fixture(); const first = f.session();
  const events = [{ event: 'update', inputs: { delta: 2, denominator: 1 } },
    { event: 'update', inputs: { delta: 3, denominator: 1 } }, { event: 'update', inputs: { delta: -1, denominator: 1 } }];
  const outputs = await Promise.all(events.map(event => first.dispatch(event.event, event.inputs)));
  assert.deepEqual(outputs, [2, 5, 4]); assert.deepEqual(first.snapshot(), { count: 4 });
  const second = f.session();
  assert.deepEqual(await replayEvents(second, first.trace()), outputs.map(result => ({ status: 'committed', result })));
  assert.deepEqual(first.trace(), second.trace());
  assert.deepEqual(first.trace().map(entry => entry.sequence), [0, 1, 2]);
  assert.throws(() => compileIRToJS(f.bundle.ir, f.bundle.registry), { code: 'UNSUPPORTED_TARGET' });
  await first.close(); await second.close();
});

test('failed events roll back writes and later events see only committed state', async () => {
  const f = fixture(), session = f.session();
  assert.equal(await session.dispatch('update', { delta: 2, denominator: 1 }), 2);
  await assert.rejects(session.dispatch('update', { delta: 10, denominator: 0 }), { code: 'DIV_BY_ZERO' });
  assert.deepEqual(session.snapshot(), { count: 2 });
  assert.equal(await session.dispatch('update', { delta: 1, denominator: 1 }), 3);
  assert.deepEqual(session.trace().map(entry => entry.status), ['committed', 'failed', 'committed']);
  const replay = f.session(); await replayEvents(replay, session.trace()); assert.deepEqual(session.trace(), replay.trace());
});

test('session state, input payloads, output arrays, snapshots and traces do not alias caller memory', async () => {
  const state = [{ id: 'values', type: 'NumberArray', initial: [1] }];
  const base = createStateRegistry(createCoreRegistry(), state);
  const bundle = lowerCheckedModule(typecheckModule(parseEMSModule('fn update(values: Number[]) -> Number[] { return state.values.write(values); }'), base), 'update', base);
  const manifest = { schemaVersion: 'ems-reactor/1', id: 'test.arrays', version: '1.0.0', state, handlers: [{ event: 'update', program: bundle.ir }] };
  const first = new ReactorSession(manifest, bundle.registry, { policy, recordTrace: true });
  const second = new ReactorSession(manifest, bundle.registry, { policy });
  state[0].initial.push(999); manifest.handlers[0].program.result = { kind: 'literal', type: 'NumberArray', value: [] };
  const input = { values: [2, 3] }, pending = first.dispatch('update', input); input.values.push(4);
  const result = await pending; result.push(5);
  const snapshot = first.snapshot(); snapshot.values.push(6);
  const trace = first.trace(); trace[0].after.values.push(7);
  assert.deepEqual(first.snapshot(), { values: [2, 3] }); assert.deepEqual(second.snapshot(), { values: [1] });
  assert.deepEqual(first.trace()[0].result, [2, 3]); assert.deepEqual(second.trace(), []);
});

test('state access outside an event transaction and ungranted events fail explicitly', async () => {
  const f = fixture();
  await assert.rejects(executeIR(f.bundle.ir, { delta: 1, denominator: 1 }, f.bundle.registry, policy), { code: 'STATE_CONTEXT' });
  const session = f.session({ policy: {} });
  await assert.rejects(session.dispatch('update', { delta: 1, denominator: 1 }), { code: 'PERMISSION_DENIED' });
  assert.deepEqual(session.snapshot(), { count: 0 }); assert.deepEqual(session.trace(), []);
  await assert.rejects(session.dispatch('missing'), { code: 'UNKNOWN_EVENT' });
  await assert.rejects(session.dispatch('update', { delta: 'bad', denominator: 1 }), { code: 'TYPE_MISMATCH' });
});

test('bounded queue rejects overflow and never runs events concurrently', async () => {
  let release, began;
  const started = new Promise(resolve => { began = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const f = fixture({ program: 'fn update(delta: Number) -> Number { host.wait(); return state.count.write(state.count.read() + delta); }',
    extra: registry => registry.registerAtomic({ id: 'host.wait', inputs: {}, output: 'Number', execute: async () => { calls++; began(); await blocked; return 0; } }) });
  const session = f.session({ maxQueue: 1 });
  const first = session.dispatch('update', { delta: 1 }); await started;
  const second = session.dispatch('update', { delta: 2 });
  await assert.rejects(session.dispatch('update', { delta: 3 }), { code: 'QUEUE_FULL' });
  assert.equal(calls, 1); release();
  assert.deepEqual(await Promise.all([first, second]), [1, 3]); assert.equal(calls, 2);
});

test('active cancellation rolls back and late host work cannot mutate ended transactions', async () => {
  let release, began, savedContext;
  const started = new Promise(resolve => { began = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  const f = fixture({ program: 'fn update(delta: Number) -> Number { state.count.write(delta); host.wait(); return state.count.read(); }',
    extra: registry => registry.registerAtomic({ id: 'host.wait', inputs: {}, output: 'Number',
      execute: async (_, context) => { savedContext = context; began(); await blocked; return 0; } }) });
  const session = f.session(), controller = new AbortController();
  const pending = session.dispatch('update', { delta: 9 }, { signal: controller.signal });
  const rejected = assert.rejects(pending, { code: 'CANCELLED' }); await started; controller.abort(); await rejected;
  assert.equal(savedContext.signal.aborted, true); assert.deepEqual(session.snapshot(), { count: 0 });
  assert.throws(() => savedContext.state.write('count', 50), { code: 'CANCELLED' });
  release(); await Promise.resolve();
  assert.deepEqual(session.trace().map(entry => entry.status), ['cancelled']);
});

test('queued cancellation skips all handler calls, survives replay and leaves state intact', async () => {
  const f = fixture(), session = f.session(), controller = new AbortController();
  controller.abort();
  await assert.rejects(session.dispatch('update', { delta: 9, denominator: 1 }, { signal: controller.signal }), { code: 'CANCELLED' });
  assert.deepEqual(session.snapshot(), { count: 0 });
  const replay = f.session(); await replayEvents(replay, session.trace()); assert.deepEqual(replay.trace(), session.trace());
});

test('close cancels active and queued events and permanently rejects new dispatch', async () => {
  let began;
  const started = new Promise(resolve => { began = resolve; });
  const f = fixture({ program: 'fn update() -> Number { return host.wait(); }', extra: registry => registry.registerAtomic({
    id: 'host.wait', inputs: {}, output: 'Number', execute: () => { began(); return new Promise(() => {}); } }) });
  const session = f.session();
  const first = session.dispatch('update'); const firstDenied = assert.rejects(first, { code: 'CANCELLED' }); await started;
  const queued = session.dispatch('update'); const queuedDenied = assert.rejects(queued, { code: 'CANCELLED' });
  await session.close(); await Promise.all([firstDenied, queuedDenied]);
  await assert.rejects(session.dispatch('update'), { code: 'SESSION_CLOSED' }); await session.close();
  assert.deepEqual(session.trace().map(entry => entry.status), ['cancelled', 'cancelled']);
});

test('reactor rejects mismatched state bindings, malformed declarations and resource options', () => {
  const f = fixture();
  for (const state of [[{ id: 'count', type: 'String', initial: 'zero' }], [...f.manifest.state, ...f.manifest.state]])
    assert.throws(() => new ReactorSession({ ...f.manifest, state }, f.bundle.registry), error => ['INVALID_STATE_BINDING', 'INVALID_REACTOR'].includes(error.code));
  assert.throws(() => createStateRegistry(createCoreRegistry(), [{ id: 'bad', type: 'Number', initial: Infinity }]), { code: 'TYPE_MISMATCH' });
  assert.throws(() => f.session({ maxQueue: 0 }), { code: 'INVALID_REACTOR' });
  assert.throws(() => f.session({ policy: { capabilities: 'state.read' } }), { code: 'INVALID_POLICY' });
});

test('cancellation propagates through composites before and after awaiting host futures', async () => {
  const registry = createCoreRegistry(); let calls = 0, received;
  const controller = new AbortController();
  registry.registerAtomic({ id: 'host.cancel', inputs: {}, output: 'Number', execute: (_, context) => { calls++; received = context.signal; controller.abort(); return 1; } });
  const inner = { schemaVersion: '0.1', id: 'test.inner', version: '1.0.0', inputs: {}, output: { type: 'Number' }, nodes: [{ id: 'cancel', uses: 'host.cancel', args: {} }], returns: { node: 'cancel' } };
  registry.registerComposite({ id: inner.id, graph: inner });
  const outer = { ...inner, id: 'test.outer', nodes: [{ id: 'inner', uses: inner.id, args: {} }], returns: { node: 'inner' } };
  await assert.rejects(executeGraph(outer, {}, registry, { signal: controller.signal }), { code: 'CANCELLED' });
  assert.equal(received, controller.signal); assert.equal(calls, 1);
  await assert.rejects(executeGraph(outer, {}, registry, { signal: controller.signal }), { code: 'CANCELLED' }); assert.equal(calls, 1);
  await assert.rejects(executeGraph(outer, {}, registry, { signal: {} }), { code: 'INVALID_SIGNAL' });
});

test('a host throwing null fails one event without wedging the queue', async () => {
  let calls = 0;
  const f = fixture({ program: 'fn update() -> Number { return host.unusual(); }', extra: registry => registry.registerAtomic({
    id: 'host.unusual', inputs: {}, output: 'Number', execute: () => { if (!calls++) throw null; return 2; } }) });
  const session = f.session();
  const failed = session.dispatch('update').then(() => assert.fail('expected failure'), error => assert.equal(error, null));
  const second = session.dispatch('update');
  await failed; assert.equal(await second, 2); assert.deepEqual(session.trace().map(entry => entry.status), ['failed', 'committed']);
  assert.equal(session.trace()[0].error, 'HOST_ERROR'); await session.close();
});

test('late writes after successful completion are rejected and finite state types remain checked', async () => {
  let context;
  const f = fixture({ program: 'fn update() -> Number { host.capture(); return state.count.write(1); }', extra: registry => registry.registerAtomic({
    id: 'host.capture', inputs: {}, output: 'Number', execute: (_, ctx) => { context = ctx;
      assert.throws(() => ctx.state.write('count', Infinity), { code: 'TYPE_MISMATCH' });
      assert.throws(() => ctx.state.read('unknown'), { code: 'UNKNOWN_STATE' }); return 0; } }) });
  const session = f.session(); assert.equal(await session.dispatch('update'), 1);
  assert.throws(() => context.state.write('count', 2), { code: 'STATE_CONTEXT' });
  assert.deepEqual(session.snapshot(), { count: 1 });
});

test('in-memory state and replay preserve negative zero', async () => {
  const f = fixture({ initial: -0, program: 'fn update(delta: Number) -> Number { return state.count.write(delta); }' });
  const session = f.session(); assert.ok(Object.is(session.snapshot().count, -0));
  const result = await session.dispatch('update', { delta: -0 }); assert.ok(Object.is(result, -0));
  const replay = f.session(); await replayEvents(replay, session.trace());
  assert.ok(Object.is(replay.snapshot().count, -0)); assert.deepEqual(replay.trace(), session.trace());
});
