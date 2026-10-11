import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createCoreRegistry } from '../src/reference/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import { executeIR, compileIRToJS, parseIR, serializeIR } from '../src/ir/index.mjs';
import { validateControlIR, CONTROL_FUTURE_PROFILE, CONTROL_ALGEBRAIC_PROFILE } from '../src/ir/control.mjs';
import { createFutureScope } from '../src/runtime/futures.mjs';
import { assertControlValueType } from '../src/semantics/control-algebraic.mjs';
import { createStateRegistry, ReactorSession, replayEvents } from '../src/runtime/reactor.mjs';

const lower=(source,registry=createCoreRegistry())=>lowerCheckedModule(typecheckModule(parseEMSModule(source),registry),'test',registry);
const compiled=async bundle=>(await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(bundle.ir,bundle.registry))}`)).execute;
const outcome=async fn=>{try{return {value:await fn()};}catch(error){return {code:error?.code,details:error?.details,thrown:error?.value};}};
for(const [label,source,inputs,expected] of [
  ['async entry','async fn test()->Number { return 3; }',{},3],
  ['typed await','async fn value(n:Number)->Number { return n+1; } async fn test()->Number { return await value(3); }',{},4],
  ['repeated await','async fn value()->Number { return 3; } async fn test()->Number { let future=value(); return (await future)+(await future); }',{},6],
  ['generic async','async fn identity<T>(value:T)->T { return value; } async fn test()->String { return await identity("text"); }',{},'text'],
  ['future generic helper','fn identity<T>(value:T)->T { return value; } async fn value()->Number { return 3; } async fn test()->Number { return await identity(value()); }',{},3],
  ['sync helper returning future','async fn value()->Number { return 7; } fn launch()->Future<Number> { return value(); } async fn test()->Number { return await launch(); }',{},7],
  ['future parameter','async fn value()->Number { return 3; } async fn consume(future:Future<Number>)->Number { return await future; } async fn test()->Number { return await consume(value()); }',{},3],
  ['nested future','async fn value()->Number { return 4; } async fn launch()->Future<Number> { return value(); } async fn test()->Number { return await (await launch()); }',{},4],
  ['algebraic future payload','async fn value()->Result<Number,String> { return Ok(3); } async fn test()->Number { match await value() { Ok(n)=>{return n;}, Err(_)=>{return 0;} } }',{},3],
  ['future in internal Option','async fn value()->Number { return 3; } async fn test()->Number { let optional=Some(value()); match optional { Some(future)=>{return await future;}, None=>{return 0;} } }',{},3],
  ['caught task failure','async fn bad()->Number { throw "failed"; } async fn test()->Number { try { return await bad(); } catch(error:String){ return 8; } }',{},8],
  ['uncaught abandoned success is joined','async fn value()->Number { return 3; } fn test()->Number { value(); return 7; }',{},7],
  ['loop awaits','async fn value(n:Number)->Number { return n; } async fn test()->Number { let mut total=0; for n in [1,2,3] { total=total+(await value(n)); } return total; }',{},6],
  ['signed zero','async fn value()->Number { return -0; } async fn test()->Number { return await value(); }',{},-0],
  ['await preserves return then finally','async fn value()->Number { return 3; } async fn test()->Number { let mut n=0; try { return await value(); } finally { n=9; } }',{},3]
])test(`future runtime/standalone: ${label}`,async()=>{
  const bundle=lower(source),execute=await compiled(bundle);assert.equal(bundle.ir.profile,CONTROL_FUTURE_PROFILE);
  const ir=parseIR(serializeIR(bundle.ir,bundle.registry),bundle.registry);
  assert.deepEqual(await executeIR(ir,inputs,bundle.registry),expected);assert.deepEqual(await execute(inputs),expected);
});

test('unobserved errors reject root completion; observed typed errors remain handled',async()=>{
  for(const source of [
    'async fn bad()->Number { throw "unobserved"; } fn test()->Number { bad(); return 1; }',
    'async fn bad()->Number { throw "unobserved"; } async fn test()->Number { return await bad(); }'
  ]){const bundle=lower(source),execute=await compiled(bundle),result=await outcome(()=>executeIR(bundle.ir,{},bundle.registry));
    assert.equal(result.code,'USER_THROW');assert.equal(result.thrown,'unobserved');assert.deepEqual(await outcome(()=>execute({})),result);}
});

test('single Future executes host implementation once and caches repeated awaits',async()=>{
  const registry=createCoreRegistry();let calls=0;
  registry.registerAtomic({id:'external',inputs:{},output:'Number',effects:['io.read'],execute:async()=>++calls});
  const bundle=lower('extern async fn external()->Number; async fn test()->Number { let f=external(); return (await f)+(await f); }',registry);
  await assert.rejects(executeIR(bundle.ir,{},registry),{code:'EFFECT_DENIED'});assert.equal(calls,0);
  assert.equal(await executeIR(bundle.ir,{},registry,{allowedEffects:['io.read']}),2);assert.equal(calls,1);
  assert.throws(()=>compileIRToJS(bundle.ir,registry),{code:'UNSUPPORTED_TARGET'});
});

test('independent hot tasks start before either controlled host operation settles',{timeout:3000},async()=>{
  const registry=createCoreRegistry(),started=[],release=new Map();let both;
  const ready=new Promise(resolve=>both=resolve);
  registry.registerAtomic({id:'external',inputs:{n:'Number'},output:'Number',effects:['io.read'],execute:({n})=>new Promise(resolve=>{
    started.push(n);release.set(n,resolve);if(started.length===2)both();
  })});
  const bundle=lower('extern async fn external(n:Number)->Number; async fn work(n:Number)->Number { return await external(n); } async fn test()->Number { let a=work(1); let b=work(2); return (await a)+(await b); }',registry);
  const result=executeIR(bundle.ir,{},registry,{allowedEffects:['io.read'],maxDepth:2});await ready;
  assert.deepEqual(started,[1,2]);release.get(2)(2);release.get(1)(1);assert.equal(await result,3);
});

test('future limits and task call ancestry match across targets and cannot be suppressed',async()=>{
  const nested='1+('.repeat(25)+'recurse(n-1)'+')'.repeat(25);
  for(const [source,options,code] of [
    [`fn recurse(n:Number)->Number { if n<=0 { return 0; } return ${nested}; } async fn test()->Number { try { return recurse(50); } finally { return 2; } }`,{maxDepth:256},'EVALUATION_DEPTH'],
    ['async fn value()->Number { return 1; } async fn test()->Number { try { value(); value(); return 2; } finally { return 3; } }',{maxFutures:1},'FUTURE_LIMIT'],
    ['async fn recurse(n:Number)->Number { if n<=0 { return 1; } return await recurse(n-1); } async fn test()->Number { return await recurse(10); }',{maxDepth:4},'CALL_DEPTH'],
    ['async fn recurse()->Number { recurse(); return 1; } fn test()->Number { recurse(); return 0; }',{maxDepth:4},'CALL_DEPTH']
  ]){const bundle=lower(source),execute=await compiled(bundle),result=await outcome(()=>executeIR(bundle.ir,{},bundle.registry,options));
    assert.equal(result.code,code);assert.deepEqual(await outcome(()=>execute({},options)),result);}
});

test('future shared step thresholds are identical in runtime and standalone',async()=>{
  const bundle=lower('async fn value(n:Number)->Number { return n+1; } async fn test()->Number { let f=value(3); return (await f)+(await f); }'),execute=await compiled(bundle);
  for(let maxSteps=1;maxSteps<=45;maxSteps++)assert.deepEqual(await outcome(()=>executeIR(bundle.ir,{},bundle.registry,{maxSteps})),await outcome(()=>execute({},{maxSteps})));
});

test('future validation rejects malformed IR, old profile, illegal await, equality and live boundaries',()=>{
  const bundle=lower('async fn value()->Number { return 3; } async fn test()->Number { return await value(); }');
  const invalid=structuredClone(bundle.ir);invalid.functions.find(fn=>fn.id==='test').async=false;assert.throws(()=>validateControlIR(invalid,bundle.registry),{code:'INVALID_AWAIT'});
  const wrong=structuredClone(bundle.ir);wrong.functions.find(fn=>fn.id==='test').body[0].value.value={kind:'literal',type:'Number',value:1};assert.throws(()=>validateControlIR(wrong,bundle.registry),{code:'TYPE_MISMATCH'});
  const older=structuredClone(bundle.ir);older.profile=CONTROL_ALGEBRAIC_PROFILE;assert.throws(()=>validateControlIR(older,bundle.registry),{code:'INVALID_IR'});
  for(const source of [
    'async fn value()->Number { return 3; } fn test()->Future<Number> { return value(); }',
    'async fn test(value:Future<Number>)->Number { return await value; }',
    'async fn value()->Number { return 3; } fn test()->Option<Future<Number>> { return Some(value()); }'
  ])assert.throws(()=>lower(source),{code:'UNSUPPORTED_PROFILE'});
  for(const source of [
    'async fn value()->Number { return 3; } fn test()->Boolean { let f=value(); return f==f; }',
    'async fn value()->Number { return 3; } fn test()->Number { throw value(); }',
    'fn test()->Number { try { return 1; } catch(future:Future<Number>){return 0;} }'
  ])assert.throws(()=>lower(source),{code:'TYPE_MISMATCH'});
});

test('Future handles are scoped, typed and cannot be forged with native Promise or thenable',async()=>{
  const scope=createFutureScope({},()=>{}),other=createFutureScope({},()=>{}),handle=scope.start('Number',()=>1);
  assert.equal(Object.getPrototypeOf(handle),null);assert.equal(Object.isFrozen(handle),true);assert.equal('then' in handle,false);
  assert.equal(await scope.wait(handle,'Number'),1);assert.equal(await scope.wait(handle,'Number'),1);
  await assert.rejects(other.wait(handle,'Number'),{code:'TYPE_MISMATCH'});
  let touched=false;const thenable={get then(){touched=true;throw new Error('unsafe');}};
  assert.throws(()=>assertControlValueType(thenable,'Future<Number>','test',scope.check),{code:'TYPE_MISMATCH'});assert.equal(touched,false);
  assert.throws(()=>assertControlValueType(Promise.resolve(1),'Future<Number>','test',scope.check),{code:'TYPE_MISMATCH'});
  scope.close();assert.equal(scope.check(handle,'Number'),false);other.close();
});

test('future result typing validates actual host completion and preserves host throw null',async()=>{
  for(const [operation,code] of [[()=>Promise.resolve('wrong'),'TYPE_MISMATCH'],[()=>Promise.reject(null),null]]){
    const registry=createCoreRegistry();registry.registerAtomic({id:'external',inputs:{},output:'Number',execute:operation});
    const bundle=lower('extern async fn external()->Number; async fn test()->Number { return await external(); }',registry);
    if(code)await assert.rejects(executeIR(bundle.ir,{},registry),{code:'TYPE_MISMATCH'});
    else {let caught=false;try{await executeIR(bundle.ir,{},registry);}catch(error){caught=true;assert.equal(error,null);}assert.equal(caught,true);}
  }
});

test('pure async binding code generation uses declared trusted emit implementation',async()=>{
  const registry=createCoreRegistry();registry.registerAtomic({id:'external',inputs:{n:'Number'},output:'Number',execute:async({n})=>n+1,emitJS:args=>`(${args.n}+1)`});
  const bundle=lower('extern async fn external(n:Number)->Number; async fn test()->Number { return await external(4); }',registry);
  assert.equal(await executeIR(bundle.ir,{},registry),5);assert.equal(await (await compiled(bundle))({}),5);
});

test('cancelled host Future stops EMS task outcomes and late state writes; finally cannot suppress',{timeout:3000},async()=>{
  const state=[{id:'count',type:'Number',initial:0}],registry=createStateRegistry(createCoreRegistry(),state),controller=new AbortController();let started,hostContext;
  const ready=new Promise(resolve=>started=resolve);registry.registerAtomic({id:'external',inputs:{},output:'Number',effects:['io.wait'],execute:(_,{signal,state})=>{
    hostContext={signal,state};started();return new Promise(()=>{});
  }});
  const bundle=lower('extern async fn external()->Number; async fn test()->Number { try { let f=external(); return await f; } finally { state.count.write(9); return 1; } }',registry);
  const session=new ReactorSession({schemaVersion:'ems-reactor/1',id:'futures',version:'1',state,handlers:[{event:'run',program:bundle.ir}]},registry,
    {policy:{allowedEffects:['io.wait','state.write'],capabilities:['state.write']}});
  const result=session.dispatch('run',{}, {signal:controller.signal});await ready;controller.abort();await assert.rejects(result,{code:'CANCELLED'});
  assert.equal(hostContext.signal.aborted,true);assert.throws(()=>hostContext.state.write('count',4),{code:'CANCELLED'});assert.deepEqual(session.snapshot(),{count:0});await session.close();
});

test('event commit joins discarded successful tasks and rolls back unobserved failed tasks',async()=>{
  const state=[{id:'count',type:'Number',initial:0}],registry=createStateRegistry(createCoreRegistry(),state);
  const good=lower('async fn work()->Number { return state.count.write(5); } fn test()->Number { work(); return 0; }',registry);
  const bad=lower('async fn work()->Number { state.count.write(9); throw "failed"; } fn test()->Number { work(); return 0; }',registry);
  const manifest={schemaVersion:'ems-reactor/1',id:'future.events',version:'1',state,handlers:[{event:'good',program:good.ir},{event:'bad',program:bad.ir}]};
  const options={policy:{allowedEffects:['state.write'],capabilities:['state.write']},recordTrace:true},session=new ReactorSession(manifest,registry,options);
  assert.equal(await session.dispatch('good'),0);assert.deepEqual(session.snapshot(),{count:5});await assert.rejects(session.dispatch('bad'),{code:'USER_THROW'});assert.deepEqual(session.snapshot(),{count:5});
  const replay=new ReactorSession(manifest,registry,options);await replayEvents(replay,session.trace());assert.deepEqual(replay.trace(),session.trace());await session.close();await replay.close();
});

test('future option budget validates before execution; pre-aborted standalone rejects',async()=>{
  const bundle=lower('async fn test()->Number { return 3; }'),execute=await compiled(bundle);
  for(const maxFutures of [0,-1,1.5,100001,'2'])assert.deepEqual(await outcome(()=>executeIR(bundle.ir,{},bundle.registry,{maxFutures})),await outcome(()=>execute({},{maxFutures})));
  const controller=new AbortController();controller.abort();await assert.rejects(execute({}, {signal:controller.signal}),{code:'CANCELLED'});
});

test('CLI exports async standalone into a new process outside EMS',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ems-futures-')),cli=new URL('../tools/ems.mjs',import.meta.url).pathname;
  try{
    await writeFile(join(directory,'source.ems'),'async fn value()->Number { return 4; } async fn test()->Number { return await value(); }');
    for(const args of [['module-ir','source.ems','--entry','test','--out','program.ir.json'],['ir-build','program.ir.json','--out','program.mjs']]){
      const result=spawnSync(process.execPath,[cli,...args],{cwd:directory,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
    }
    await writeFile(join(directory,'run.mjs'),'import {execute} from "./program.mjs";console.log(await execute({}));');
    const result=spawnSync(process.execPath,['run.mjs'],{cwd:directory,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(Number(result.stdout),4);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('scope abort stops awaiting an uncooperative operation without unhandled rejection',{timeout:3000},async()=>{
  const controller=new AbortController(),scope=createFutureScope({signal:controller.signal},()=>{});
  let reject;const pending=new Promise((_,failure)=>reject=failure),handle=scope.start('Number',()=>pending);
  const waiting=scope.wait(handle,'Number');await Promise.resolve();controller.abort();await assert.rejects(waiting,{code:'CANCELLED'});
  await scope.abort();scope.close();reject(new Error('late external failure'));await new Promise(resolve=>setImmediate(resolve));
});

test('concurrent tasks share limits while preserving declared join and await error order',async()=>{
  for(const source of [
    'async fn work(n:Number)->Number { let mut total=0; while total<n { total=total+1; } return total; } async fn test()->Number { let a=work(3); let b=work(4); return (await b)+(await a); }',
    'async fn bad(n:Number)->Number { throw n; } fn test()->Number { bad(1); bad(2); return 0; }',
    'async fn bad(n:Number)->Number { throw n; } async fn test()->Number { let a=bad(1); let b=bad(2); try { return await b; } catch(error:Number){return error;} }'
  ]){const bundle=lower(source),execute=await compiled(bundle);
    for(let maxSteps=1;maxSteps<=140;maxSteps++)assert.deepEqual(await outcome(()=>executeIR(bundle.ir,{},bundle.registry,{maxSteps})),await outcome(()=>execute({},{maxSteps})));
  }
});

test('unreachable async declaration preserves synchronous entry profile and standalone result',async()=>{
  const bundle=lower('async fn unused()->Number { return 3; } fn test()->Number { return 1; }');
  assert.notEqual(bundle.ir.profile,CONTROL_FUTURE_PROFILE);const value=(await compiled(bundle))({});assert.equal(value,1);
});

test('constant array lowering retains call profile without referring to checker scope',async()=>{
  const source='fn test()->Number[] { return [1,2,-0]; }',bundle=lower(source);
  assert.equal(bundle.ir.schemaVersion,'ems-ir/1');assert.deepEqual(await executeIR(bundle.ir,{},bundle.registry),[1,2,-0]);
  const registry=createCoreRegistry(),checked=typecheckModule(parseEMSModule(source),registry);
  const legacy=lowerCheckedModule(checked,'test',registry,{profile:'call'});assert.deepEqual(await executeIR(legacy.ir,{},legacy.registry),[1,2,-0]);
});

test('async binding marker and pinned version are independently verified',()=>{
  const registry=createCoreRegistry();registry.registerAtomic({id:'external',inputs:{},output:'Number',execute:()=>1});
  const bundle=lower('extern async fn external()->Number; async fn test()->Number { return await external(); }',registry);
  for(const [change,code] of [[target=>target.async='yes','INVALID_IR'],[target=>delete target.async,'INVALID_IR'],[target=>target.async=false,'TYPE_MISMATCH'],[target=>target.version='9','CONTRACT_VERSION']]){
    const ir=structuredClone(bundle.ir);change(ir.functions[0].body[0].value.value.target);assert.throws(()=>validateControlIR(ir,registry),{code});
  }
});

test('FIFO next event waits for discarded task completion before observing committed state',{timeout:3000},async()=>{
  const state=[{id:'count',type:'Number',initial:0}],registry=createStateRegistry(createCoreRegistry(),state);let started,release;
  const ready=new Promise(resolve=>started=resolve);
  registry.registerAtomic({id:'external',inputs:{},output:'Number',effects:['io.read'],execute:()=>new Promise(resolve=>{release=resolve;started();})});
  const first=lower('async fn work()->Number { let value=external(); return state.count.write(value); } fn test()->Number { work(); return 0; }',registry);
  const next=lower('fn test()->Number { return state.count.read(); }',registry);
  const manifest={schemaVersion:'ems-reactor/1',id:'fifo.futures',version:'1',state,handlers:[{event:'first',program:first.ir},{event:'next',program:next.ir}]};
  const session=new ReactorSession(manifest,registry,{policy:{allowedEffects:['io.read','state.read','state.write'],capabilities:['state.read','state.write']}});
  const pending=session.dispatch('first');await ready;let completed=false;
  const queued=session.dispatch('next').then(value=>{completed=true;return value;});await Promise.resolve();
  assert.equal(completed,false);assert.deepEqual(session.snapshot(),{count:0});release(7);
  assert.equal(await pending,0);assert.equal(await queued,7);assert.deepEqual(session.snapshot(),{count:7});await session.close();
});
