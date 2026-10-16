import test from 'node:test';
import assert from 'node:assert/strict';
import {bounded,installedWorker,activateWorker} from '../web/pwa-update.mjs';
class Worker extends EventTarget{state='installing';postMessage(){}}
test('PWA installation settles on installed/redundant and does not wait indefinitely',async()=>{
 const worker=new Worker(),registration={installing:worker,waiting:null,active:null};
 const pending=installedWorker(registration);registration.waiting=worker;worker.state='installed';worker.dispatchEvent(new Event('statechange'));assert.equal(await pending,worker);
 registration.waiting=null;worker.state='redundant';await assert.rejects(installedWorker(registration),/UPDATE_INSTALL_FAILED/);
 worker.state='installing';await assert.rejects(installedWorker(registration,{timeout:5}),/UPDATE_TIMEOUT/);
 await assert.rejects(installedWorker(null),/UPDATE_UNAVAILABLE/);
});
test('PWA activation requires the requested controller and frees listeners on timeout/failure',async()=>{
 const worker=new Worker(),service=new EventTarget();service.controller=null;
 const activate=activateWorker(worker,service);service.controller={};service.dispatchEvent(new Event('controllerchange'));service.controller=worker;service.dispatchEvent(new Event('controllerchange'));await activate;
 service.controller=null;await assert.rejects(activateWorker(worker,service,{timeout:5}),/UPDATE_ACTIVATION_TIMEOUT/);
 worker.postMessage=()=>{throw Error('Cannot post');};await assert.rejects(activateWorker(worker,service),/Cannot post/);
 const later=installedWorker({active:worker});assert.equal(await later,worker);
});
test('PWA registration timeout rejects while fulfilled operations retain their result',async()=>{
 assert.equal(await bounded(Promise.resolve(7),5),7);await assert.rejects(bounded(new Promise(()=>{}),5),/UPDATE_TIMEOUT/);
});
