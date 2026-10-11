import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoreRegistry, executeGraph } from '../src/reference/index.mjs';
import { analyzeGraphEffects, checkGraphPolicy } from '../src/semantics/effects.mjs';

const graph = (id, uses) => ({ schemaVersion: '0.1', id, version: '0.1.0', inputs: {}, output: { type: 'Number' },
  nodes: [{ id: 'call', uses, args: {} }], returns: { node: 'call' } });
function fixture() {
  let invoked = false;
  const registry = createCoreRegistry().registerAtomic({ id: 'test.device', inputs: {}, output: 'Number',
    effects: ['device.read'], capabilities: ['device.access'], execute: () => { invoked = true; return 1; } });
  const inner = graph('test.inner', 'test.device');
  registry.registerComposite({ id: inner.id, graph: inner });
  return { registry, program: graph('test.outer', inner.id), invoked: () => invoked };
}

test('EMS-014 transitive effects survive a composite with omitted outer metadata', () => {
  const { registry, program, invoked } = fixture();
  assert.deepEqual(analyzeGraphEffects(program, registry), {
    effects: ['device.read'], capabilities: ['device.access'],
    nodes: { call: { effects: ['device.read'], capabilities: ['device.access'] } }
  });
  assert.equal(invoked(), false);
});

test('EMS-014 capability and effect authorization are distinct gates', () => {
  const { registry, program, invoked } = fixture();
  assert.throws(() => checkGraphPolicy(program, registry), { code: 'PERMISSION_DENIED' });
  assert.throws(() => checkGraphPolicy(program, registry, { capabilities: ['device.access'] }), { code: 'EFFECT_DENIED' });
  const summary = checkGraphPolicy(program, registry, { capabilities: ['device.access'], allowedEffects: ['device.read'] });
  assert.deepEqual(summary.effects, ['device.read']);
  assert.equal(invoked(), false);
});

test('EMS-014 static policy covers unused declarations', () => {
  const { registry, program } = fixture();
  program.returns = { literal: 1 };
  assert.throws(() => checkGraphPolicy(program, registry, { capabilities: ['device.access'] }), { code: 'EFFECT_DENIED' });
});

test('EMS-014 recursive composites fail effect analysis before invocation', () => {
  const registry = createCoreRegistry();
  const program = graph('test.recursive', 'test.recursive');
  registry.registerComposite({ id: program.id, graph: program });
  assert.throws(() => analyzeGraphEffects(program, registry), { code: 'RECURSIVE_COMPOSITE' });
});

test('runtime rejects nested effects before executing any implementation', async () => {
  const { registry, program, invoked } = fixture();
  await assert.rejects(executeGraph(program, {}, registry), { code: 'PERMISSION_DENIED' });
  await assert.rejects(executeGraph(program, {}, registry, { capabilities: ['device.access'] }), { code: 'EFFECT_DENIED' });
  assert.equal(invoked(), false);
  assert.equal(await executeGraph(program, {}, registry, {
    capabilities: ['device.access'], allowedEffects: ['device.read']
  }), 1);
  assert.equal(invoked(), true);
});

test('runtime preflight prevents partial effects when a later dependency is denied', async () => {
  const registry = createCoreRegistry();
  const calls = [];
  registry.registerAtomic({ id: 'test.first', inputs: {}, output: 'Number', effects: ['file.write'],
    execute: () => { calls.push('first'); return 1; } });
  registry.registerAtomic({ id: 'test.last', inputs: {}, output: 'Number', capabilities: ['device.access'],
    execute: () => { calls.push('last'); return 2; } });
  const program = { ...graph('test.preflight', 'test.first'), nodes: [
    { id: 'first', uses: 'test.first', args: {} }, { id: 'last', uses: 'test.last', args: {} },
    { id: 'sum', uses: 'core.add', args: { a: { node: 'first' }, b: { node: 'last' } } }
  ], returns: { node: 'sum' } };
  await assert.rejects(executeGraph(program, {}, registry, { allowedEffects: ['file.write'] }), { code: 'PERMISSION_DENIED' });
  assert.deepEqual(calls, []);
  assert.equal(await executeGraph(program, {}, registry, { allowedEffects: ['file.write'], capabilities: ['device.access'] }), 3);
  assert.deepEqual(calls, ['first', 'last']);
});

test('runtime checks unused effect declarations conservatively', async () => {
  const { registry, program, invoked } = fixture();
  program.returns = { literal: 1 };
  await assert.rejects(executeGraph(program, {}, registry, { capabilities: ['device.access'] }), { code: 'EFFECT_DENIED' });
  assert.equal(invoked(), false);
});

test('invalid declarations and grants are rejected instead of coerced', async () => {
  for (const invalid of ['file.write', null, [null], [''], ['file.write', 'file.write'], Array(1)]) {
    const registry = createCoreRegistry();
    assert.throws(() => registry.registerAtomic({ id: 'test.bad', inputs: {}, output: 'Number',
      effects: invalid, execute: () => 1 }), { code: 'INVALID_POLICY' });
    assert.throws(() => registry.registerAtomic({ id: 'test.bad', inputs: {}, output: 'Number',
      capabilities: invalid, execute: () => 1 }), { code: 'INVALID_POLICY' });
    const pure = { ...graph('test.pure', 'core.add'), nodes: [], returns: { literal: 1 } };
    await assert.rejects(executeGraph(pure, {}, registry, { allowedEffects: invalid }), { code: 'INVALID_POLICY' });
    await assert.rejects(executeGraph(pure, {}, registry, { capabilities: invalid }), { code: 'INVALID_POLICY' });
  }
});
