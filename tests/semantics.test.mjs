import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCoreRegistry, executeGraph, compileStandaloneJS, validateGraph } from '../src/reference/index.mjs';

const fixtures = JSON.parse(await readFile(new URL('./fixtures/semantics.json', import.meta.url), 'utf8'));
const compiled = async (graph, registry) => (await import(`data:text/javascript,${encodeURIComponent(compileStandaloneJS(graph, registry))}`)).execute;
const outcome = async invoke => {
  try { return { value: await invoke() }; }
  catch (error) { return { error: error.code, name: error.name, details: error.details }; }
};
const graph = (inputs, nodes = [], returns = { input: 'x' }, type = 'Number') => ({
  schemaVersion: '0.1', id: 'conformance.test', version: '0.1.0',
  inputs, output: { type }, nodes, returns
});

for (const vector of fixtures.vectors) {
  test(`AC-025 ${fixtures.profile}: ${vector.id}`, async () => {
    const registry = createCoreRegistry();
    const execute = await compiled(vector.graph, registry);
    const interpreted = await outcome(() => executeGraph(vector.graph, vector.inputs, registry));
    const standalone = await outcome(() => execute(vector.inputs));
    assert.deepEqual(standalone, interpreted);
    if (vector.expected.error) {
      assert.equal(interpreted.error, vector.expected.error);
      assert.equal(interpreted.name, 'EmsError');
    } else {
      assert.deepEqual(interpreted, { value: vector.expected.value });
      if (vector.expected.negativeZero) assert.ok(Object.is(standalone.value, -0));
    }
  });
}

for (const [label, inputs, expected] of [
  ['null', null, 'INVALID_INPUT'],
  ['array envelope', [], 'INVALID_INPUT'],
  ['missing own input', {}, 'MISSING_INPUT'],
  ['inherited input', Object.create({ x: 1 }), 'MISSING_INPUT'],
  ['extra input', { x: 1, extra: 2 }, 'EXTRA_INPUT'],
  ['NaN', { x: NaN }, 'TYPE_MISMATCH'],
  ['Infinity', { x: Infinity }, 'TYPE_MISMATCH'],
  ['negative Infinity', { x: -Infinity }, 'TYPE_MISMATCH'],
  ['string coercion', { x: '1' }, 'TYPE_MISMATCH']
]) {
  test(`AC-025 input boundary: ${label}`, async () => {
    const program = graph({ x: { type: 'Number' } });
    const registry = createCoreRegistry();
    const execute = await compiled(program, registry);
    const reference = await outcome(() => executeGraph(program, inputs, registry));
    assert.equal(reference.error, expected);
    assert.deepEqual(await outcome(() => execute(inputs)), reference);
  });
}

test('AC-025 sparse and nonfinite arrays are rejected as values and literals', async () => {
  const registry = createCoreRegistry();
  const program = graph({ x: { type: 'NumberArray' } }, [], { input: 'x' }, 'NumberArray');
  const execute = await compiled(program, registry);
  for (const x of [new Array(2), [1, NaN], [Infinity], [1, '2']]) {
    const reference = await outcome(() => executeGraph(program, { x }, registry));
    assert.equal(reference.error, 'TYPE_MISMATCH');
    assert.deepEqual(await outcome(() => execute({ x })), reference);
    const literal = graph({}, [], { literal: x }, 'NumberArray');
    assert.throws(() => validateGraph(literal, registry), { code: 'UNKNOWN_LITERAL' });
  }
});

test('AC-025 large collection min/max avoid host argument-count limits', async () => {
  const values = Array.from({ length: 200_000 }, (_, i) => i - 100_000);
  const registry = createCoreRegistry();
  for (const [op, expected] of [['min', -100_000], ['max', 99_999]]) {
    const program = graph({ x: { type: 'NumberArray' } }, [
      { id: 'value', uses: `core.${op}`, args: { values: { input: 'x' } } }
    ], { node: 'value' });
    assert.equal(await executeGraph(program, { x: values }, registry), expected);
    assert.equal((await compiled(program, registry))({ x: values }), expected);
  }
});

