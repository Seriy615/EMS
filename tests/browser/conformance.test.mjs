import test from 'node:test';
import assert from 'node:assert/strict';
import { runBrowserConformance } from '../../tools/browser-conformance.mjs';
import { startStudioServer } from '../../tools/serve.mjs';
import { launchChromium } from '../../tools/lib/chromium.mjs';

test('actual Chromium agrees with Node on the common suite, byte-identical P1 program and independent UI', async () => {
  const report = await runBrowserConformance();
  assert.equal(report.failed, 0, JSON.stringify(report.results.filter(item => !item.passed)));
  assert.equal(report.passed, 57);
  assert.ok(report.environment.browser.product.includes('Chrome/'));
  assert.deepEqual(report.environment.webCrypto, { secureContext: true, subtleCrypto: true });
  assert.equal(report.executors.length, 5);
  assert.equal(report.portableApplication.runtimeOriginClosedBeforeUI, true);
  assert.equal(report.portableApplication.sourceDependenciesRequested, false);
  assert.equal(report.portableApplication.ui.positive.text, 'Среднее: 6');
  assert.deepEqual(report.browserLockRejections, [{ accepted: false, code: 'LOCK_MISMATCH' }, { accepted: false, code: 'LOCK_MISMATCH' }]);
});

test('existing browser explorer loads the transitive EMS modules and executes its real arithmetic graph', async () => {
  const server = await startStudioServer({port:0});
  let browser;
  try {
    browser=await launchChromium();const page=await browser.page(server.origin);
    const result=await page.evaluate(`(async()=>{await import('/web/app.mjs');document.querySelector('#execute').click();await new Promise(resolve=>setTimeout(resolve,0));return JSON.parse(document.querySelector('#output').textContent);})()`);
    assert.ok(Math.abs(result.result-12.566666666666666)<1e-9);
    assert.equal((await fetch(server.origin+'/AGENTS.md')).status,403);
  } finally {await browser?.close();await server.close();}
});
