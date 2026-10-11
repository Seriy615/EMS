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
import { validateControlIR, CONTROL_STREAM_PROFILE, CONTROL_FUTURE_PROFILE } from '../src/ir/control.mjs';
import { createStreamScope } from '../src/runtime/streams.mjs';
import { assertControlValueType } from '../src/semantics/control-algebraic.mjs';
import { createStateRegistry, ReactorSession, replayEvents } from '../src/runtime/reactor.mjs';

const lower=(source,registry=createCoreRegistry())=>lowerCheckedModule(typecheckModule(parseEMSModule(source),registry),'test',registry);
const compiled=async bundle=>(await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(bundle.ir,bundle.registry))}`)).execute;
const outcome=async fn=>{try{return {value:await fn()};}catch(error){return {code:error?.code,details:error?.details};}};
for(const [label,source,inputs,expected] of [
  ['producer failure closes in finally and is caught after draining','async fn produce(s:Stream<Number>)->Number { try { await stream.send(s,1); throw "failed"; } finally { stream.close(s); } } async fn test()->Number { let s:Stream<Number>=stream.channel(1); let producer=produce(s); let mut total=0; try { for await n in s { total=total+n; } return await producer; } catch(error:String){return total+10;} }',{},11],
  ['snapshot sum','async fn test(values:Number[])->Number { let mut sum=0; for await n in stream.fromArray(values) { sum=sum+n; } return sum; }',{values:[1,2,3]},6],
  ['empty source','async fn test(values:Number[])->Number { let mut sum=0; for await n in stream.fromArray(values) { sum=sum+n; } return sum; }',{values:[]},0],
  ['closed source','async fn test()->Number { let s=stream.fromArray([1,2]); stream.close(s); let mut sum=0; for await n in s { sum=sum+n; } return sum; }',{},0],
  ['cached next','async fn test()->Number { let s=stream.fromArray([3,4]); let f=stream.next(s); let mut total=0; match await f { Some(n)=>{total=n;}, None=>{} } match await f { Some(n)=>{return total+n;}, None=>{return 0;} } }',{},6],
  ['typed end','async fn test()->Option<Number> { let s=stream.fromArray([1]); let ignored=await stream.next(s); return await stream.next(s); }',{}, {tag:'None'}],
  ['channel drain after close','async fn test()->Number { let s:Stream<Number>=stream.channel(2); await stream.send(s,3); await stream.send(s,4); stream.close(s); let mut total=0; for await n in s { total=total+n; } return total; }',{},7],
  ['producer backpressure','async fn produce(s:Stream<Number>)->Number { for n in [1,2,3,4] { await stream.send(s,n); } stream.close(s); return 4; } async fn test()->Number { let s:Stream<Number>=stream.channel(1); let producer=produce(s); let mut total=0; for await n in s { total=total+n; } return total+(await producer); }',{},14],
  ['generic stream factory','fn channel<T>(hint:T)->Stream<T> { let s:Stream<T>=stream.channel(1); return s; } async fn test()->String { let s=channel("hint"); await stream.send(s,"value"); stream.close(s); match await stream.next(s) { Some(v)=>{return v;}, None=>{return "empty";} } }',{},'value'],
  ['array channel','async fn test()->Number { let s:Stream<Number[]>=stream.channel(1); await stream.send(s,[1,4]); stream.close(s); for await value in s { return value[1]; } return 0; }',{},4],
  ['Option element','async fn test()->Option<Number> { let s:Stream<Option<Number>>=stream.channel(1); await stream.send(s,None()); stream.close(s); for await value in s { return value; } return Some(1); }',{}, {tag:'None'}],
  ['break preserves shared source','async fn test()->Number { let s=stream.fromArray([1,2]); for await n in s { break; } match await stream.next(s) { Some(n)=>{return n;}, None=>{return 0;} } }',{},2],
  ['continue','async fn test()->Number { let mut total=0; for await n in stream.fromArray([1,2,3]) { if n==2 { continue; } total=total+n; } return total; }',{},4],
  ['alias','type Items=Stream<Number>; async fn test()->Number { let s:Items=stream.fromArray([3]); for await n in s { return n; } return 0; }',{},3],
  ['Future of Stream','async fn source()->Stream<Number> { return stream.fromArray([3]); } async fn test()->Number { for await n in await source() { return n; } return 0; }',{},3],
  ['idempotent close','fn test()->Boolean { let s=stream.fromArray([3]); return stream.close(s) && !stream.close(s); }',{},true],
  ['signed zero','async fn test()->Number { for await n in stream.fromArray([-0]) { return n; } return 1; }',{},-0]
])test(`stream runtime/standalone: ${label}`,async()=>{
  const bundle=lower(source),execute=await compiled(bundle);assert.equal(bundle.ir.profile,CONTROL_STREAM_PROFILE);
  const ir=parseIR(serializeIR(bundle.ir,bundle.registry),bundle.registry);assert.deepEqual(await executeIR(ir,inputs,bundle.registry),expected);assert.deepEqual(await execute(inputs),expected);
});

test('bounded channel writer FIFO applies backpressure and retains every value',async()=>{
  const scope=createStreamScope({}),s=scope.channel('Number',1);await scope.send(s,1);
  let second=false,third=false;const b=scope.send(s,2).then(()=>second=true),c=scope.send(s,3).then(()=>third=true);
  await Promise.resolve();assert.equal(second,false);assert.equal(third,false);
  assert.deepEqual(await scope.next(s),{tag:'Some',value:1});await b;assert.equal(third,false);
  assert.deepEqual(await scope.next(s),{tag:'Some',value:2});await c;
  scope.close(s);assert.deepEqual(await scope.next(s),{tag:'Some',value:3});assert.deepEqual(await scope.next(s),{tag:'None'});scope.finish();
});

test('pending reader FIFO and close preserve explicit end-of-stream',async()=>{
  const scope=createStreamScope({}),s=scope.channel('String',1),a=scope.next(s),b=scope.next(s);
  await scope.send(s,'first');await scope.send(s,'second');assert.deepEqual(await a,{tag:'Some',value:'first'});assert.deepEqual(await b,{tag:'Some',value:'second'});
  const pending=scope.next(s);scope.close(s);assert.deepEqual(await pending,{tag:'None'});assert.throws(()=>scope.send(s,'late'),{code:'STREAM_CLOSED'});scope.finish();
});

test('closing a full channel rejects blocked sends without losing already accepted data',async()=>{
  const scope=createStreamScope({}),s=scope.channel('Number',1);await scope.send(s,1);
  const rejected=scope.send(s,2);scope.close(s);await assert.rejects(rejected,{code:'STREAM_CLOSED'});
  assert.deepEqual(await scope.next(s),{tag:'Some',value:1});assert.deepEqual(await scope.next(s),{tag:'None'});scope.finish();
});

test('snapshot source and queued algebraic values do not alias producer memory',async()=>{
  const scope=createStreamScope({}),values=[1,-0],source=scope.fromArray(values);values[0]=9;assert.deepEqual(await scope.next(source),{tag:'Some',value:1});assert.deepEqual(await scope.next(source),{tag:'Some',value:-0});
  const s=scope.channel('Option<NumberArray>',1),item={tag:'Some',value:[2,3]};await scope.send(s,item);item.value[0]=9;
  assert.deepEqual(await scope.next(s),{tag:'Some',value:{tag:'Some',value:[2,3]}});scope.finish();
});

test('stream handles are scope-owned, typed, opaque and never invoke fake async iterators',async()=>{
  const scope=createStreamScope({}),other=createStreamScope({}),s=scope.channel('Number',1);
  let touched=false;const fake={get [Symbol.asyncIterator](){touched=true;throw new Error('unsafe');}};
  assert.equal(Object.getPrototypeOf(s),null);assert.equal(Object.isFrozen(s),true);
  assert.throws(()=>assertControlValueType(fake,'Stream<Number>','test',undefined,scope.check),{code:'TYPE_MISMATCH'});assert.equal(touched,false);
  assert.throws(()=>other.next(s),{code:'TYPE_MISMATCH'});assert.throws(()=>scope.send(s,'wrong'),{code:'TYPE_MISMATCH'});
  assert.throws(()=>assertControlValueType(s,'Stream<String>','test',undefined,scope.check),{code:'TYPE_MISMATCH'});scope.finish();assert.equal(scope.check(s,'Number'),false);other.finish();
});

test('cancelled stream waiters reject, release budgets and reject late writes',async()=>{
  const controller=new AbortController(),scope=createStreamScope({signal:controller.signal}),a=scope.channel('Number',1),b=scope.channel('Number',1);
  await scope.send(a,1);const blocked=scope.send(a,2),read=scope.next(b);controller.abort();
  await assert.rejects(blocked,{code:'CANCELLED'});await assert.rejects(read,{code:'CANCELLED'});assert.throws(()=>scope.send(a,3),{code:'CANCELLED'});scope.finish();
});

test('stream capacity, creation and pending-operation limits are bounded',async()=>{
  const scope=createStreamScope({maxStreams:2,maxStreamCapacity:2,maxPendingStreamOps:1});
  for(const capacity of [0,-1,1.5,3])assert.throws(()=>scope.channel('Number',capacity),{code:'STREAM_CAPACITY'});
  const a=scope.channel('Number',1),b=scope.channel('Number',1);assert.throws(()=>scope.fromArray([]),{code:'STREAM_LIMIT'});
  const first=scope.next(a);assert.throws(()=>scope.next(b),{code:'STREAM_PENDING_LIMIT'});await scope.send(a,1);await first;
  const second=scope.next(b);scope.close(b);assert.deepEqual(await second,{tag:'None'});scope.finish();
});

test('stream compiler/runtime errors and protected terminal limits agree',async()=>{
  for(const [source,options,code] of [
    ['fn test()->Number { let s:Stream<Number>=stream.channel(0); return 1; }',{},'STREAM_CAPACITY'],
    ['async fn test()->Number { let s=stream.fromArray([1]); return await stream.send(s,2); }',{},'TYPE_MISMATCH'],
    ['async fn test()->Boolean { let s=stream.fromArray([1]); return await stream.send(s,2); }',{},'STREAM_CLOSED'],
    ['fn test()->Number { try { stream.fromArray([1]); stream.fromArray([2]); return 1; } finally { return 2; } }',{maxStreams:1},'STREAM_LIMIT'],
    ['async fn test()->Number { let s:Stream<Number>=stream.channel(1); let a=stream.next(s); try { await stream.next(s); return 1; } finally { return 2; } }',{maxPendingStreamOps:1},'STREAM_PENDING_LIMIT']
  ]){
    if(code==='TYPE_MISMATCH'){assert.throws(()=>lower(source),{code});continue;}
    const bundle=lower(source),execute=await compiled(bundle),result=await outcome(()=>executeIR(bundle.ir,{},bundle.registry,options));assert.equal(result.code,code);assert.deepEqual(await outcome(()=>execute({},options)),result);
  }
});

test('for-await exact step budgets match across interpreter and standalone',async()=>{
  const bundle=lower('async fn test()->Number { let mut total=0; for await n in stream.fromArray([1,2,3]) { total=total+n; } return total; }'),execute=await compiled(bundle);
  for(let maxSteps=1;maxSteps<=70;maxSteps++)assert.deepEqual(await outcome(()=>executeIR(bundle.ir,{},bundle.registry,{maxSteps})),await outcome(()=>execute({},{maxSteps})));
});

test('stream type/arity/async-context checking and handle escape gates reject bad source',()=>{
  for(const [source,code] of [
    ['fn test()->Number { let s=stream.channel(1); return 0; }','CANNOT_INFER'],
    ['fn test()->Number { let s=stream.fromArray(1); return 0; }','TYPE_MISMATCH'],
    ['async fn test()->Number { let s=stream.fromArray([1]); stream.send(s,"bad"); return 0; }','TYPE_MISMATCH'],
    ['fn test()->Number { for await n in stream.fromArray([1]) { return n; } return 0; }','INVALID_AWAIT'],
    ['async fn test()->Number { for await n in [1] { return n; } return 0; }','TYPE_MISMATCH'],
    ['fn test()->Number { for n in stream.fromArray([1]) { return n; } return 0; }','TYPE_MISMATCH'],
    ['fn test()->Number { stream.close(); return 0; }','CALL_ARITY'],
    ['fn test()->Stream<Number> { return stream.fromArray([1]); }','UNSUPPORTED_PROFILE'],
    ['fn test()->Boolean { let s=stream.fromArray([1]); return s==s; }','TYPE_MISMATCH'],
    ['fn test()->Number { let s:Stream<Future<Number>>=stream.channel(1); return 0; }','TYPE_MISMATCH']
  ])assert.throws(()=>lower(source),{code});
});

test('serialized stream IR independently verifies operation signatures and async loop',()=>{
  const bundle=lower('async fn test()->Number { let mut total=0; for await n in stream.fromArray([1]) { total=total+n; } return total; }');
  const old=structuredClone(bundle.ir);old.profile=CONTROL_FUTURE_PROFILE;assert.throws(()=>validateControlIR(old,bundle.registry),{code:'INVALID_IR'});for(const fn of old.functions)delete fn.localEffects;assert.throws(()=>validateControlIR(old,bundle.registry),{code:'UNSUPPORTED_PROFILE'});
  const bad=structuredClone(bundle.ir);bad.functions[0].async=false;assert.throws(()=>validateControlIR(bad,bundle.registry),{code:'INVALID_AWAIT'});
  for(const [change,code] of [[node=>node.operation='missing','INVALID_IR'],[node=>node.arguments=[],'CALL_ARITY'],[node=>node.arguments[0]={kind:'literal',type:'String',value:'bad'},'TYPE_MISMATCH']]){
    const ir=structuredClone(bundle.ir);change(ir.functions[0].body[1].iterable);assert.throws(()=>validateControlIR(ir,bundle.registry),{code});
  }
});

test('invalid stream budgets reject before attaching execution listeners',async()=>{
  const bundle=lower('fn test()->Boolean { let s=stream.fromArray([1]); return stream.close(s); }'),execute=await compiled(bundle);
  for(const key of ['maxStreams','maxStreamCapacity','maxPendingStreamOps'])for(const value of [0,-1,1.5,'1']){
    let subscriptions=0;const signal={aborted:false,addEventListener(){subscriptions++;},removeEventListener(){subscriptions--;}};
    const options={signal,[key]:value};await assert.rejects(executeIR(bundle.ir,{},bundle.registry,options),{code:'INVALID_BUDGET'});assert.equal(subscriptions,0);
    await assert.rejects(execute({},options),{code:'INVALID_BUDGET'});assert.equal(subscriptions,0);
  }
});

test('CLI exports stream pipeline independently into a new process',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ems-streams-')),cli=new URL('../tools/ems.mjs',import.meta.url).pathname;
  try{
    await writeFile(join(directory,'source.ems'),'async fn test()->Number { let mut total=0; for await n in stream.fromArray([1,2,3]) { total=total+n; } return total; }');
    for(const args of [['module-ir','source.ems','--entry','test','--out','program.ir.json'],['ir-build','program.ir.json','--out','program.mjs']]){
      const result=spawnSync(process.execPath,[cli,...args],{cwd:directory,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
    }
    await writeFile(join(directory,'run.mjs'),'import {execute} from "./program.mjs";console.log(await execute({}));');
    const result=spawnSync(process.execPath,['run.mjs'],{cwd:directory,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(Number(result.stdout),6);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('for-await and blocked producer cancellation settle runtime/standalone task outcomes',{timeout:3000},async()=>{
  for(const source of [
    'async fn test()->Number { let s:Stream<Number>=stream.channel(1); for await n in s { return n; } return 0; }',
    'async fn produce(s:Stream<Number>)->Number { await stream.send(s,1); await stream.send(s,2); return 2; } async fn test()->Number { let s:Stream<Number>=stream.channel(1); return await produce(s); }'
  ]){
    const bundle=lower(source),execute=await compiled(bundle);
    for(const run of [options=>executeIR(bundle.ir,{},bundle.registry,options),options=>execute({},options)]){
      const controller=new AbortController(),pending=run({signal:controller.signal});await new Promise(resolve=>setImmediate(resolve));controller.abort();await assert.rejects(pending,{code:'CANCELLED'});
    }
  }
});

test('stream event pipeline commits FIFO values, rolls back on failure and reproduces trace',async()=>{
  const state=[{id:'count',type:'Number',initial:0}],registry=createStateRegistry(createCoreRegistry(),state);
  const source='async fn produce(s:Stream<Number>)->Number { for n in [1,2,3] { await stream.send(s,n); } stream.close(s); return 3; } async fn test(fail:Boolean)->Number { let s:Stream<Number>=stream.channel(1); let producer=produce(s); for await n in s { if fail && n==2 { throw "private failure"; } state.count.write(state.count.read()+n); } return state.count.read(); }';
  const bundle=lower(source,registry),manifest={schemaVersion:'ems-reactor/1',id:'stream.events',version:'1',state,handlers:[{event:'update',program:bundle.ir}]};
  const options={policy:{allowedEffects:['state.read','state.write'],capabilities:['state.read','state.write']},recordTrace:true};
  const session=new ReactorSession(manifest,registry,options);assert.equal(await session.dispatch('update',{fail:false}),6);
  await assert.rejects(session.dispatch('update',{fail:true}),{code:'USER_THROW'});assert.deepEqual(session.snapshot(),{count:6});assert.equal(JSON.stringify(session.trace()).includes('private failure'),false);
  const replay=new ReactorSession(manifest,registry,options);await replayEvents(replay,session.trace());assert.deepEqual(replay.trace(),session.trace());await session.close();await replay.close();
  assert.throws(()=>compileIRToJS(bundle.ir,registry),{code:'UNSUPPORTED_TARGET'});
});

test('stream producer policy is checked before task execution and pure declarations cannot conceal effects',async()=>{
  const registry=createCoreRegistry();let calls=0;registry.registerAtomic({id:'external',inputs:{},output:'Number',effects:['io.read'],capabilities:['io.read'],execute:()=>++calls});
  const source='async fn produce(s:Stream<Number>)->Number { await stream.send(s,external()); stream.close(s); return 1; } async fn test()->Number { let s:Stream<Number>=stream.channel(1); produce(s); for await n in s { return n; } return 0; }';
  const bundle=lower(source,registry);await assert.rejects(executeIR(bundle.ir,{},registry),{code:'PERMISSION_DENIED'});assert.equal(calls,0);
  assert.equal(await executeIR(bundle.ir,{},registry,{allowedEffects:['io.read'],capabilities:['io.read']}),1);assert.equal(calls,1);
  assert.throws(()=>lower(source.replace('produce(s:Stream<Number>)->Number {','produce(s:Stream<Number>)->Number requires pure {'),registry),{code:'EFFECT_MISMATCH'});
});

test('producer/consumer budgets preserve differential errors and total results',async()=>{
  const bundle=lower('async fn produce(s:Stream<Number>)->Number { for n in [1,2,3] { await stream.send(s,n); } stream.close(s); return 3; } async fn test()->Number { let s:Stream<Number>=stream.channel(1); let producer=produce(s); let mut total=0; for await n in s { total=total+n; } return total+(await producer); }'),execute=await compiled(bundle);
  for(let maxSteps=1;maxSteps<=160;maxSteps++)assert.deepEqual(await outcome(()=>executeIR(bundle.ir,{},bundle.registry,{maxSteps})),await outcome(()=>execute({},{maxSteps})));
});

test('local Stream effects propagate through functions and cannot be forged as pure or erased from IR',async()=>{
  const source='async fn consume(s:Stream<Number>)->Number { for await n in s { return n; } return 0; } async fn test()->Number { return await consume(stream.fromArray([1])); }';
  const bundle=lower(source);assert.deepEqual(bundle.ir.functions.find(fn=>fn.id==='test').localEffects,['stream.create','stream.read']);
  assert.throws(()=>lower(source.replace('test()->Number {','test()->Number requires pure {')),{code:'EFFECT_MISMATCH'});
  const forged=structuredClone(bundle.ir);forged.functions.find(fn=>fn.id==='test').localEffects=[];assert.throws(()=>validateControlIR(forged,bundle.registry),{code:'EFFECT_MISMATCH'});
  const registry=createCoreRegistry();registry.registerAtomic({id:'external',inputs:{},output:'Number',effects:['stream.read'],execute:()=>1});
  const external=lower('fn test()->Number { let s=stream.fromArray([1]); return external(); }',registry);
  await assert.rejects(executeIR(external.ir,{},registry),{code:'EFFECT_DENIED'});assert.throws(()=>compileIRToJS(external.ir,registry),{code:'UNSUPPORTED_TARGET'});
});
