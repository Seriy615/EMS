import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeValue, decodeValue, sameValue, captureOutcome, runConformance } from '../src/conformance/index.mjs';
import { loadFixtures, runNodeConformance } from '../tools/conformance.mjs';

test('conformance transport retains signed zero, nonfinite diagnostics and ambiguous user objects', () => {
  const value = { zeros: [0, -0], unusual: [undefined, NaN, Infinity, -Infinity], payload: { tag: 'number', value: '-0', __proto__: null } };
  const restored = decodeValue(JSON.parse(JSON.stringify(encodeValue(value))));
  assert.equal(sameValue(restored, value), true);
  assert.ok(Object.is(restored.zeros[1], -0));
  assert.equal(sameValue(0, -0), false);
  assert.equal(sameValue({ b: 2, a: 1 }, { a: 1, b: 2 }), true);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => encodeValue(cyclic), TypeError);
  assert.throws(() => encodeValue(new Array(2)), TypeError);
});

const fixture = { id: 'test', inputs: { x: 1 }, expected: { value: 3 } };
const executor = (id, value) => ({ id, run: () => captureOutcome(() => value) });

test('conformance gate rejects equally wrong executors and value/error detail drift', async () => {
  assert.equal((await runConformance([fixture], [executor('a', 2), executor('b', 2)])).failed, 1);
  assert.equal((await runConformance([fixture], [executor('a', 3), executor('b', 4)])).failed, 1);
  const fail = (id, details) => ({ id, run: () => captureOutcome(() => { throw { code: 'EXPECTED', name: 'EmsError', details }; }) });
  const errorFixture = { id: 'failure', expected: { error: 'EXPECTED' } };
  const report = await runConformance([errorFixture], [fail('a', { node: 'x' }), fail('b', { node: 'y' })]);
  assert.equal(report.failed, 1);
  assert.equal(report.results[0].outcomes.every(item => item.expected), true);
});

test('conformance infrastructure failures cannot masquerade as expected semantic failures', async () => {
  const fail = { id: 'setup', run() { throw { code: 'EXPECTED', message: 'compile failed' }; } };
  const report = await runConformance([{ id: 'failure', expected: { error: 'EXPECTED' } }], [fail, { ...fail, id: 'other' }]);
  assert.equal(report.failed, 1);
  assert.equal(report.results[0].outcomes[0].infrastructureError, 'EXPECTED');
  await assert.rejects(runConformance([], [executor('a', 1), executor('b', 1)]), TypeError);
  await assert.rejects(runConformance([fixture], [executor('a', 1), executor('a', 1)]), TypeError);
  await assert.rejects(runConformance([{ expected: { value: 1 } }], [executor('a', 1), executor('b', 1)]), TypeError);
});

test('conformance executors receive isolated fixture copies and require explicit expectations', async () => {
  const mutate = { id: 'mutate', run(vector) { vector.inputs.x = 99; return captureOutcome(() => 3); } };
  const inspect = { id: 'inspect', run(vector) { assert.equal(vector.inputs.x, 1); return captureOutcome(() => 3); } };
  assert.equal((await runConformance([fixture], [mutate, inspect])).passed, 1);
  assert.equal(fixture.inputs.x, 1);
  const report = await runConformance([{ id: 'missing' }], [executor('a', 1), executor('b', 1)]);
  assert.equal(report.failed, 1);
});

test('conformance error envelope retains typed throw while omitting host stack and message', async () => {
  const error = Object.assign(new Error('host secret'), { code: 'USER_THROW', details: {}, valueType: 'String', value: 'typed payload' });
  const outcome = await captureOutcome(() => { throw error; });
  assert.deepEqual(outcome, { status: 'failed', error: { code: 'USER_THROW', name: 'Error', details: {}, valueType: 'String', value: 'typed payload' } });
  assert.equal(JSON.stringify(outcome).includes('host secret'), false);
});

test('finite core and language fixtures conform through reference, serialized IR and fresh standalone processes', async () => {
  const vectors = await loadFixtures(), report = await runNodeConformance(vectors);
  assert.equal(report.failed, 0, JSON.stringify(report.results.filter(item => !item.passed)));
  assert.equal(report.passed, vectors.length);
  assert.ok(vectors.length >= 50);
  assert.deepEqual(report.executors, ['node-reference', 'node-serialized-ir', 'node-standalone-process']);
});

test('conformance CLI writes a lossless report and exits nonzero for a wrong oracle', async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const directory = await mkdtemp(join(tmpdir(), 'ems-oracle-'));
  try {
    const fixturePath = join(directory, 'suite.json'), reportPath = join(directory, 'report.json');
    await writeFile(fixturePath, JSON.stringify({ vectors: [{ id: 'wrong', source: 'fn test()->Number {return 1;}', expected: { value: 2 } }] }));
    const processResult = spawnSync(process.execPath, [new URL('../tools/conformance.mjs', import.meta.url).pathname,
      '--fixtures', fixturePath, '--out', reportPath], { encoding: 'utf8' });
    assert.equal(processResult.status, 1, processResult.stderr);
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    assert.equal(report.failed, 1);
    assert.equal(report.results[0].outcomes.every(item => item.expected === false), true);
    assert.equal(decodeValue(report.results[0].outcomes[0].outcome).value, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