test('AC-025 shared pure nodes execute once and unused nodes do not execute', async () => {
  const registry = createCoreRegistry();
  let calls = 0;
  registry.registerAtomic({ id: 'test.value', inputs: {}, output: 'Number',
    execute: () => { calls++; return 7; },
    // Instrumentation only: the registered operation returns a constant pure value.
    emitJS: () => '(globalThis.__emsConformanceCalls++, 7)'
  });
  const program = graph({}, [
    { id: 'shared', uses: 'test.value', args: {} },
    { id: 'unused', uses: 'test.value', args: {} },
    { id: 'result', uses: 'core.add', args: { a: { node: 'shared' }, b: { node: 'shared' } } }
  ], { node: 'result' });
  assert.equal(await executeGraph(program, {}, registry), 14);
  assert.equal(calls, 1);
  globalThis.__emsConformanceCalls = 0;
  try {
    assert.equal((await compiled(program, registry))({}), 14);
    assert.equal(globalThis.__emsConformanceCalls, 1);
  } finally { delete globalThis.__emsConformanceCalls; }
});

test('AC-025 dependency error order follows contract ports, independent of args layout', async () => {
  const registry = createCoreRegistry();
  const program = graph({}, [
    { id: 'zero', uses: 'core.div', args: { a: { literal: 1 }, b: { literal: 0 } } },
    { id: 'empty', uses: 'core.min', args: { values: { literal: [] } } },
    { id: 'result', uses: 'core.add', args: { b: { node: 'empty' }, a: { node: 'zero' } } }
  ], { node: 'result' });
  const reference = await outcome(() => executeGraph(program, {}, registry));
  assert.equal(reference.error, 'DIV_BY_ZERO');
  assert.deepEqual(await outcome(() => compiled(program, registry).then(execute => execute({}))), reference);
});

test('AC-025 checked intermediate overflow survives composite expansion', async () => {
  const registry = createCoreRegistry();
  const inner = structuredClone(fixtures.vectors.find(v => v.id === 'overflow-before-finite-return').graph);
  registry.registerComposite({ id: inner.id, graph: inner });
  const outer = graph(inner.inputs, [
    { id: 'call', uses: inner.id, args: { a: { input: 'a' }, b: { input: 'b' } } }
  ], { node: 'call' });
  const inputs = { a: Number.MAX_VALUE, b: 2 };
  const reference = await outcome(() => executeGraph(outer, inputs, registry));
  assert.equal(reference.error, 'TYPE_MISMATCH');
  assert.deepEqual(await outcome(() => compiled(outer, registry).then(execute => execute(inputs))), reference);
});

test('AC-011 pure compiler rejects unused effect and capability declarations', () => {
  for (const requirements of [{ effects: ['file.write'] }, { capabilities: ['camera.capture'] }]) {
    const registry = createCoreRegistry().registerAtomic({ id: 'test.effect', inputs: {}, output: 'Number',
      execute: () => 1, emitJS: () => '1', ...requirements });
    const program = graph({}, [{ id: 'unused', uses: 'test.effect', args: {} }], { literal: 2 });
    assert.throws(() => compileStandaloneJS(program, registry), { code: 'UNSUPPORTED_TARGET' });
  }
});

test('AC-008 checked-in sealed example preserves the current semantic input boundary', async () => {
  const module = await import('../examples/compiled-avg5-atomic/module.mjs');
  const program = JSON.parse(await readFile(new URL('../examples/avg5.graph.json', import.meta.url), 'utf8'));
  const registry = createCoreRegistry();
  for (const inputs of [{ times: [12.4, 11.85, 13.2, 12.1, 14] }, {}, { times: [] }, { times: [1, 2], extra: 1 }]) {
    assert.deepEqual(await outcome(() => module.execute(inputs)), await outcome(() => executeGraph(program, inputs, registry)));
  }
});
