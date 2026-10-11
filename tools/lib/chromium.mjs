import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

export async function chromiumExecutable() {
  const candidates = process.env.EMS_CHROMIUM ? [process.env.EMS_CHROMIUM] : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    join(homedir(), '.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell')];
  for (const candidate of candidates) { try { await access(candidate, constants.X_OK); return candidate; } catch {} }
  throw Object.assign(new Error('Chromium unavailable; set EMS_CHROMIUM to an installed executable. No browser downloaded.'), { code: 'BROWSER_UNAVAILABLE' });
}

/** Local trusted QA only. CDP is loopback, with an isolated disposable browser profile. */
export async function launchChromium() {
  const executable = await chromiumExecutable(), directory = await mkdtemp(join(tmpdir(), 'ems-chromium-'));
  const child = spawn(executable, ['--headless', '--disable-gpu', '--no-sandbox', '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0', `--user-data-dir=${directory}`, '--no-first-run', '--no-default-browser-check', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  async function close() {
    socket?.close();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await new Promise(resolve => {
        const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 2000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
    await rm(directory, { recursive: true, force: true });
  }
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Chromium startup timed out')), 10000);
      const fail = error => { clearTimeout(timer); reject(error); };
      child.once('error', fail);
      child.once('exit', code => fail(new Error(`Chromium exited before CDP: ${code}`)));
      child.stderr.on('data', chunk => {
        output = (output + chunk).slice(-16384);
        const match = output.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let sequence = 0;
    const pending = new Map(), listeners = new Set();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const request = pending.get(message.id);
        if (request) { clearTimeout(request.timer); pending.delete(message.id); message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result); }
      } else for (const listener of listeners) listener(message);
    });
    socket.addEventListener('close', () => { for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('CDP closed')); } pending.clear(); });
    function send(method, params = {}, sessionId) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
        pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    }
    async function page(url,{headers={}}={}) {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      await send('Page.enable', {}, sessionId);
      if(Object.keys(headers).length){await send('Network.enable',{},sessionId);await send('Network.setExtraHTTPHeaders',{headers},sessionId);}
      const loaded = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { listeners.delete(listener); reject(new Error('Page load timeout')); }, 10000);
        const listener = message => {
          if (message.sessionId === sessionId && message.method === 'Page.loadEventFired') { clearTimeout(timer); listeners.delete(listener); resolve(); }
        };
        listeners.add(listener);
      });
      await send('Page.navigate', { url }, sessionId); await loaded;
      return {
        screenshot: () => send('Page.captureScreenshot', {format:'png'}, sessionId).then(result=>result.data),
        viewport: (width,height) => send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId),
        mouse: (type,params) => send('Input.dispatchMouseEvent',{type,...params},sessionId),
        downloads: directory => send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:directory}),
        async evaluate(expression) {
          const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
          if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
          return result.result.value;
        },
        close: () => send('Target.closeTarget', { targetId })
      };
    }
    return { executable, version: await send('Browser.getVersion'), page, close };
  } catch (error) { await close(); throw error; }
}
