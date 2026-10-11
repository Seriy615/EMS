import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import { createCoreRegistry } from '../src/reference/index.mjs';
import { EFFECT_PROFILE, executeIR, serializeIR, parseIR, compileIRToJS } from '../src/ir/index.mjs';

function fixture() {
  const calls = [];
  const registry = createCoreRegistry().registerAtomic({ id: 'host.write', inputs: { value: 'Number' }, output: 'Number',
    effects: ['log.write'], capabilities: ['log.access'], execute: ({ value }) => { calls.push(value); return value; } });
  return { registry, calls };
}
const grants = { allowedEffects: ['log.write'], capabilities: ['log.access'] };
const check = (source, registry) => typecheckModule(parseEMSModule(source), registry);
const lower = (source, registry) => lowerCheckedModule(check(source, registry), 'test', registry);

test('text effects infer through generic helpers and preserve statement/argument order in shared IR', async () => {
  const { registry, calls } = fixture();
  const source = 'fn write<T>(x: T) -> Number { return host.write(1); } fn test() -> Number { let ignored = write(true); host.write(2); return add(host.write(3), host.write(4)); }';
  const bundle = lower(source, registry);
  assert.equal(bundle.ir.profile, EFFECT_PROFILE);
  assert.deepEqual(bundle.ir.policy, { effects: ['log.write'], capabilities: ['log.access'] });
  const ir = parseIR(serializeIR(bundle.ir, bundle.registry), bundle.registry);
  assert.equal(await executeIR(ir, {}, bundle.registry, grants), 7);
  assert.deepEqual(calls, [1, 2, 3, 4]);
  assert.equal(registry.items.has('test'), false);
  assert.throws(() => compileIRToJS(ir, bundle.registry), { code: 'UNSUPPORTED_TARGET' });
});

test('requires pure rejects effects through forward calls with source locations', () => {
  const { registry, calls } = fixture();
  assert.throws(() => check('fn test() -> Number requires pure { return helper(); } fn helper() -> Number { return host.write(1); }', registry),
    error => error.code === 'EFFECT_MISMATCH' && error.details.location.start.line === 1);
  assert.deepEqual(calls, []);
});

test('recursive effect inference reaches a fixed point before any execution', () => {
  const { registry, calls } = fixture();
  const checked = check('fn test() -> Number { return helper(); } fn helper() -> Number { let value = host.write(1); return test(); }', registry);
  assert.deepEqual(checked.policies.get('test'), { effects: ['log.write'], capabilities: ['log.access'] });
  assert.equal(lowerCheckedModule(checked, 'test', registry).ir.schemaVersion, 'ems-ir/2');
  assert.deepEqual(calls, []);
});

test('explicit budgets require both effect and capability declarations', () => {
  const { registry } = fixture();
  for (const requirements of ['effect("log.write")', 'capability("log.access")', 'effect("other"), capability("log.access")']) {
    assert.throws(() => check(`fn test() -> Number requires ${requirements} { return host.write(1); }`, registry), { code: 'EFFECT_MISMATCH' });
  }
  check('fn test() -> Number requires effect("log.write"), capability("log.access") { return host.write(1); }', registry);
});

test('invalid, duplicate and contradictory requirements fail with diagnostics', () => {
  const { registry } = fixture();
  for (const requirements of ['permission("log.access")', 'toString("log.access")', 'pure, pure', 'pure, effect("log.write")'])
    assert.throws(() => check(`fn test() -> Number requires ${requirements} { return 1; }`, registry), { code: 'INVALID_REQUIREMENT' });
  for (const requirements of ['effect("")', 'effect("log.write"), effect("log.write")'])
    assert.throws(() => check(`fn test() -> Number requires ${requirements} { return 1; }`, registry), { code: 'INVALID_POLICY' });
});

test('extern budgets cannot lie about a linked implementation', () => {
  const { registry } = fixture();
  assert.throws(() => check('extern fn host.write(value: Number) -> Number requires pure; fn test() -> Number { return host.write(1); }', registry), { code: 'EFFECT_MISMATCH' });
  const checked = check('extern fn host.write(value: Number) -> Number; fn test() -> Number { return host.write(1); }', registry);
  assert.deepEqual(checked.policies.get('test'), { effects: ['log.write'], capabilities: ['log.access'] });
});

test('unused explicit interface requirements survive IR and require grants', async () => {
  const { registry, calls } = fixture();
  const bundle = lower('fn test() -> Number requires effect("log.write"), capability("log.access") { return 1; }', registry);
  const ir = parseIR(serializeIR(bundle.ir, bundle.registry), bundle.registry);
  await assert.rejects(executeIR(ir, {}, bundle.registry), { code: 'PERMISSION_DENIED' });
  assert.equal(await executeIR(ir, {}, bundle.registry, grants), 1);
  assert.deepEqual(calls, []);
});

test('a pure intermediate failure precedes later textual effects', async () => {
  const { registry, calls } = fixture();
  const bundle = lower('fn test() -> Number { let ignored = 1 / 0; return host.write(2); }', registry);
  await assert.rejects(executeIR(bundle.ir, {}, bundle.registry, grants), { code: 'DIV_BY_ZERO' });
  assert.deepEqual(calls, []);
});

test('pure expression statements retain their evaluation through nested callers', async () => {
  const registry = createCoreRegistry();
  const bundle = lower('fn helper() -> Number requires pure { div(1, 0); return 1; } fn test() -> Number requires pure { return helper(); }', registry);
  assert.equal(bundle.ir.profile, EFFECT_PROFILE);
  assert.deepEqual(bundle.ir.policy, { effects: [], capabilities: [] });
  await assert.rejects(executeIR(bundle.ir, {}, bundle.registry), { code: 'DIV_BY_ZERO' });
  const module = await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(bundle.ir, bundle.registry))}`);
  assert.throws(() => module.execute({}), { code: 'DIV_BY_ZERO' });
});

test('module CLI requires explicit policy files and rejects attempts to pass runtime internals', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const directory = await mkdtemp(join(tmpdir(), 'ems-effects-cli-'));
  try {
    const source = join(directory, 'source.ems'), policy = join(directory, 'policy.json');
    await writeFile(source, 'fn test() -> Number requires effect("log.write"), capability("log.access") { return 1; }');
    const cli = new URL('../tools/ems.mjs', import.meta.url).pathname;
    const run = (...extra) => spawnSync(process.execPath, [cli, 'module-run', source, '--entry', 'test', '{}', ...extra], { encoding: 'utf8' });
    const denied = run(); assert.equal(denied.status, 1); assert.match(denied.stderr, /PERMISSION_DENIED/);
    await writeFile(policy, JSON.stringify(grants));
    const allowed = run('--policy', policy); assert.equal(allowed.status, 0); assert.equal(JSON.parse(allowed.stdout).result, 1);
    await writeFile(policy, JSON.stringify({ ...grants, callStack: [] }));
    const invalid = run('--policy', policy); assert.equal(invalid.status, 1); assert.match(invalid.stderr, /only accepts/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
