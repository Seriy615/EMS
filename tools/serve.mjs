import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const media = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.md':'text/plain; charset=utf-8' };
const port = Number(process.env.PORT || 8787);
createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end('Method not allowed'); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const rawPath = pathname === '/' ? '/web/index.html' : pathname;
    const allowed = rawPath.startsWith('/web/') || rawPath.startsWith('/src/reference/') || rawPath.startsWith('/examples/') || rawPath === '/README.md';
    if (!allowed) { res.writeHead(403); res.end('Forbidden'); return; }
    const target = resolve(root, '.' + rawPath);
    if (!target.startsWith(root + sep) || /(^|\/)\./.test(rawPath)) { res.writeHead(403); res.end('Forbidden'); return; }
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': media[extname(target)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control':'no-store', 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'" });
    if (req.method === 'HEAD') res.end(); else res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`EMS reference explorer: http://127.0.0.1:${port}`));
