import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

/** Read-only loopback QA server. Runtime source and exported app use separate roots/origins. */
export async function serveQA(directory, { runtime = false } = {}) {
  const root = await realpath(directory), requests = [];
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      requests.push(path);
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
      if (runtime && path === '/index.html') {
        response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><title>EMS runtime QA</title>'); return;
      }
      if (runtime && !path.startsWith('/src/')) throw new Error('Source path denied');
      const file = await realpath(resolve(root, '.' + (path === '/' ? '/index.html' : path)));
      if (!file.startsWith(root + sep)) throw new Error('Outside root');
      const body = await readFile(file), types = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css' };
      response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'" });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`, requests,
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
