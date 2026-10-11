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

test('CLI starts from an atomic release symlink rather than exiting successfully without serving',async()=>{
 const {mkdtemp,symlink,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join,resolve}=await import('node:path'),{spawn}=await import('node:child_process');
 const dir=await mkdtemp(join(tmpdir(),'ems-release-link-'));let child;
 try{await symlink(resolve(import.meta.dirname,'..'),join(dir,'current'),'dir');child=spawn(process.execPath,[join(dir,'current','tools','serve.mjs')],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
 const origin=await new Promise((yes,no)=>{const timeout=setTimeout(()=>no(new Error('Symlink CLI failed to listen')),5000);let output='';child.on('error',error=>{clearTimeout(timeout);no(error);});child.on('exit',code=>{clearTimeout(timeout);no(new Error('CLI exited before ready: '+code));});child.stdout.on('data',bytes=>{output+=bytes;const match=output.match(/EMS reference explorer: (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timeout);yes(match[1]);}});});assert.equal((await fetch(origin)).status,200);
 }finally{if(child&&child.exitCode===null){const closed=new Promise(resolve=>child.once('exit',resolve));child.kill();await closed;}await rm(dir,{recursive:true,force:true});}
});
