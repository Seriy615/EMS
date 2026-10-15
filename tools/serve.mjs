import {createHTTPModuleDiagnostics} from './lib/worker-diagnostics.mjs';
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(import.meta.dirname, '..');
const media = { '.webmanifest':'application/manifest+json', '.png':'image/png', '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.md':'text/plain; charset=utf-8' };
export async function startStudioServer({port=Number(process.env.PORT || 8787),recordModules=false}={}) {
const moduleTrace=recordModules?createHTTPModuleDiagnostics('http://localhost'):null;
const server=createServer(async (req, res) => {
  moduleTrace?.observe(req,res);
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end('Method not allowed'); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const rawPath = pathname === '/' ? '/web/index.html' : pathname;
    const allowed = rawPath.startsWith('/web/') || rawPath.startsWith('/src/') || rawPath.startsWith('/examples/') || rawPath === '/README.md';
    if (!allowed) { res.writeHead(403); res.end('Forbidden'); return; }
    const target = await realpath(resolve(root, '.' + rawPath));
    if (!target.startsWith(root + sep) || /(^|\/)\./.test(rawPath)) { res.writeHead(403); res.end('Forbidden'); return; }
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': media[extname(target)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', ...(rawPath==='/web/service-worker.mjs'?{'Service-Worker-Allowed':'/'}:{}), 'Cache-Control':'no-store', 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'" });
    if (req.method === 'HEAD') res.end(); else res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
return {moduleDiagnostics:()=>moduleTrace?.snapshot()??{recent:[],failures:[]},origin:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
if(process.argv[1]&&await realpath(resolve(process.argv[1]))===fileURLToPath(import.meta.url)) {
  const server=await startStudioServer();console.log(`EMS reference explorer: ${server.origin}`);
}
