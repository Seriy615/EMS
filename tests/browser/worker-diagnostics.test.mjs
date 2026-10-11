import test from 'node:test';
import assert from 'node:assert/strict';
import {createHTTPModuleDiagnostics} from '../../tools/lib/worker-diagnostics.mjs';
import {createServer} from 'node:http';
import {launchChromium} from '../../tools/lib/chromium.mjs';
import {startStudioServer} from '../../tools/serve.mjs';

test('real Chromium diagnostics distinguish missing modules, HTTP denial, script failure, replies and termination without payload capture',async()=>{
 const http=createHTTPModuleDiagnostics('http://localhost');
 const server=createServer((req,res)=>{
  http.observe(req,res);
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Worker diagnostics</title>');}
  else if(path==='/web/healthy.mjs'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('self.onmessage=()=>self.postMessage("PRIVATE_SENTINEL")');}
  else if(path==='/web/throw.mjs'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('throw new Error("PRIVATE_SENTINEL")');}
  else{res.writeHead(path==='/web/denied.mjs'?401:404);res.end('PRIVATE_SENTINEL');}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await launchChromium();const page=await browser.page('http://127.0.0.1:'+server.address().port,{httpDiagnostics:()=>http.snapshot()});
 const result=await page.evaluate(`(async()=>{
 async function worker(path,healthy=false){const w=new Worker(path+'?secret=PRIVATE_SENTINEL#PRIVATE_SENTINEL',{type:'module'});return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Worker diagnostic fixture timeout')),5000);w.onmessage=()=>{clearTimeout(timer);w.terminate();resolve('reply');};w.onerror=e=>{e.preventDefault();clearTimeout(timer);w.terminate();resolve('error');};if(healthy)w.postMessage('PRIVATE_SENTINEL');});}
 const states=[];states.push(await worker('/web/healthy.mjs',true));for(const path of ['/web/missing.mjs','/web/denied.mjs','/web/throw.mjs'])states.push(await worker(path));return states;
 })()`);assert.deepEqual(result,['reply','error','error','error']);const diagnostics=await page.diagnostics();assert.equal(diagnostics.workers.length,4);assert.equal(diagnostics.workers[0].replies,1);assert.equal(diagnostics.workers[0].posted,1);assert.ok(diagnostics.workers.every(w=>w.state==='terminated'));assert.equal(diagnostics.errors.length,3);assert.ok(diagnostics.errors.some(e=>e.module==='/web/throw.mjs'&&e.messagePresent));assert.ok(!JSON.stringify(diagnostics).includes('PRIVATE_SENTINEL'));
 assert.ok(diagnostics.http.failures.some(e=>e.module==='/web/missing.mjs'&&e.status===404),JSON.stringify(diagnostics));assert.ok(diagnostics.http.failures.some(e=>e.module==='/web/denied.mjs'&&e.status===401),JSON.stringify(diagnostics));await page.close();
 }finally{await browser?.close();await new Promise(r=>{server.close(r);server.closeAllConnections();});}
});

test('real UI restart churn preserves semantics and leaves only the current Worker alive',async()=>{
 const server=await startStudioServer({port:0});let browser;
 try{browser=await launchChromium();const page=await browser.page(server.origin+'/web/ui-demo.html');const result=await page.evaluate(`(async()=>{
 const demo=await import('/web/ui-demo.mjs');const values=[];
 for(let i=0;i<12;i++){const prior=demo.applicationController;await demo.startDemo();if(!prior.runtime.closed)throw Error('Previous worker still alive');document.querySelector('[data-ems-ui="increment"]').click();await demo.applicationController.idle();values.push(demo.applicationController.runtime.snapshot().count);}
 return {values,active:globalThis.__emsQAWorkers.filter(w=>w.state!=='terminated').length,errors:globalThis.__emsQAWorkerErrors.length};
 })()`);assert.deepEqual(result.values,Array(12).fill(1));assert.equal(result.active,1);assert.equal(result.errors,0);await page.close();
 }finally{await browser?.close();await server.close();}
});
