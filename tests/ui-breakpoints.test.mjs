import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {createUIWorkerRuntime} from '../src/ui/worker-client.mjs';
import {createUIWorkerHost} from '../src/ui/worker-host.mjs';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {UIProjectEditor} from '../src/studio/ui-project.mjs';
import {parseUIWorkspace} from '../src/ui/project.mjs';
import {compileUIHandler} from '../src/ui/source.mjs';
import {breakpointAtTextOffset} from '../src/studio/breakpoints.mjs';
import {normalizeUIDebugOptions} from '../src/ui/debug-policy.mjs';
const policy={capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']};
function workerFactory(){const w=new Worker(new URL('./helpers/ui-worker.mjs',import.meta.url)),a={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',data=>a.onmessage?.({data}));w.on('error',e=>a.onerror?.(e));return a;}
async function wait(check){const end=Date.now()+3000;while(!check()){if(Date.now()>end)throw Error('UI breakpoint timeout');await new Promise(r=>setTimeout(r,5));}}
async function fixture(){const base=createCoreRegistry(),saved=parseUIWorkspace(await readFile(new URL('../examples/ui-source-counter.ems-ui.json',import.meta.url),'utf8'),base),editor=new UIProjectEditor(saved.application,base,{sources:saved.sources});editor.applyHandler('change','fn update(delta:Number)->Number {state.count.write(state.count.read()+delta);return state.count.read();}','update');const witness=editor.sources.change,bundle=compileUIHandler(witness.source,witness.entry,editor.application,base),point=breakpointAtTextOffset(bundle,witness.source.indexOf('return'));return {editor,options:{start:'continue',breakpoints:[{handler:'change',point}],sources:{change:witness}}};}

test('real Worker point pauses after private write and updates queued events without resetting state',async()=>{
 const {editor,options}=await fixture(),pauses=[],runtime=await createUIWorkerRuntime(editor.source,{policy,workerFactory,debug:true,debugOptions:options,onPause:p=>pauses.push(p)});
 try{const first=runtime.dispatch('increment','press'),second=runtime.dispatch('increment','press');await wait(()=>pauses.length===1);assert.equal(pauses[0].node,'/body/1');assert.equal(runtime.snapshot().count,0);assert.equal(runtime.setDebugOptions({start:'continue',breakpoints:[],sources:{}}),true);assert.equal(runtime.snapshot().count,0);runtime.resume('continue');assert.equal(await first,1);assert.equal(await second,2);assert.equal(pauses.length,1);assert.equal(runtime.snapshot().count,2);assert.equal(runtime.setDebugOptions(options),false);}finally{await runtime.close();}
});
test('each FIFO event reuses precise handler point with distinct event IDs; Stop retains confirmed state',async()=>{
 const {editor,options}=await fixture(),pauses=[],runtime=await createUIWorkerRuntime(editor.source,{policy,workerFactory,debug:true,debugOptions:options,onPause:p=>pauses.push(p)});
 const first=runtime.dispatch('increment','press'),second=runtime.dispatch('increment','press'),rejected=assert.rejects(second,{code:'CANCELLED'});await wait(()=>pauses.length===1);runtime.resume('out');assert.equal(await first,1);await wait(()=>pauses.length===2);assert.notEqual(pauses[0].eventId,pauses[1].eventId);assert.equal(pauses[1].node,'/body/1');assert.equal(runtime.snapshot().count,1);await runtime.close();await rejected;assert.equal(runtime.snapshot().count,1);
});
test('stale witness and absent source address reject before UI dispatch, even when source IR is equivalent',async()=>{
 const {editor,options}=await fixture(),bad=structuredClone(options);bad.sources.change.source='// shift\n'+bad.sources.change.source;
 await assert.rejects(createUIWorkerRuntime(editor.source,{policy,workerFactory,debug:true,debugOptions:bad}),{code:'STALE_DEBUG_SOURCE'});
 const absent=structuredClone(options);absent.breakpoints[0].point.node='/body/999';await assert.rejects(createUIWorkerRuntime(editor.source,{policy,workerFactory,debug:true,debugOptions:absent}),{code:'INVALID_DEBUG_BREAKPOINT'});
 const mismatch=JSON.parse(editor.source);mismatch.sources.change.source+=' ';mismatch.sources.change.source=mismatch.sources.change.source.replace('return state.count.read();','return 0;');await assert.rejects(createUIWorkerRuntime(JSON.stringify(mismatch),{policy,workerFactory,debug:true,debugOptions:options}),{code:'SOURCE_IR_MISMATCH'});
});
test('live host rejects old event/token/stale policy without releasing the transaction or changing future policy',async()=>{
 const {editor,options}=await fixture(),replies=[],handle=createUIWorkerHost(r=>replies.push(r));await handle({action:'init',id:0,project:editor.source,policy,maxQueue:64,recordTrace:false,debug:true,debugOptions:options});const job=handle({action:'dispatch',id:1,node:'increment',event:'press',value:undefined});await wait(()=>replies.some(r=>r.type==='paused'));const pause=replies.at(-1).pause,empty={start:'continue',breakpoints:[],sources:{}};
 await handle({action:'debug-policy',id:99,token:pause.token,options:empty});await handle({action:'debug-policy',id:1,token:pause.token+1,options:empty});const stale=structuredClone(options);stale.sources.change.source+=' ';await handle({action:'debug-policy',id:1,token:pause.token,options:stale});assert.equal(replies.length,2);await handle({action:'resume',id:1,token:pause.token,mode:'continue'});await job;assert.equal(replies.at(-1).snapshot.count,1);
 const next=handle({action:'dispatch',id:2,node:'increment',event:'press',value:undefined});await wait(()=>replies.filter(r=>r.type==='paused').length===2);assert.equal(replies.at(-1).pause.node,'/body/1');await handle({action:'resume',id:2,token:replies.at(-1).pause.token,mode:'continue'});await next;assert.equal(replies.at(-1).snapshot.count,2);
});
test('bounded metadata, orphan witnesses and disabled-debug options reject before worker creation',async()=>{
 const {editor,options}=await fixture();let created=0;const factory=()=>{created++;throw Error('unexpected');};
 for(const bad of [null,{...options,value:'secret'},{...options,breakpoints:Array(65).fill(options.breakpoints[0])},{...options,sources:{}},{...options,sources:{...options.sources,orphan:{source:'x',entry:'x'}}}])await assert.rejects(createUIWorkerRuntime(editor.source,{debug:true,debugOptions:bad,workerFactory:factory}));
 await assert.rejects(createUIWorkerRuntime(editor.source,{debugOptions:options,workerFactory:factory}),{code:'INVALID_DEBUG_OPTION'});assert.equal(created,0);const copy=normalizeUIDebugOptions(options);options.sources.change.source='changed';assert.notEqual(copy.sources.change.source,options.sources.change.source);
});
