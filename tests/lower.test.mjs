import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import { createCoreRegistry, executeGraph, parseTextEMS } from '../src/reference/index.mjs';
import { executeIR, compileIRToJS } from '../src/ir/index.mjs';

const lower = (source, entry = 'test', registry = createCoreRegistry()) => lowerCheckedModule(typecheckModule(parseEMSModule(source), registry), entry, registry);
const compiled = async bundle => (await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(bundle.ir, bundle.registry))}`)).execute;

test('EMS-013 new located AST frontend executes AVG5 through existing shared IR/runtime', async () => {
  const source = await readFile(new URL('../examples/avg5.ems', import.meta.url), 'utf8');
  const bundle = lower(source, 'demo.AverageOfFiveArithmetic');
  const inputs = { times: [12.4, 11.85, 13.2, 12.1, 14] };
  const expected = await executeGraph(parseTextEMS(source), inputs, createCoreRegistry());
  assert.equal(await executeIR(bundle.ir, inputs, bundle.registry), expected);
  assert.equal((await compiled(bundle))(inputs), expected);
  assert.ok(bundle.provenance.functions['demo.AverageOfFiveArithmetic'].nodes.value_0.start.line >= 1);
});

test('EMS-013 generic pure functions specialize and execute independently', async () => {
  const bundle = lower('fn identity<T>(x: T) -> T { return x; } fn test(x: Number) -> Number { let n = identity(x); let flag = identity(true); return n + 1; }');
  const ids = [...bundle.registry.items.keys()].filter(id => id.startsWith('identity.specialization_'));
  assert.equal(ids.length, 2);
  assert.equal(await executeIR(bundle.ir, { x: 4 }, bundle.registry), 5);
  assert.equal((await compiled(bundle))({ x: 4 }), 5);
});

test('EMS-013 nested generic functions propagate concrete caller type arguments', async () => {
  const bundle = lower('fn identity<T>(x: T) -> T { return x; } fn outer<T>(x: T) -> T { return identity(x); } fn test(x: Number) -> Number { return outer(x); }');
  assert.equal(await executeIR(bundle.ir, { x: 12 }, bundle.registry), 12);
  assert.equal((await compiled(bundle))({ x: 12 }), 12);
});

test('EMS-013 constants, arrays, unary minus and arithmetic precedence preserve finite semantics', async () => {
  const bundle = lower('fn test(x: Number) -> Number { let total = sum([1,2,3]); return total + x * -2; }');
  assert.equal(await executeIR(bundle.ir, { x: 4 }, bundle.registry), -2);
  assert.equal((await compiled(bundle))({ x: 4 }), -2);
  const zero = lower('fn test() -> Number { return -0; }');
  assert.ok(Object.is(await executeIR(zero.ir, {}, zero.registry), -0));
  assert.ok(Object.is((await compiled(zero))({}), -0));
});

test('EMS-013 typed local functions become reusable composite boundaries', async () => {
  const registry = createCoreRegistry();
  const bundle = lower('fn square(x: Number) -> Number { return x * x; } fn test(x: Number) -> Number { return square(x) + square(2); }', 'test', registry);
  assert.equal(bundle.registry.resolve('square').kind, 'composite');
  assert.equal(await executeIR(bundle.ir, { x: 3 }, bundle.registry), 13);
  assert.equal((await compiled(bundle))({ x: 3 }), 13);
  assert.equal(registry.items.has('square'), false);
});

test('EMS-013 declared extern signatures must match a real binding before execution', () => {
  assert.throws(() => lower('extern fn missing(x: Number) -> Number; fn test(x: Number) -> Number { return missing(x); }'), { code: 'MISSING_CONTRACT' });
  assert.throws(() => lower('extern contract core.add(a: Number, b: Number) -> String; fn test() -> String { return core.add(1, 2); }'), { code: 'BINDING_SIGNATURE' });
});

for (const [source, code] of [
  ['fn test() -> Number { return test(); }', 'RECURSIVE_COMPOSITE'],
  ['fn test(x: Boolean) -> Number { if x { return 1; } else { return 2; } }', 'UNSUPPORTED_PROFILE'],
  ['fn test(x: Number) -> Number { let mut n = x; n = n + 1; return n; }', 'UNSUPPORTED_PROFILE'],
  ['fn test(x: Number) -> Number { return x % 2; }', 'UNSUPPORTED_PROFILE'],
  ['async fn test() -> Number { return 1; }', 'UNSUPPORTED_PROFILE'],
  ['fn test(x: Boolean[]) -> Boolean[] { return x; }', 'UNSUPPORTED_PROFILE'],
  ['fn test(x: Number) -> Number[] { return [x]; }', 'UNSUPPORTED_PROFILE'],
  ['fn test() -> Number requires effect("file.write") { return 1; }', 'UNSUPPORTED_PROFILE']
]) {
  test(`EMS-013 lowering rejects unsupported semantics: ${source}`, () => {
    assert.throws(() => lower(source), { code });
  });
}

test('EMS-013 new frontend preserves intermediate overflow in runtime and standalone', async () => {
  const bundle = lower('fn test(x: Number) -> Number { let large = x * 2; return 1 / large; }');
  await assert.rejects(executeIR(bundle.ir, { x: Number.MAX_VALUE }, bundle.registry), { code: 'TYPE_MISMATCH' });
  const execute = await compiled(bundle);
  assert.throws(() => execute({ x: Number.MAX_VALUE }), { code: 'TYPE_MISMATCH' });
});

test('EMS-013 module CLI checks, executes and independently exports generic source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ems-module-'));
  const cli = new URL('../tools/ems.mjs', import.meta.url).pathname;
  const source = join(dir, 'source.ems'), output = join(dir, 'output.mjs');
  const call = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd: dir });
  try {
    await writeFile(source, 'fn identity<T>(x: T) -> T { return x; } fn test(x: Number) -> Number { return identity(x) * 2; }');
    assert.match(call('check', source), /PASS/);
    assert.equal(JSON.parse(call('module-run', source, '--entry', 'test', '{"x":12}')).result, 24);
    call('module-build', source, '--entry', 'test', '--out', output);
    const result = execFileSync(process.execPath, ['--input-type=module', '-e',
      'import { execute } from "./output.mjs"; console.log(execute({x:12}));'], { encoding: 'utf8', cwd: dir });
    assert.equal(Number(result.trim()), 24);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
