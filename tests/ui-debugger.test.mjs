import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {createUIWorkerRuntime} from '../src/ui/worker-client.mjs';
import {UIProjectEditor} from '../src/studio/ui-project.mjs';
import {parseUIWorkspace} from '../src/ui/project.mjs';
import {UIRuntime} from '../src/ui/model.mjs';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {createUIWorkerHost} from '../src/ui/worker-host.mjs';
const policy={capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']};
const source=()=>readFile(new URL('../examples/ui-source-counter.ems-ui.json',import.meta.url),'utf8');
function workerFactory(){const w=new Worker(new URL('./helpers/ui-worker.mjs',import.meta.url)),adapter={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',data=>adapter.onmessage?.({data}));w.on('error',e=>adapter.onerror?.(e));return adapter;}
async function wait(check){const end=Date.now()+3000;while(!check()){if(Date.now()>end)throw new Error('Pause timeout');await new Promise(r=>setTimeout(r,5));}}
test('real paused UI event keeps committed state and FIFO; resume commits without a second evaluator',async()=>{
 const pauses=[],ends=[],runtime=await createUIWorkerRuntime(await source(),{policy,workerFactory,debug:true,onPause:p=>pauses.push(p),onDebugEnd:e=>ends.push(e)});
 try{const first=runtime.dispatch('increment','press'),second=runtime.dispatch('increment','press');await wait(()=>pauses.length===1);
 assert.equal(runtime.snapshot().count,0);assert.equal(pauses[0].handler,'change');assert.ok(pauses[0].location);assert.equal(Object.hasOwn(pauses[0],'state'),false);assert.equal(Object.hasOwn(pauses[0],'value'),false);assert.equal(runtime.resume('wrong'),false);assert.equal(runtime.resume('step'),true);await wait(()=>pauses.length===2);assert.equal(runtime.snapshot().count,0);
 assert.equal(runtime.resume('continue'),true);assert.equal(await first,1);await wait(()=>pauses.length===3);assert.equal(runtime.snapshot().count,1);assert.notEqual(pauses[2].eventId,pauses[0].eventId);assert.equal(runtime.resume('continue'),true);assert.equal(await second,2);assert.equal(runtime.snapshot().count,2);assert.equal(runtime.resume(),false);assert.equal(ends.filter(e=>e.ok).length,2);
 }finally{await runtime.close();}
});
test('stopping after actual state write rolls back the paused transaction and preserves acknowledged state',async()=>{
 const base=createCoreRegistry(),saved=parseUIWorkspace(await source(),base),editor=new UIProjectEditor(saved.application,base,{sources:saved.sources});
 editor.applyHandler('change','fn update(delta:Number)->Number {state.count.write(state.count.read()+delta);return state.count.read();}','update');
 const pauses=[],runtime=await createUIWorkerRuntime(editor.source,{policy,workerFactory,debug:true,onPause:p=>pauses.push(p)});
 const first=runtime.dispatch('increment','press');await wait(()=>pauses.length===1);runtime.resume('continue');assert.equal(await first,1);
 const job=runtime.dispatch('increment','press'),rejected=assert.rejects(job,{code:'CANCELLED'});await wait(()=>pauses.length===2);
 for(let i=0;i<30&&pauses.at(-1).node!=='/body/1';i++){const previous=pauses.length;runtime.resume('step');await wait(()=>pauses.length>previous);}
 assert.equal(pauses.at(-1).kind,'return');assert.equal(pauses.at(-1).node,'/body/1');assert.equal(runtime.snapshot().count,1);
 await runtime.close();await rejected;assert.equal(runtime.snapshot().count,1);assert.equal(runtime.resume(),false);
 const local=new UIRuntime(editor.application,base,{policy,recordTrace:true}),controller=new AbortController();let entered;const ready=new Promise(resolve=>{entered=resolve;});
 const run=local.dispatch('increment','press',undefined,{signal:controller.signal,onControlEnter:e=>{if(e.node==='/body/1'){entered();return new Promise(()=>{});}}});
 await ready;assert.equal(local.snapshot().count,0);controller.abort();await assert.rejects(run,{code:'CANCELLED'});assert.equal(local.snapshot().count,0);assert.equal(local.trace()[0].status,'cancelled');await local.close();
});
test('debug host validates source witness before initialization and ignores stale resume IDs/tokens',async()=>{
 const data=JSON.parse(await source());data.sources.change.source=data.sources.change.source.replace('+ delta','+ delta*2');const replies=[],handle=createUIWorkerHost(v=>replies.push(v));
 await handle({action:'init',id:0,project:JSON.stringify(data),policy,maxQueue:64,recordTrace:false,debug:true});assert.equal(replies[0].error.code,'SOURCE_IR_MISMATCH');
 await assert.rejects(createUIWorkerRuntime(await source(),{policy,workerFactory,debug:'yes'}),{code:'INVALID_UI_WORKER'});
});

test('stale host resume commands cannot release a transaction and invalid observers fail before dispatch',async()=>{
 const replies=[],handle=createUIWorkerHost(value=>replies.push(value));await handle({action:'init',id:0,project:await source(),policy,maxQueue:64,recordTrace:false,debug:true});
 const run=handle({action:'dispatch',id:1,node:'increment',event:'press',value:undefined});await wait(()=>replies.some(r=>r.type==='paused'));
 const pause=replies.at(-1).pause;await handle({action:'resume',id:9,token:pause.token,mode:'continue'});await handle({action:'resume',id:1,token:pause.token+1,mode:'continue'});await handle({action:'resume',id:1,token:pause.token,mode:'unknown'});
 assert.equal(replies.length,2);await handle({action:'resume',id:1,token:pause.token,mode:'continue'});await run;assert.equal(replies.at(-1).value,1);
 const base=createCoreRegistry(),saved=parseUIWorkspace(await source(),base),local=new UIRuntime(saved.application,base,{policy});await assert.rejects(local.dispatch('increment','press',undefined,{onControlEnter:2}),{code:'INVALID_OPTION'});assert.equal(local.snapshot().count,0);await local.close();
});
test('paused UI deadline terminates the Worker and denied grants never expose a debug pause',async()=>{
 const pauses=[],runtime=await createUIWorkerRuntime(await source(),{policy,workerFactory,debug:true,timeout:1000,onPause:p=>pauses.push(p)});
 await assert.rejects(runtime.dispatch('increment','press'),{code:'EXECUTION_TIMEOUT'});assert.equal(pauses.length,1);assert.equal(runtime.snapshot().count,0);assert.equal(runtime.closed,true);assert.equal(runtime.resume(),false);
 await assert.rejects(createUIWorkerRuntime(await source(),{workerFactory,debug:true,onPause:()=>{throw new Error('must not pause');}}),{code:'PERMISSION_DENIED'});
});
test('client rejects extra debug payload fields before observers and reports terminal failure without values',async()=>{
 let exposed=false,terminated=false;const ends=[],adapter={postMessage:request=>queueMicrotask(()=>{if(request.action==='init')adapter.onmessage?.({data:{id:request.id,ok:true,value:null,snapshot:{count:0},view:{},trace:[]}});else adapter.onmessage?.({data:{id:request.id,type:'paused',pause:{phase:'enter',profile:'control',function:'update',node:'/body/0',kind:'return',type:null,callStack:['update'],frames:[1],step:1,location:null,token:1,handler:'change',value:'prohibited-payload'}}});}),terminate:()=>{terminated=true;}};
 const runtime=await createUIWorkerRuntime(await source(),{policy,debug:true,workerFactory:()=>adapter,onPause:()=>{exposed=true;},onDebugEnd:record=>ends.push(record)});
 await assert.rejects(runtime.dispatch('increment','press'),{code:'EXECUTION_WORKER'});assert.equal(exposed,false);assert.equal(terminated,true);assert.equal(runtime.snapshot().count,0);assert.deepEqual(ends,[{eventId:1,ok:false,code:'EXECUTION_WORKER'}]);
});
