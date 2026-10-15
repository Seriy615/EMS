import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createUIWorkerRuntime} from '../src/ui/worker-client.mjs';
import {UI_WORKER_PROTOCOL} from '../src/ui/worker-protocol.mjs';
import {serializeUIProject} from '../src/ui/project.mjs';
import {fixture,policy} from './helpers/ui-fixture.mjs';
const ready={type:'ready',protocol:UI_WORKER_PROTOCOL};
const source=()=>{const {application,base}=fixture();return serializeUIProject(application,base);};
function transport(onRequest=()=>{}){
 const messages=[];let terminated=0;
 const worker={postMessage:message=>{messages.push(message);onRequest(message,worker);},terminate:()=>{terminated++;},reply:data=>worker.onmessage?.({data})};
 return {worker,messages,get terminated(){return terminated;},options:{workerFactory:()=>worker,waitForReady:true,loadTimeout:1000,initTimeout:1000}};
}
const ack=message=>({id:message.id,ok:true,value:null,snapshot:{count:0},view:{id:'root'}});
test('readiness gates initialization and loading never consumes the computation deadline',async()=>{
 const t=transport((m,w)=>queueMicrotask(()=>w.reply(ack(m)))),runtimePromise=createUIWorkerRuntime(source(),{...t.options,initTimeout:1});
 await new Promise(resolve=>setTimeout(resolve,40));assert.equal(t.messages.length,0);t.worker.reply(ready);const runtime=await runtimePromise;assert.deepEqual(t.messages.map(m=>m.action),['init']);assert.deepEqual(runtime.snapshot(),{count:0});await runtime.close();assert.equal(t.terminated,1);
});
test('loading, initialization and execution keep separate bounded deadlines and cleanup',async()=>{
 const loading=transport();await assert.rejects(createUIWorkerRuntime(source(),{...loading.options,loadTimeout:1}),e=>e.code==='UI_WORKER_LOAD_TIMEOUT'&&e.details.phase==='loading');assert.equal(loading.messages.length,0);assert.equal(loading.terminated,1);
 const initialization=transport(),pending=createUIWorkerRuntime(source(),{...initialization.options,initTimeout:1});initialization.worker.reply(ready);await assert.rejects(pending,e=>e.code==='EXECUTION_TIMEOUT'&&e.details.phase==='initialization');assert.equal(initialization.terminated,1);
 const execution=transport((m,w)=>{if(m.action==='init')queueMicrotask(()=>w.reply(ack(m)));}),started=createUIWorkerRuntime(source(),{...execution.options,timeout:1});execution.worker.reply(ready);const runtime=await started;await assert.rejects(runtime.dispatch('x','press'),e=>e.code==='EXECUTION_TIMEOUT'&&e.details.phase==='execution');assert.equal(runtime.closed,true);assert.deepEqual(runtime.snapshot(),{count:0});assert.equal(execution.terminated,1);
});
test('unready, mismatched, extra and accessor readiness messages fail without initializing EMS',async()=>{
 let reads=0;for(const message of [null,{...ready,protocol:'unknown'},{...ready,extra:true},{id:0,ok:true},Object.defineProperty({protocol:UI_WORKER_PROTOCOL},'type',{enumerable:true,get(){reads++;return 'ready';}})]){
  const t=transport(),pending=createUIWorkerRuntime(source(),t.options);t.worker.reply(message);await assert.rejects(pending,{code:'EXECUTION_WORKER'});assert.equal(t.messages.length,0);assert.equal(t.terminated,1);
 }assert.equal(reads,0);
 const t=transport((m,w)=>queueMicrotask(()=>w.reply(ack(m)))),pending=createUIWorkerRuntime(source(),t.options);t.worker.reply(ready);const runtime=await pending;t.worker.reply(ready);assert.equal(runtime.closed,true);assert.equal(t.terminated,1);
});
test('preview lifetime cancels loading, initialization and active sessions without accepting late snapshots',async()=>{
 let created=0;const early=new AbortController();early.abort();await assert.rejects(createUIWorkerRuntime(source(),{signal:early.signal,workerFactory:()=>{created++;}}),{code:'CANCELLED'});assert.equal(created,0);
 for(const phase of ['loading','initialization','running']){
  const signal=new AbortController(),t=transport((m,w)=>{if(phase==='running')queueMicrotask(()=>w.reply(ack(m)));}),pending=createUIWorkerRuntime(source(),{...t.options,signal:signal.signal});
  if(phase!=='loading')t.worker.reply(ready);
  let runtime;if(phase==='running')runtime=await pending;else if(phase==='initialization')await Promise.resolve();
  signal.abort();if(!runtime)await assert.rejects(pending,{code:'CANCELLED'});else{assert.equal(runtime.closed,true);t.worker.reply({id:99,ok:true,snapshot:{count:99},view:{}});assert.deepEqual(runtime.snapshot(),{count:0});}assert.equal(t.terminated,1);
 }
});
test('invalid load policy refuses before creating a worker; explicit legacy transport still initializes immediately',async()=>{
 for(const options of [{loadTimeout:0},{loadTimeout:60001},{waitForReady:1},{signal:{}}]){let created=0;await assert.rejects(createUIWorkerRuntime(source(),{...options,workerFactory:()=>{created++;}}));assert.equal(created,0);}
 const t=transport((m,w)=>queueMicrotask(()=>w.reply(ack(m))));const runtime=await createUIWorkerRuntime(source(),{workerFactory:t.options.workerFactory});assert.equal(t.messages.length,1);await runtime.close();
});
test('real worker module loading is separate from real EMS initialization and event execution',async()=>{
 const phases=[],hostURL=new URL('../src/ui/worker-host.mjs',import.meta.url).href;
 const workerFactory=()=>{
  const native=new Worker(new URL('data:text/javascript,'+encodeURIComponent(`import {parentPort} from 'node:worker_threads';parentPort.postMessage({qaPhase:'loading'});await new Promise(r=>setTimeout(r,1500));const {createUIWorkerHost}=await import(${JSON.stringify(hostURL)});parentPort.on('message',createUIWorkerHost(m=>parentPort.postMessage(m)));parentPort.postMessage(${JSON.stringify(ready)});`))),adapter={postMessage:m=>native.postMessage(m),terminate:()=>native.terminate()};
  native.on('message',data=>{if(data.qaPhase)phases.push(data.qaPhase);else adapter.onmessage?.({data});});native.on('error',e=>adapter.onerror?.(e));return adapter;
 };
 // All module loading/imports are outside the init budget. Real computation remains bounded.
 const runtime=await createUIWorkerRuntime(source(),{policy,workerFactory,waitForReady:true,loadTimeout:5000,initTimeout:1000,timeout:5000});
 try{assert.deepEqual(phases,['loading']);assert.equal(await runtime.dispatch('increment','press'),1);assert.equal(runtime.snapshot().count,1);}finally{await runtime.close();}
});

test('cancellation or transport failure at the init acknowledgement boundary never exposes a closed runtime',async()=>{
 for(const reason of ['cancel','duplicate']){
  const signal=new AbortController(),t=transport((m,w)=>{w.reply(ack(m));if(reason==='cancel')signal.abort();else w.reply(ready);}),pending=createUIWorkerRuntime(source(),{...t.options,signal:signal.signal});t.worker.reply(ready);
  await assert.rejects(pending,{code:reason==='cancel'?'CANCELLED':'EXECUTION_WORKER'});assert.equal(t.terminated,1);
 }
});
