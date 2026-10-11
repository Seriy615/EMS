import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { executeIR, serializeIR, parseIR, compileIRToJS } from '../src/ir/index.mjs';
import { prepareProgram } from '../src/conformance/program.mjs';
import { runConformance, captureOutcome, encodeValue, decodeValue } from '../src/conformance/index.mjs';

export async function loadFixtures() {
  const suites = await Promise.all(['semantics', 'language-conformance'].map(name =>
    readFile(new URL(`../tests/fixtures/${name}.json`, import.meta.url), 'utf8').then(JSON.parse)));
  return suites.flatMap(suite => suite.vectors.map(vector => ({ ...vector, id: `${suite.profile}/${vector.id}` })));
}

export async function runNodeConformance(vectors) {
  const directory = await mkdtemp(join(tmpdir(), 'ems-conformance-'));
  let sequence = 0;
  try {
    return await runConformance(vectors, [
      { id: 'node-reference', run: async vector => {
        const { ir, registry } = prepareProgram(vector);
        return captureOutcome(() => executeIR(ir, vector.inputs ?? {}, registry, vector.options ?? {}));
      } },
      { id: 'node-serialized-ir', run: async vector => {
        const { ir, registry } = prepareProgram(vector), restored = parseIR(serializeIR(ir, registry), registry);
        return captureOutcome(() => executeIR(restored, vector.inputs ?? {}, registry, vector.options ?? {}));
      } },
      { id: 'node-standalone-process', run: async vector => {
        const { ir, registry } = prepareProgram(vector), prefix = join(directory, String(sequence++));
        const modulePath = `${prefix}.mjs`, inputPath = `${prefix}.json`;
        await writeFile(modulePath, compileIRToJS(ir, registry));
        await writeFile(inputPath, JSON.stringify(encodeValue({ inputs: vector.inputs ?? {}, options: vector.options ?? {} })));
        const result = spawnSync(process.execPath, [fileURLToPath(new URL('./conformance-worker.mjs', import.meta.url)), modulePath, inputPath],
          { cwd: directory, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(`Standalone process failed: ${result.stderr}`);
        return decodeValue(JSON.parse(result.stdout));
      } }
    ]);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flags = new Map();
  for (let index = 0; index < args.length; index += 2) {
    if (!['--out', '--fixtures'].includes(args[index]) || !args[index + 1] || flags.has(args[index]))
      throw new Error('Usage: node tools/conformance.mjs [--fixtures suite.json] [--out report.json]');
    flags.set(args[index], args[index + 1]);
  }
  const vectors = flags.has('--fixtures') ? JSON.parse(await readFile(flags.get('--fixtures'), 'utf8')).vectors : await loadFixtures();
  const report = await runNodeConformance(vectors);
  const json = JSON.stringify({ ...report, results: report.results.map(result => ({ ...result,
    outcomes: result.outcomes.map(item => item.outcome ? { ...item, outcome: encodeValue(item.outcome) } : item) })) }, null, 2) + '\n';
  if (flags.has('--out')) await writeFile(flags.get('--out'), json);
  console.log(`EMS conformance: ${report.passed} passed, ${report.failed} failed; ${report.executors.join(', ')}`);
  for (const result of report.results.filter(item => !item.passed)) console.error(JSON.stringify(encodeValue(result)));
  process.exitCode = report.failed ? 1 : 0;
}
