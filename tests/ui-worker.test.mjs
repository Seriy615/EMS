import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createUIWorkerRuntime} from '../src/ui/worker-client.mjs';
import {serializeUIProject} from '../src/ui/project.mjs';
import {UIRuntime} from '../src/ui/model.mjs';
import {fixture,policy} from './helpers/ui-fixture.mjs';
function workerFactory(){
 const worker=new Worker(new URL('./helpers/ui-worker.mjs',import.meta.url)),adapter={postMessage:value=>worker.postMessage(value),terminate:()=>worker.terminate(),onmessage:null,onerror:null};
 worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',error=>adapter.onerror?.(error));return adapter;
}
test('actual worker transport preserves runtime FIFO, committed snapshots, typed input and failure rollback',async()=>{
 const {application,base}=fixture(),worker=await createUIWorkerRuntime(serializeUIProject(application,base),{policy,workerFactory,recordTrace:true}),local=new UIRuntime(application,base,{policy,recordTrace:true});
 try{
  assert.deepEqual(worker.snapshot(),local.snapshot());assert.deepEqual(await Promise.all([worker.dispatch('increment','press'),worker.dispatch('increment','press')]),[1,2]);await local.dispatch('increment','press');await local.dispatch('increment','press');assert.deepEqual(worker.snapshot(),local.snapshot());assert.deepEqual(worker.trace(),local.trace());
  await assert.rejects(worker.dispatch('fail','press'),{code:'DIV_BY_ZERO'});assert.equal(worker.snapshot().count,2);await assert.rejects(worker.dispatch('name','change','reject'),{code:'USER_THROW'});await worker.dispatch('name','change','kept');await worker.dispatch('locked','change',true);await assert.rejects(worker.dispatch('increment','press'),{code:'UI_EVENT_DISABLED'});assert.equal(worker.view().children[3].props.value,'kept');const copied=worker.snapshot();copied.count=99;assert.equal(worker.snapshot().count,2);
 }finally{await worker.close();await local.close();}
 await assert.rejects(worker.dispatch('increment','press'),{code:'SESSION_CLOSED'});
});
test('worker init enforces permissions and typed project validity before exposing a ready session',async()=>{
 const {application,base}=fixture(),source=serializeUIProject(application,base);await assert.rejects(createUIWorkerRuntime(source,{workerFactory}),{code:'PERMISSION_DENIED'});await assert.rejects(createUIWorkerRuntime('{',{policy,workerFactory}),{code:'INVALID_UI_PROJECT'});await assert.rejects(createUIWorkerRuntime(source,{policy,timeout:0,workerFactory}),{code:'INVALID_UI_WORKER'});
});
test('worker close cancels outstanding requests and does not accept late state replies',async()=>{
 const {application,base}=fixture(),worker=await createUIWorkerRuntime(serializeUIProject(application,base),{policy,workerFactory});await worker.dispatch('increment','press');const jobs=[worker.dispatch('increment','press'),worker.dispatch('increment','press')],outcomes=Promise.allSettled(jobs);await worker.close();for(const result of await outcomes){assert.equal(result.status,'rejected');assert.equal(result.reason.code,'CANCELLED');}assert.equal(worker.snapshot().count,1);assert.equal(worker.closed,true);
});
test('deadline stops a real worker computation and closes the session, preserving only confirmed snapshot',async()=>{
 const {UIProjectEditor}=await import('../src/studio/ui-project.mjs'),{application,base}=fixture(),editor=new UIProjectEditor(application,base);editor.applyHandler('increment','fn bounded(delta:Number)->Number {state.count.write(99);while true {} return delta;}','bounded');const short=await createUIWorkerRuntime(editor.source,{policy,timeout:1,initTimeout:5000,workerFactory});
 await assert.rejects(short.dispatch('increment','press'),{code:'EXECUTION_TIMEOUT'});assert.equal(short.closed,true);assert.equal(short.snapshot().count,0);
});

test('already aborted input never dispatches, transport queue overflow stays bounded and active abort stops session',async()=>{
 const {UIProjectEditor}=await import('../src/studio/ui-project.mjs'),{application,base}=fixture(),editor=new UIProjectEditor(application,base);editor.applyHandler('increment','fn bounded(delta:Number)->Number {while true {} return delta;}','bounded');
 const worker=await createUIWorkerRuntime(editor.source,{policy,workerFactory,maxQueue:1}),early=new AbortController();early.abort();await assert.rejects(worker.dispatch('increment','press',undefined,{signal:early.signal}),{code:'CANCELLED'});assert.equal(worker.closed,false);
 const signal=new AbortController(),first=worker.dispatch('increment','press',undefined,{signal:signal.signal}),second=worker.dispatch('increment','press'),outcomes=Promise.allSettled([first,second]);await assert.rejects(worker.dispatch('increment','press'),{code:'QUEUE_FULL'});signal.abort();for(const result of await outcomes){assert.equal(result.status,'rejected');assert.equal(result.reason.code,'CANCELLED');}await worker.close();assert.equal(worker.snapshot().count,0);
});
