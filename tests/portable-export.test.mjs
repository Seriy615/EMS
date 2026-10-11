import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { exportPortableAnalysis } from '../tools/export-portable.mjs';
import { serveQA } from '../tools/lib/qa-server.mjs';
import { chromiumExecutable } from '../tools/lib/chromium.mjs';

test('portable package hashes actual source/program and runs without EMS imports in a new process', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ems-export-'));
  try {
    const { source, manifest } = await exportPortableAnalysis(directory);
    const generated = await readFile(join(directory, 'program.mjs'), 'utf8');
    const hash = value => createHash('sha256').update(value).digest('hex');
    assert.equal(manifest.source.sha256, hash(source));
    assert.equal(manifest.artifact.sha256, hash(generated));
    assert.equal(manifest.semanticIR, JSON.parse(await readFile(join(directory, 'program.lock.json'), 'utf8')).program);
    assert.deepEqual(manifest.dependencies, []);
    assert.doesNotMatch(generated, /\bimport\s/);
    await writeFile(join(directory, 'check.mjs'), `import {execute} from './program.mjs';
console.log(execute({values:[3,9]}));try{execute({values:[]});}catch(error){console.log(error.code,error.value);}`);
    const result = spawnSync(process.execPath, ['check.mjs'], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), '6\nUSER_THROW EMPTY_SAMPLE');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('QA source/static servers reject unrelated files, writes and symlink escapes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ems-qa-server-'));
  let runtime, exported;
  try {
    const root = join(directory, 'root'); await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'module.mjs'), 'export const value=1;');
    await writeFile(join(root, 'AGENTS.md'), 'private QA fixture');
    await writeFile(join(directory, 'outside.txt'), 'outside');
    await symlink(join(directory, 'outside.txt'), join(root, 'src', 'escape.txt'));
    runtime = await serveQA(root, { runtime: true }); exported = await serveQA(root);
    assert.equal((await fetch(runtime.origin + '/src/module.mjs')).status, 200);
    assert.equal((await fetch(runtime.origin + '/AGENTS.md')).status, 404);
    assert.equal((await fetch(runtime.origin + '/src/escape.txt')).status, 404);
    assert.equal((await fetch(exported.origin + '/src/escape.txt')).status, 404);
    assert.equal((await fetch(exported.origin + '/src/module.mjs', { method: 'POST' })).status, 405);
    assert.match((await fetch(exported.origin + '/src/module.mjs')).headers.get('content-security-policy'), /script-src 'self'/);
  } finally { await runtime?.close(); await exported?.close(); await rm(directory, { recursive: true, force: true }); }
});

test('explicit unavailable Chromium selection fails instead of silently using another browser', async () => {
  const previous = process.env.EMS_CHROMIUM;
  try {
    process.env.EMS_CHROMIUM = '/nonexistent/ems-chromium-test';
    await assert.rejects(chromiumExecutable(), { code: 'BROWSER_UNAVAILABLE' });
  } finally { if (previous === undefined) delete process.env.EMS_CHROMIUM; else process.env.EMS_CHROMIUM = previous; }
});
