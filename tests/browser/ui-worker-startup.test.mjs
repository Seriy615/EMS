import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {startStudioServer} from '../../tools/serve.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';
async function delayedStudio(delay){
 const studio=await startStudioServer({port:0});let workerRequests=0,holding=false;const timers=new Set(),held=[];
 const proxy=createServer((req,res)=>{
  function forward(){const upstream=request(studio.origin+req.url,{method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);res.on('close',()=>upstream.destroy());}
  // Keep this transport test independent of PWA cache installation. PWA has its own regression gate.
  if(req.url==='/web/service-worker.mjs'){res.writeHead(404);res.end();return;}
  if(req.url==='/web/ui-worker.mjs'&&req.headers['sec-fetch-dest']==='worker'){workerRequests++;if(holding){held.push(()=>{if(!res.destroyed)forward();});return;}const timer=setTimeout(()=>{timers.delete(timer);if(!res.destroyed)forward();},delay);timers.add(timer);}else forward();
 });
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
 return {origin:'http://127.0.0.1:'+proxy.address().port,get workerRequests(){return workerRequests;},holdWorkers(){holding=true;},releaseWorkers(){holding=false;for(const forward of held.splice(0))forward();},async close(){for(const timer of timers)clearTimeout(timer);await new Promise(resolve=>{proxy.close(resolve);proxy.closeAllConnections();});await studio.close();}};
}
async function until(page,expression){const end=Date.now()+15000;while(Date.now()<end){if(await page.evaluate(expression))return;await new Promise(r=>setTimeout(r,30));}throw Error('UI readiness deadline: '+expression);}
test('browser default Worker waits for actual delayed module load, then runs the same UI state handler',async()=>{
 const server=await delayedStudio(1500);let browser;
 try{browser=await launchChromium();const page=await browser.page(server.origin+'/README.md');
  // Preload only the client/project data; the actual Worker module is still cold and delayed.
  await page.evaluate(`(async()=>{globalThis.client=await import('/src/ui/worker-client.mjs');globalThis.project=await(await fetch('/examples/ui-counter.ems-ui.json')).text();globalThis.policy=await(await fetch('/examples/ui-policy.json')).json();})()`);
  const result=await page.evaluate(`(async()=>{const started=performance.now();const runtime=await client.createUIWorkerRuntime(project,{policy,initTimeout:1000,loadTimeout:5000});try{return {elapsed:performance.now()-started,value:await runtime.dispatch('increment','press'),snapshot:runtime.snapshot()};}finally{await runtime.close();}})()`);
  assert.ok(result.elapsed>=1500);assert.equal(server.workerRequests,1);assert.equal(result.value,1);assert.equal(result.snapshot.count,1);
 }finally{await browser?.close();await server.close();}
});
test('native UI Stop cancels an unready preview and restart mounts only the latest real Worker',async()=>{
 const server=await delayedStudio(2500);let browser;
 try{browser=await launchChromium();let page=await browser.page(server.origin+'/README.md');await page.evaluate(`(async()=>{const {ProjectManager}=await import('/src/studio/manager.mjs');new ProjectManager(localStorage).import(await(await fetch('/examples/native-ui.ems')).text(),'startup');})()`);await page.close();page=await browser.page(server.origin+'/web/ui-demo.html?project=startup&native=1');
  await until(page,`document.querySelector('#application [data-ems-ui="count"]')?.textContent==='1'`);
  const baseline=(await page.diagnostics()).workers.length;server.holdWorkers();
  await page.evaluate(`document.querySelector('#restart').click()`);
  await until(page,`globalThis.__emsQAWorkers?.length>${baseline}`);
  const initial=(await page.diagnostics()).workers.at(-1);assert.equal(initial.posted,0);assert.equal(initial.state,'created');
  await page.evaluate(`document.querySelector('#close').click()`);
  const stopped=(await page.diagnostics()).workers.find(w=>w.id===initial.id);assert.equal(stopped.state,'terminated');assert.equal(stopped.posted,0);
  server.releaseWorkers();await page.evaluate(`new Promise(resolve=>setTimeout(resolve,100))`);
  assert.equal(await page.evaluate(`document.querySelector('#application [data-ems-ui="count"]')===null`),true);
  assert.equal(await page.evaluate(`document.querySelector('#error').textContent`),'');
  await page.evaluate(`document.querySelector('#restart').click();document.querySelector('#restart').click()`);
  await until(page,`document.querySelector('#application [data-ems-ui="count"]')?.textContent==='1'`);
  await page.evaluate(`document.querySelector('#application [data-ems-ui="up"]').click()`);
  await until(page,`document.querySelector('#application [data-ems-ui="count"]')?.textContent==='2'`);
  assert.equal(await page.evaluate(`document.querySelector('#error').textContent`),'');
  const active=(await page.diagnostics()).workers.filter(w=>w.module==='/web/ui-worker.mjs').at(-1);assert.equal(active.state,'responding');
  await page.evaluate(`window.dispatchEvent(new Event('pagehide'))`);assert.equal((await page.diagnostics()).workers.find(w=>w.id===active.id).state,'terminated');
 }finally{await browser?.close();await server.close();}
});
