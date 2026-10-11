import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticModule,createModuleDiagnostics} from '../tools/lib/worker-diagnostics.mjs';
const origin='https://owner:PRIVATE_SENTINEL@example.test/';
test('diagnostic module names exclude credentials, query/fragment, external URLs and opaque values',()=>{
 assert.equal(diagnosticModule('/web/ui-worker.mjs?token=PRIVATE_SENTINEL#PRIVATE_SENTINEL',origin),'/web/ui-worker.mjs');
 assert.equal(diagnosticModule('https://owner:PRIVATE_SENTINEL@example.test/src/ui/host.mjs',origin),'/src/ui/host.mjs');
 assert.equal(diagnosticModule('https://external.test/web/PRIVATE_SENTINEL.mjs',origin),'[external-module]');
 assert.equal(diagnosticModule({toString(){throw Error('Must not invoke');}},origin),'[opaque-module]');
});
test('bounded module diagnostics correlate response/failure and ignore headers, bodies and arbitrary error strings',()=>{
 const probe=createModuleDiagnostics(origin),emit=(method,params)=>probe.accept({sessionId:'page',method,params});
 emit('Network.requestWillBeSent',{requestId:'1',request:{url:'/web/ui-worker.mjs?PRIVATE_SENTINEL',headers:{Authorization:'PRIVATE_SENTINEL'}}});emit('Network.responseReceived',{requestId:'1',response:{status:404,headers:{secret:'PRIVATE_SENTINEL'}}});emit('Network.loadingFailed',{requestId:'1',errorText:'net::ERR_FAILED'});
 assert.deepEqual(probe.snapshot(),[{event:'response',module:'/web/ui-worker.mjs',status:404},{event:'loading-failed',module:'/web/ui-worker.mjs',error:'net::ERR_FAILED',canceled:false}]);
 for(let i=0;i<200;i++){emit('Network.requestWillBeSent',{requestId:String(i),request:{url:'/src/test.mjs'}});emit('Network.loadingFailed',{requestId:String(i),errorText:'PRIVATE_SENTINEL'});}
 const snapshot=probe.snapshot();assert.equal(snapshot.length,128);assert.ok(!JSON.stringify(snapshot).includes('PRIVATE_SENTINEL'));snapshot[0].module='mutated';assert.equal(probe.snapshot()[0].module,'/src/test.mjs');
});

test('server module tracing is opt-in and records real failed/completed responses without request data',async()=>{
 const {startStudioServer}=await import('../tools/serve.mjs');
 const plain=await startStudioServer({port:0}),observed=await startStudioServer({port:0,recordModules:true});
 try{
  await fetch(plain.origin+'/web/ui-worker.mjs');assert.deepEqual(plain.moduleDiagnostics(),{recent:[],failures:[]});
  assert.equal((await fetch(observed.origin+'/web/ui-worker.mjs?key=PRIVATE_SENTINEL',{headers:{Authorization:'PRIVATE_SENTINEL'}})).status,200);
  assert.equal((await fetch(observed.origin+'/src/missing-module.mjs?key=PRIVATE_SENTINEL')).status,404);
  const snapshot=observed.moduleDiagnostics();assert.equal(snapshot.recent[0].module,'/web/ui-worker.mjs');assert.equal(snapshot.recent[0].event,'response-complete');assert.equal(snapshot.failures[0].status,404);assert.ok(!JSON.stringify(snapshot).includes('PRIVATE_SENTINEL'));snapshot.recent[0].module='mutated';assert.equal(observed.moduleDiagnostics().recent[0].module,'/web/ui-worker.mjs');
 }finally{await plain.close();await observed.close();}
});

test('injected observation preserves native call arguments/errors and bounds retained lifecycle records',async()=>{
 const {runInNewContext}=await import('node:vm'),{workerProbeSource}=await import('../tools/lib/worker-diagnostics.mjs');
 class Native{
  constructor(path){if(path==='bad')throw Error('PRIVATE_SENTINEL');this.listeners={};}
  addEventListener(name,callback){this.listeners[name]=callback;}
  postMessage(...args){this.args=args;return 'native-return';}
  terminate(){if(!(this instanceof Native))throw TypeError('Invalid receiver');return 'native-terminate';}
 }
 const context={Worker:Native,URL,location:{href:'https://example.test/'},performance:{now:()=>1}};runInNewContext(workerProbeSource(),context);
 assert.throws(()=>new context.Worker('bad'),/PRIVATE_SENTINEL/);assert.equal(context.__emsQAWorkers[0].state,'constructor-failed');
 const worker=new context.Worker('/web/ui-worker.mjs?PRIVATE_SENTINEL');const unbound=worker.postMessage;assert.throws(()=>unbound('data'),TypeError);const other=new context.Worker('/web/ui-worker.mjs');worker.postMessage.call(other,'borrowed');assert.equal(other.args[0],'borrowed');assert.equal(context.__emsQAWorkers.at(-1).posted,1);other.terminate();const payload={secret:'PRIVATE_SENTINEL'},transfer=[];assert.equal(worker.postMessage(payload,transfer),'native-return');assert.equal(worker.args[0],payload);assert.equal(worker.args[1],transfer);const unboundTerminate=worker.terminate;assert.throws(()=>unboundTerminate(),TypeError);assert.equal(worker.terminate(),'native-terminate');
 for(let i=0;i<20;i++)worker.listeners.error({message:'PRIVATE_SENTINEL',filename:'/web/ui-worker.mjs?PRIVATE_SENTINEL',lineno:1});assert.equal(context.__emsQAWorkers.find(r=>r.id===2).state,'terminated');assert.equal(context.__emsQAWorkerErrors.length,16);assert.equal(context.__emsQAWorkerErrors.at(-1).afterTermination,true);
 for(let i=0;i<70;i++)new context.Worker('/web/ui-worker.mjs').terminate();assert.equal(context.__emsQAWorkers.length,64);assert.ok(!JSON.stringify({workers:context.__emsQAWorkers,errors:context.__emsQAWorkerErrors}).includes('PRIVATE_SENTINEL'));
});
