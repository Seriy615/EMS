import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {createStateRegistry,ReactorSession,replayEvents} from '../src/runtime/reactor.mjs';
import {parseEMSModule} from '../src/frontend/index.mjs';
import {typecheckModule} from '../src/frontend/check.mjs';
import {lowerCheckedModule} from '../src/frontend/lower.mjs';
import {compileReactorJS} from '../src/compiler/reactor.mjs';
const policy={capabilities:['state.read','state.write'],allowedEffects:['state.read','state.write']};
function fixture(source='fn test(delta:Number,denominator:Number)->Number {let next=state.count.read()+delta;state.count.write(next);return next/denominator;}',state=[{id:'count',type:'Number',initial:0}],profile='control'){
 const registry=createStateRegistry(createCoreRegistry(),state);
 const ir=lowerCheckedModule(typecheckModule(parseEMSModule(source),registry),'test',registry,{profile}).ir;
 const manifest={schemaVersion:'ems-reactor/1',id:'test.counter',version:'1.0.0',state,handlers:[{event:'update',program:ir}]};
 return {manifest,registry};
}
async function pair(f,options={}){const output=await import(`data:text/javascript,${encodeURIComponent(compileReactorJS(f.manifest,f.registry))}`);return [new ReactorSession(f.manifest,f.registry,{policy,recordTrace:true,...options}),output.createSession({policy,recordTrace:true,...options})];}
const outcome=async fn=>{try{return {value:await fn()};}catch(e){return {error:e.code,details:e.details};}};
test('standalone reactor matches actual FIFO commit, rollback, subsequent reads and replay',async()=>{
 const f=fixture(),sessions=await pair(f);const events=[{delta:2,denominator:1},{delta:100,denominator:0},{delta:3,denominator:1}];
 const results=await Promise.all(sessions.map(session=>Promise.all(events.map(inputs=>outcome(()=>session.dispatch('update',inputs))))));
 assert.deepEqual(results[1],results[0]);assert.equal(results[1][0].value,2);assert.equal(results[1][1].error,'DIV_BY_ZERO');assert.equal(results[1][2].value,5);
 assert.deepEqual(sessions[1].snapshot(),{count:5});assert.deepEqual(sessions[1].trace(),sessions[0].trace());
 const [,replayed]=await pair(f);await replayEvents(replayed,sessions[1].trace());assert.deepEqual(replayed.trace(),sessions[1].trace());
 await Promise.all([...sessions,replayed].map(s=>s.close()));
});
test('compiled session owns primitive/array state, detached results/traces and signed zero',async()=>{
 const f=fixture('fn test(values:Number[])->Number[] {state.count.write(-0);return state.values.write(values);}',[{id:'count',type:'Number',initial:-0},{id:'values',type:'NumberArray',initial:[-0]}]);
 const sessions=await pair(f);
 for(const s of sessions){assert.ok(Object.is(s.snapshot().count,-0));const values=[-0,3],pending=s.dispatch('update',{values});values[1]=99;const result=await pending;assert.deepEqual(result,[-0,3]);result[1]=42;const snapshot=s.snapshot();snapshot.values[1]=77;const trace=s.trace();trace[0].after.values[1]=88;assert.deepEqual(s.snapshot(),{count:-0,values:[-0,3]});assert.deepEqual(s.trace()[0].result,[-0,3]);await s.close();}
});
test('compiled admission failures retain policy/input/event errors and leave trace empty',async()=>{
 const f=fixture();
 for(const customPolicy of [{},{capabilities:policy.capabilities},policy]){
  const sessions=await pair(f,{policy:customPolicy});
  for(const [event,inputs] of [['missing',{}],['update',{delta:'bad',denominator:1}],['update',{delta:1,denominator:1}]]){
   const results=await Promise.all(sessions.map(s=>outcome(()=>s.dispatch(event,inputs))));assert.deepEqual(results[1],results[0]);
  }
  assert.deepEqual(sessions[1].trace(),sessions[0].trace());await Promise.all(sessions.map(s=>s.close()));
 }
});
test('compiled bounded queue, queued cancellation, close and replay preserve the shared kernel',async()=>{
 const f=fixture(),sessions=await pair(f,{maxQueue:1});
 for(const s of sessions){const controller=new AbortController();controller.abort();const first=outcome(()=>s.dispatch('update',{delta:1,denominator:1},{signal:controller.signal}));assert.equal((await outcome(()=>s.dispatch('update',{delta:2,denominator:1}))).error,'QUEUE_FULL');assert.equal((await first).error,'CANCELLED');const pending=outcome(()=>s.dispatch('update',{delta:3,denominator:1}));await s.close();assert.equal((await pending).error,'CANCELLED');assert.equal((await outcome(()=>s.dispatch('update',{}))).error,'SESSION_CLOSED');assert.deepEqual(s.snapshot(),{count:0});}
 assert.deepEqual(sessions[1].trace(),sessions[0].trace());const [,replayed]=await pair(f);await replayEvents(replayed,sessions[1].trace());assert.deepEqual(replayed.trace(),sessions[1].trace());await replayed.close();
});
test('async compiled event closes without committing staged state',async()=>{
 const f=fixture('async fn helper()->Number{return state.count.write(10);} async fn test()->Number {let task=helper();return await task;}');
 const sessions=await pair(f);for(const s of sessions){const pending=outcome(()=>s.dispatch('update'));await new Promise(resolve=>queueMicrotask(resolve));await s.close();assert.equal((await pending).error,'CANCELLED');assert.deepEqual(s.snapshot(),{count:0});}
 assert.deepEqual(sessions[1].trace(),sessions[0].trace());
});
test('reactor backend supports existing pure graph IR but rejects state graph/native effects and forged slots',async()=>{
 const pure=fixture('fn test()->Number{return 2+3;}',[],'auto');const sessions=await pair(pure);assert.equal(await sessions[1].dispatch('update'),5);await Promise.all(sessions.map(s=>s.close()));
 const stateGraph=fixture(undefined,undefined,'auto');assert.throws(()=>compileReactorJS(stateGraph.manifest,stateGraph.registry),{code:'UNSUPPORTED_TARGET'});
 const f=fixture(),item=f.registry.resolve('state.count.read');f.registry.items.set(item.id,{...item,execute:()=>0});assert.throws(()=>compileReactorJS(f.manifest,f.registry),{code:'UNSUPPORTED_TARGET'});
 const foreign=fixture();let calls=0;foreign.registry.registerAtomic({id:'host.write',inputs:{},output:'Number',effects:['io.write'],capabilities:['io.write'],execute:()=>++calls});foreign.manifest.handlers.push({event:'foreign',program:lowerCheckedModule(typecheckModule(parseEMSModule('fn test()->Number{return host.write();}'),foreign.registry),'test',foreign.registry,{profile:'control'}).ir});assert.throws(()=>compileReactorJS(foreign.manifest,foreign.registry),{code:'UNSUPPORTED_TARGET'});assert.equal(calls,0);
 const valid=fixture();assert.throws(()=>compileReactorJS({...valid.manifest,handlers:[...valid.manifest.handlers,...valid.manifest.handlers]},valid.registry),{code:'INVALID_REACTOR'});
});
test('independent fresh process executes state session, failure rollback and replay without EMS dependencies',async()=>{
 const f=fixture(),dir=await mkdtemp(join(tmpdir(),'ems-reactor-export-'));
 try{await writeFile(join(dir,'session.mjs'),compileReactorJS(f.manifest,f.registry));await writeFile(join(dir,'run.mjs'),`import {createSession,replayEvents} from './session.mjs';const options={policy:${JSON.stringify(policy)},recordTrace:true};const s=createSession(options);await s.dispatch('update',{delta:2,denominator:1});try{await s.dispatch('update',{delta:100,denominator:0});}catch(error){if(error.code!=='DIV_BY_ZERO')throw error;}await s.dispatch('update',{delta:3,denominator:1});const r=createSession(options);await replayEvents(r,s.trace());console.log(JSON.stringify({state:s.snapshot(),replayed:r.snapshot(),statuses:s.trace().map(e=>e.status)}));await s.close();await r.close();`);assert.deepEqual(JSON.parse(execFileSync(process.execPath,[join(dir,'run.mjs')],{cwd:dir,encoding:'utf8'})),{state:{count:5},replayed:{count:5},statuses:['committed','failed','committed']});}finally{await rm(dir,{recursive:true,force:true});}
});

test('CLI exports real typed source project with no dependency on its source tree at execution',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ems-reactor-cli-'));
 try{const project=new URL('../examples/ui-source-counter.ems-ui.json',import.meta.url).pathname;
 const tool=new URL('../tools/export-reactor.mjs',import.meta.url).pathname;
 execFileSync(process.execPath,[tool,project,'--out',join(dir,'session.mjs')],{encoding:'utf8'});
 const generated=await readFile(join(dir,'session.mjs'),'utf8');assert.doesNotMatch(generated,/\bimport\s*(?:\(|[{'*])/);
 await writeFile(join(dir,'run.mjs'),`import {createSession} from './session.mjs';const s=createSession({policy:${JSON.stringify(policy)}});console.log(await s.dispatch('change',{delta:3}),s.snapshot().count);await s.close();`);
 assert.equal(execFileSync(process.execPath,[join(dir,'run.mjs')],{cwd:dir,encoding:'utf8'}).trim(),'3 3');
 }finally{await rm(dir,{recursive:true,force:true});}
});
