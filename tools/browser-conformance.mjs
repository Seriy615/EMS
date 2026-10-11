import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { launchChromium } from './lib/chromium.mjs';
import { serveQA } from './lib/qa-server.mjs';
import { exportPortableAnalysis } from './export-portable.mjs';
import { loadFixtures } from './conformance.mjs';
import { prepareProgram } from '../src/conformance/program.mjs';
import { runConformance, captureOutcome, encodeValue, decodeValue } from '../src/conformance/index.mjs';
import { executeIR, compileIRToJS } from '../src/ir/index.mjs';
import { createProgramLock } from '../src/contracts/index.mjs';

export async function runBrowserConformance() {
  const directory = await mkdtemp(join(tmpdir(), 'ems-browser-proof-'));
  let browser, runtimeServer, staticServer;
  try {
    const { source, manifest } = await exportPortableAnalysis(directory);
    const vectors = [...await loadFixtures(),
      { id: 'P1/mean', source, entry: 'analyze', inputs: { values: [2, 4, 6] }, expected: { value: 4 } },
      { id: 'P1/empty', source, entry: 'analyze', inputs: { values: [] }, expected: { error: 'USER_THROW' } },
      { id: 'P1/invalid-input', source, entry: 'analyze', inputs: { values: ['bad'] }, expected: { error: 'TYPE_MISMATCH' } }
    ];
    const modules = new Map(), locks = new Map();
    for (const [index, vector] of vectors.entries()) {
      const { ir, registry } = prepareProgram({ ...vector, target: 'web' }), name = vector.id.startsWith('P1/') ? 'program.mjs' : `fixture-${index}.mjs`;
      const generated = compileIRToJS(ir, registry);
      if (name === 'program.mjs') {
        if (await readFile(join(directory, name), 'utf8') !== generated) throw new Error('P1 compiled artifact differs from exported application');
      } else await writeFile(join(directory, name), generated);
      modules.set(vector.id, name);
      locks.set(vector.id, await createProgramLock(ir, registry, { target: 'web' }));
    }
    await writeFile(join(directory, 'codec.mjs'), await readFile(new URL('../src/conformance/index.mjs', import.meta.url), 'utf8'));
    await writeFile(join(directory, 'driver.mjs'), `import {captureOutcome,encodeValue,decodeValue} from './codec.mjs';
export async function run(module,encoded){const vector=decodeValue(encoded),program=await import('./'+module);return encodeValue(await captureOutcome(()=>program.execute(vector.inputs??{},vector.options??{})));}
`);
    runtimeServer = await serveQA(fileURLToPath(new URL('../', import.meta.url)), { runtime: true });
    staticServer = await serveQA(directory);
    browser = await launchChromium();
    const runtimePage = await browser.page(runtimeServer.origin + '/index.html'), staticPage = await browser.page(staticServer.origin + '/index.html');
    const webCrypto = await runtimePage.evaluate('({secureContext:isSecureContext,subtleCrypto:!!globalThis.crypto?.subtle})');
    const first = vectors[0], selectedLock = locks.get(first.id), browserLockRejections = [];
    for (const lock of [{ ...selectedLock, program: '0'.repeat(64) }, { ...selectedLock, target: 'node' }]) {
      const result = await runtimePage.evaluate(`import('/src/conformance/browser.mjs').then(module=>module.runLockedBrowserFixture(${JSON.stringify(encodeValue(first))},${JSON.stringify(lock)})).then(()=>({accepted:true}),error=>({accepted:false,code:error.code}))`);
      if (result.accepted || result.code !== 'LOCK_MISMATCH') throw new Error('Browser accepted changed lock');
      browserLockRejections.push(result);
    }
    const report = await runConformance(vectors, [
      { id: 'node-reference', run: async vector => {
        const { ir, registry } = prepareProgram(vector);
        return captureOutcome(() => executeIR(ir, vector.inputs ?? {}, registry, vector.options ?? {}));
      } },
      { id: 'chromium-reference', run: async vector => decodeValue(await runtimePage.evaluate(
        `import('/src/conformance/browser.mjs').then(module=>module.runBrowserFixture(${JSON.stringify(encodeValue(vector))}))`)) },
      { id: 'chromium-locked-reference', run: async vector => decodeValue(await runtimePage.evaluate(
        `import('/src/conformance/browser.mjs').then(module=>module.runLockedBrowserFixture(${JSON.stringify(encodeValue(vector))},${JSON.stringify(locks.get(vector.id))}))`)) },
      { id: 'node-independent-standalone', run: async vector => {
        const inputPath = join(directory, 'node-input.json');
        await writeFile(inputPath, JSON.stringify(encodeValue({ inputs: vector.inputs ?? {}, options: vector.options ?? {} })));
        const result = spawnSync(process.execPath, [fileURLToPath(new URL('./conformance-worker.mjs', import.meta.url)), join(directory, modules.get(vector.id)), inputPath],
          { cwd: directory, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(`Independent Node program failed: ${result.stderr}`);
        return decodeValue(JSON.parse(result.stdout));
      } },
      { id: 'chromium-independent-standalone', run: async vector => decodeValue(await staticPage.evaluate(
        `import('/driver.mjs').then(module=>module.run(${JSON.stringify(modules.get(vector.id))},${JSON.stringify(encodeValue(vector))}))`)) }
    ]);
    // Close the runtime origin before exercising the application's real UI.
    await runtimePage.close(); await runtimeServer.close(); runtimeServer = null;
    const ui = await staticPage.evaluate(`(async()=>{
      const form=document.querySelector('#analysis'),input=document.querySelector('#values'),output=document.querySelector('#result');
      async function submit(value){input.value=value;form.requestSubmit();await new Promise(resolve=>setTimeout(resolve,0));return {status:output.dataset.status,text:output.textContent};}
      return {positive:await submit('[3,9]'),empty:await submit('[]'),invalid:await submit('["bad"]')};
    })()`);
    if (ui.positive.status !== 'success' || ui.positive.text !== 'Среднее: 6' || ui.empty.status !== 'error' || ui.invalid.status !== 'error') throw new Error('Independent application UI proof failed');
    if (staticServer.requests.some(path => path.startsWith('/src/'))) throw new Error('Independent app requested EMS source');
    return { ...report, environment: { node: process.version, platform: process.platform, browser: browser.version, webCrypto }, browserLockRejections,
      portableApplication: { ...manifest, runtimeOriginClosedBeforeUI: true, ui,
        independentRequests: staticServer.requests, sourceDependenciesRequested: staticServer.requests.some(path => path.startsWith('/src/')) } };
  } finally {
    await browser?.close(); await runtimeServer?.close(); await staticServer?.close(); await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--out')) throw new Error('Usage: node tools/browser-conformance.mjs [--out report.json]');
  const report = await runBrowserConformance();
  if (args.length) await writeFile(args[1], JSON.stringify({ ...report, results: report.results.map(result => ({ ...result,
    outcomes: result.outcomes.map(item => item.outcome ? { ...item, outcome: encodeValue(item.outcome) } : item) })) }, null, 2) + '\n');
  console.log(`EMS real-browser conformance: ${report.passed} passed, ${report.failed} failed; ${report.environment.browser.product}`);
  for (const result of report.results.filter(item => !item.passed)) console.error(JSON.stringify(encodeValue(result)));
  process.exitCode = report.failed ? 1 : 0;
}
