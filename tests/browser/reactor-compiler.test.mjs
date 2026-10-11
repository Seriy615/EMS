import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCoreRegistry} from '../../src/reference/registry.mjs';
import {createStateRegistry} from '../../src/runtime/reactor.mjs';
import {parseEMSModule} from '../../src/frontend/index.mjs';
import {typecheckModule} from '../../src/frontend/check.mjs';
import {lowerCheckedModule} from '../../src/frontend/lower.mjs';
import {compileReactorJS} from '../../src/compiler/reactor.mjs';
import {startStudioServer} from '../../tools/serve.mjs';
import {serveQA} from '../../tools/lib/qa-server.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';

test('actual Chromium reactor output preserves FIFO/rollback/replay after EMS origin shutdown',async()=>{
 const state=[{id:'count',type:'Number',initial:0}],registry=createStateRegistry(createCoreRegistry(),state);
 const ir=lowerCheckedModule(typecheckModule(parseEMSModule('fn update(delta:Number,denominator:Number)->Number {let next=state.count.read()+delta;state.count.write(next);return next/denominator;}'),registry),'update',registry,{profile:'control'}).ir;
 const manifest={schemaVersion:'ems-reactor/1',id:'browser.counter',version:'1.0.0',state,handlers:[{event:'update',program:ir}]};
 const dir=await mkdtemp(join(tmpdir(),'ems-reactor-browser-')),runtime=await startStudioServer({port:0});let browser,staticServer,closed=false;
 try{
  await writeFile(join(dir,'session.mjs'),compileReactorJS(manifest,registry));await writeFile(join(dir,'index.html'),'<!doctype html><title>Independent state session</title>');staticServer=await serveQA(dir);browser=await launchChromium();
  async function exercise(createSession,replayEvents){const options={policy:{capabilities:['state.read','state.write'],allowedEffects:['state.read','state.write']},recordTrace:true};const s=createSession(options),r=createSession(options);const outputs=await Promise.all([{delta:2,denominator:1},{delta:100,denominator:0},{delta:3,denominator:1}].map(async inputs=>{try{return {value:await s.dispatch('update',inputs)};}catch(e){return {error:e.code,details:e.details};}}));await replayEvents(r,s.trace());const result={outputs,state:s.snapshot(),trace:s.trace(),replayed:r.trace()};await s.close();await r.close();return result;}
  const page=await browser.page(runtime.origin);
  const expected=await page.evaluate(`(async()=>{const {ReactorSession,createStateRegistry,replayEvents}=await import('/src/runtime/reactor.mjs');const {createCoreRegistry}=await import('/src/reference/registry.mjs');const manifest=${JSON.stringify(manifest)},registry=createStateRegistry(createCoreRegistry(),manifest.state);return (${exercise.toString()})(options=>new ReactorSession(manifest,registry,options),replayEvents);})()`);
  await page.close();await runtime.close();closed=true;
  const independent=await browser.page(staticServer.origin+'/index.html');const actual=await independent.evaluate(`(async()=>{const {createSession,replayEvents}=await import('./session.mjs');return (${exercise.toString()})(createSession,replayEvents);})()`);
  assert.deepEqual(actual,expected);assert.deepEqual(actual.state,{count:5});assert.deepEqual(actual.trace.map(e=>e.status),['committed','failed','committed']);assert.deepEqual(actual.replayed,actual.trace);assert.equal(staticServer.requests.some(path=>path.startsWith('/src/')||path.startsWith('/web/')),false);
 }finally{await browser?.close();if(!closed)await runtime.close();await staticServer?.close();await rm(dir,{recursive:true,force:true});}
});
