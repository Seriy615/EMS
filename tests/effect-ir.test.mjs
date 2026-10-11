import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoreRegistry, executeGraph, compileStandaloneJS } from '../src/reference/index.mjs';
import { EFFECT_PROFILE, lowerGraphToIR, serializeIR, parseIR, graphFromIR, executeIR, compileIRToJS } from '../src/ir/index.mjs';

function fixture() {
  const calls = [];
  const registry = createCoreRegistry();
  for (const id of ['first', 'second']) registry.registerAtomic({ id: `test.${id}`, inputs: {}, output: 'Number',
    effects: ['file.write'], capabilities: ['file.access'], execute: async () => { await Promise.resolve(); calls.push(id); return calls.length; } });
  const graph = { schemaVersion: '0.1', id: 'test.sequence', version: '1.0.0', inputs: {}, output: { type: 'Number' },
    nodes: [{ id: 'z', uses: 'test.first', args: {} }, { id: 'a', uses: 'test.second', args: {} }],
    sequence: ['z', 'a'], returns: { literal: 42 } };
  return { graph, registry, calls };
}
const grants = { capabilities: ['file.access'], allowedEffects: ['file.write'] };
const lower = (graph, registry) => lowerGraphToIR(graph, registry, { profile: EFFECT_PROFILE });

test('effect IR preserves explicit order through canonical JSON and operation permutation', async () => {
  const { graph, registry, calls } = fixture();
  const ir = lower(graph, registry);
  assert.deepEqual(ir.operations.map(op => op.id), ['a', 'z']);
  assert.deepEqual(ir.sequence, ['z', 'a']);
  assert.deepEqual(ir.policy, { effects: ['file.write'], capabilities: ['file.access'] });
  const restored = parseIR(serializeIR(ir, registry), registry);
  assert.equal(await executeIR(restored, {}, registry, grants), 42);
  assert.deepEqual(calls, ['first', 'second']);
  calls.length = 0;
  ir.operations.reverse();
  assert.equal(await executeIR(ir, {}, registry, grants), 42);
  assert.deepEqual(calls, ['first', 'second']);
  assert.equal(serializeIR(ir, registry), serializeIR(restored, registry));
});

test('sequenced calls shared by result execute exactly once', async () => {
  const { graph, registry, calls } = fixture(); graph.returns = { node: 'z' };
  assert.equal(await executeIR(lower(graph, registry), {}, registry, grants), 1);
  assert.deepEqual(calls, ['first', 'second']);
});

test('effect IR rejects forged global and per-operation metadata without executing', () => {
  const { graph, registry, calls } = fixture();
  for (const alter of [ir => { ir.policy.effects = []; }, ir => { ir.operations[0].policy.capabilities = []; },
    ir => { ir.policy.effects.push('file.write'); }]) {
    const ir = lower(graph, registry); alter(ir);
    assert.throws(() => graphFromIR(ir, registry), { code: 'EFFECT_MISMATCH' });
  }
  assert.deepEqual(calls, []);
});

test('sequence rejects omissions, unknown IDs, duplicates and invalid containers', () => {
  const { graph, registry } = fixture();
  for (const sequence of [[], ['z'], ['z', 'a', 'a'], ['z', 'unknown'], 'za', null, Array(2)]) {
    assert.throws(() => lower({ ...graph, sequence }, registry), { code: 'EFFECT_SEQUENCE' });
  }
  delete graph.sequence;
  assert.throws(() => lower(graph, registry), { code: 'EFFECT_SEQUENCE' });
});

test('sequence cannot reverse a dependency through pure nodes', async () => {
  const { graph, registry, calls } = fixture();
  registry.registerAtomic({ id: 'test.consumer', inputs: { value: 'Number' }, output: 'Number', effects: ['file.write'],
    execute: ({ value }) => { calls.push('consumer'); return value; } });
  graph.nodes.push({ id: 'pure', uses: 'core.add', args: { a: { node: 'a' }, b: { literal: 0 } } },
    { id: 'consumer', uses: 'test.consumer', args: { value: { node: 'pure' } } });
  graph.sequence = ['z', 'consumer', 'a'];
  await assert.rejects(executeGraph(graph, {}, registry, grants), { code: 'EFFECT_SEQUENCE' });
  assert.deepEqual(calls, []);
  graph.sequence = ['z', 'a', 'consumer'];
  assert.equal(await executeIR(lower(graph, registry), {}, registry, grants), 42);
  assert.deepEqual(calls, ['first', 'second', 'consumer']);
});

