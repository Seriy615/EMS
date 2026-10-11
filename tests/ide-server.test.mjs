import test from 'node:test';
import assert from 'node:assert/strict';
import {startStudioServer} from '../tools/serve.mjs';
test('IDE server exposes checked browser assets but rejects host data and mutation requests',async()=>{
 const server=await startStudioServer({port:0});try{
 for(const path of ['/','/web/projects.html','/web/studio-worker.mjs','/src/studio/project.mjs','/examples/studio-avg5.ems.json']){const response=await fetch(server.origin+path);assert.equal(response.status,200,path);assert.match(response.headers.get('content-security-policy'),/object-src 'none'/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');}
 for(const path of ['/.git/config','/AGENTS.md','/deploy/nginx.conf','/tools/deploy.mjs','/src/%2e%2e/%2e%2e/etc/passwd','/src/.secret']){const response=await fetch(server.origin+path);assert.ok([403,404].includes(response.status),path);}
 for(const method of ['POST','PUT','DELETE'])assert.equal((await fetch(server.origin+'/',{method})).status,405);
 const head=await fetch(server.origin+'/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
 }finally{await server.close();}
});
