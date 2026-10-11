import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoreRegistry } from '../src/reference/index.mjs';
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