test('sequence failure aborts later effects and preserves the original error', async () => {
  const { graph, registry, calls } = fixture();
  const error = new Error('host failed');
  registry.registerAtomic({ id: 'test.fail', inputs: {}, output: 'Number', effects: ['file.write'], execute: () => { throw error; } });
  graph.nodes.push({ id: 'fail', uses: 'test.fail', args: {} }); graph.sequence = ['z', 'fail', 'a'];
  await assert.rejects(executeIR(lower(graph, registry), {}, registry, grants), e => e === error);
  assert.deepEqual(calls, ['first']);
});

test('nested sequences are preflighted before outer effects and execute in nested order', async () => {
  const { graph, registry, calls } = fixture();
  registry.registerComposite({ id: graph.id, graph });
  const outer = { ...graph, id: 'test.outer', nodes: [graph.nodes[0], { id: 'nested', uses: graph.id, args: {} }], sequence: ['z', 'nested'] };
  const ir = lower(outer, registry);
  assert.equal(await executeIR(ir, {}, registry, grants), 42);
  assert.deepEqual(calls, ['first', 'first', 'second']);
  calls.length = 0; graph.sequence = ['z'];
  await assert.rejects(executeGraph(outer, {}, registry, grants), { code: 'EFFECT_SEQUENCE' });
  assert.deepEqual(calls, []);
});

test('policy denial and unsupported compiler cannot silently erase sequenced effects', async () => {
  const { graph, registry, calls } = fixture(); const ir = lower(graph, registry);
  await assert.rejects(executeIR(ir, {}, registry), { code: 'PERMISSION_DENIED' });
  assert.throws(() => compileIRToJS(ir, registry), { code: 'UNSUPPORTED_TARGET' });
  assert.throws(() => compileStandaloneJS(graph, registry), { code: 'UNSUPPORTED_TARGET' });
  assert.throws(() => lowerGraphToIR(graph, registry), { code: 'UNSUPPORTED_PROFILE' });
  assert.deepEqual(calls, []);
});

test('pure compiler rejects effects hidden in an unused composite', () => {
  const { graph, registry, calls } = fixture();
  registry.registerComposite({ id: graph.id, graph });
  const outer = { ...graph, id: 'test.unused', nodes: [{ id: 'unused', uses: graph.id, args: {} }], returns: { literal: 1 } };
  delete outer.sequence;
  assert.throws(() => compileStandaloneJS(outer, registry), { code: 'UNSUPPORTED_TARGET' });
  assert.deepEqual(calls, []);
});

test('pure compiler preserves nested pure sequences while core IR rejects erasure', async () => {
  const registry = createCoreRegistry();
  const inner = { schemaVersion: '0.1', id: 'test.pure.sequence', version: '1.0.0', inputs: {}, output: { type: 'Number' },
    nodes: [{ id: 'sum', uses: 'core.div', args: { a: { literal: 1 }, b: { literal: 0 } } }], sequence: ['sum'], returns: { literal: 1 } };
  registry.registerComposite({ id: inner.id, graph: inner });
  const outer = { ...inner, id: 'test.pure.outer', nodes: [{ id: 'unused', uses: inner.id, args: {} }] };
  delete outer.sequence;
  outer.sequence = ['unused'];
  const module = await import(`data:text/javascript,${encodeURIComponent(compileStandaloneJS(outer, registry))}`);
  assert.throws(() => module.execute({}), { code: 'DIV_BY_ZERO' });
  assert.throws(() => lowerGraphToIR(outer, registry), { code: 'UNSUPPORTED_PROFILE' });
});
