import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,open,rm } from 'node:fs/promises';
import { fstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createCoreRegistry } from '../src/reference/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import { executeIR,compileIRToJS,serializeIR,parseIR } from '../src/ir/index.mjs';
import { validateControlIR,CONTROL_RESOURCE_PROFILE,CONTROL_STREAM_PROFILE } from '../src/ir/control.mjs';
import { createResourceScope } from '../src/runtime/resources.mjs';
import { createStateRegistry,ReactorSession,replayEvents } from '../src/runtime/reactor.mjs';

const lower=(source,registry=createCoreRegistry())=>lowerCheckedModule(typecheckModule(parseEMSModule(source),registry),'test',registry);
const compiled=async bundle=>(await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(bundle.ir,bundle.registry))}`)).execute;
const outcome=async fn=>{try{return {value:await fn()};}catch(error){return {code:error?.code,details:error?.details};}};
for(const [label,source,expected] of [
  ['read/write cell','fn test()->Number { using value=resource.cell(3); resource.write(value,4); return resource.read(value); }',4],
  ['array copy','fn test()->Number { using value=resource.cell([1,4]); return resource.read(value)[1]; }',4],
  ['algebraic cell','fn test()->Option<Number> { using value=resource.cell(Some(3)); return resource.read(value); }',{tag:'Some',value:3}],
  ['generic helper','fn read<T>(value:ResourceHandle<T>)->T { return resource.read(value); } fn test()->String { using value=resource.cell("text"); return read(value); }','text'],
  ['alias','type Cell=ResourceHandle<Number>; fn test()->Number { using value:Cell=resource.cell(3); return resource.read(value); }',3],
  ['manual close plus using','fn test()->Boolean { using value=resource.cell(3); resource.close(value); return resource.isClosed(value); }',true],
  ['nested scope closes','fn test()->Boolean { let value=resource.cell(3); { using inner=value; } return resource.isClosed(value); }',true],
  ['loop break','fn test()->Number { let mut n=0; while n<3 { using value=resource.cell(n); n=n+1; if n==2 { break; } } return n; }',2],
  ['loop continue','fn test()->Number { let mut n=0; while n<3 { using value=resource.cell(n); n=n+1; continue; } return n; }',3],
  ['error cleanup before catch','fn test()->Boolean { let value=resource.cell(3); try { using inner=value; throw "failed"; } catch(error:String){ return resource.isClosed(value); } }',true],
  ['factory ownership','fn cell(n:Number)->ResourceHandle<Number> { return resource.cell(n); } fn test()->Number { using value=cell(3); return resource.read(value); }',3],
  ['borrowed identity','fn identity<T>(value:T)->T { return value; } fn test()->Number { using value=resource.cell(3); return resource.read(identity(value)); }',3],
  ['async borrow awaited','async fn read(value:ResourceHandle<Number>)->Number { return resource.read(value); } async fn test()->Number { using value=resource.cell(3); return await read(value); }',3],
  ['signed zero','fn test()->Number { using value=resource.cell(-0); return resource.read(value); }',-0]
])test(`resource runtime/standalone: ${label}`,async()=>{
  const bundle=lower(source),execute=await compiled(bundle);assert.equal(bundle.ir.profile,CONTROL_RESOURCE_PROFILE);
  const ir=parseIR(serializeIR(bundle.ir,bundle.registry),bundle.registry),a=[],b=[];
  assert.deepEqual(await executeIR(ir,{},bundle.registry,{onResourceCleanup:event=>a.push(event)}),expected);
  assert.deepEqual(await execute({},{onResourceCleanup:event=>b.push(event)}),expected);assert.deepEqual(a,b);assert.ok(a.length);
});

test('using LIFO and scope fallback invoke each cleanup once across return',async()=>{
  const bundle=lower('fn test()->Number { let spare=resource.cell(0); using first=resource.cell(1); using second=resource.cell(2); return resource.read(second); }'),execute=await compiled(bundle);
  for(const run of [options=>executeIR(bundle.ir,{},bundle.registry,options),options=>execute({},options)]){
    const order=[];assert.equal(await run({onResourceCleanup:event=>order.push(event.resource)}),2);assert.deepEqual(order,[2,1,0]);
  }
});

test('use-after-close, double close, duplicate ownership and escaping using fail consistently',async()=>{
  for(const [source,code] of [
    ['fn test()->Number { let value=resource.cell(1); resource.close(value); return resource.read(value); }','RESOURCE_CLOSED'],
    ['fn test()->Boolean { let value=resource.cell(1); resource.close(value); return resource.close(value); }','RESOURCE_CLOSED'],
    ['fn test()->Number { using a=resource.cell(1); using b=a; return 1; }','RESOURCE_OWNERSHIP'],
    ['fn escaped()->ResourceHandle<Number> { using a=resource.cell(1); return a; } fn test()->Number { let value=escaped(); return resource.read(value); }','RESOURCE_ESCAPE'],
    ['fn escaped()->ResourceHandle<Number> { using a=resource.cell(1); if true { return a; } return a; } fn test()->Number { return resource.read(escaped()); }','RESOURCE_ESCAPE']
  ]){const bundle=lower(source),execute=await compiled(bundle),actual=await outcome(()=>executeIR(bundle.ir,{},bundle.registry));assert.equal(actual.code,code);assert.deepEqual(await outcome(()=>execute({})),actual);}
});

test('cleanup survives exhausted steps and resource limits, with separate signal/budget',async()=>{
  for(const [source,options,code] of [
    ['fn test()->Number { using value=resource.cell(3); while true {} return 1; }',{maxSteps:20},'STEP_LIMIT'],
    ['fn test()->Number { using a=resource.cell(1); using b=resource.cell(2); return 1; }',{maxResources:1},'RESOURCE_LIMIT']
  ]){const bundle=lower(source),execute=await compiled(bundle);
    for(const run of [opts=>executeIR(bundle.ir,{},bundle.registry,opts),opts=>execute({},opts)]){
      const records=[];const result=await outcome(()=>run({...options,onResourceCleanup:event=>records.push(event)}));assert.equal(result.code,code);assert.equal(records.length,1);assert.equal(records[0].phase,'released');
    }
  }
});

test('resource exact step thresholds agree; cleanup does not spend execution ticks',async()=>{
  const bundle=lower('fn test()->Number { using value=resource.cell(2); resource.write(value,3); return resource.read(value); }'),execute=await compiled(bundle);
  for(let maxSteps=1;maxSteps<=40;maxSteps++)assert.deepEqual(await outcome(()=>executeIR(bundle.ir,{},bundle.registry,{maxSteps})),await outcome(()=>execute({},{maxSteps})));
});

test('Resource type/using/pure/escape/profile checks reject prohibited programs and IR',()=>{
  for(const [source,code] of [
    ['fn test()->Number { using mut value=resource.cell(1); return 1; }','RESOURCE_OWNERSHIP'],
    ['fn test()->Number { using value=1; return value; }','TYPE_MISMATCH'],
    ['fn test()->ResourceHandle<Number> { return resource.cell(1); }','UNSUPPORTED_PROFILE'],
    ['fn test()->Boolean { let value=resource.cell(1); return value==value; }','TYPE_MISMATCH'],
    ['fn test()->Number requires pure { using value=resource.cell(1); return resource.read(value); }','EFFECT_MISMATCH']
  ])assert.throws(()=>lower(source),{code});
  const bundle=lower('fn test()->Number { using value=resource.cell(1); return resource.read(value); }');
  const old=structuredClone(bundle.ir);old.profile=CONTROL_STREAM_PROFILE;assert.throws(()=>validateControlIR(old,bundle.registry),{code:'INVALID_IR'});
  const forged=structuredClone(bundle.ir);forged.functions[0].localEffects=[];assert.throws(()=>validateControlIR(forged,bundle.registry),{code:'EFFECT_MISMATCH'});
});

test('owned cells are copied, scoped and opaque',async()=>{
  const scope=createResourceScope({}),other=createResourceScope({}),original=[1,2],handle=scope.cell(original,'NumberArray');original[0]=9;
  assert.deepEqual(await scope.read(handle),[1,2]);const read=await scope.read(handle);read[0]=8;assert.deepEqual(await scope.read(handle),[1,2]);
  await assert.rejects(other.read(handle),{code:'TYPE_MISMATCH'});assert.equal(Object.getPrototypeOf(handle),null);
  await scope.close(handle);await assert.rejects(scope.read(handle),{code:'RESOURCE_CLOSED'});await scope.finish();await other.finish();assert.equal(scope.check(handle,'NumberArray'),false);
});

test('real native file binding enforces grants and closes OS descriptor on success and failure',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ems-resource-file-')),path=join(directory,'value.txt'),opened=[];
  await writeFile(path,'actual file');const registry=createCoreRegistry();
  registry.registerResource({id:'io.file',inputs:{path:'String'},valueType:'String',effects:['fs.file'],capabilities:['fs.file'],
    acquire:async({path})=>{const handle=await open(path,'r');opened.push({handle,fd:handle.fd});return handle;},read:handle=>handle.readFile('utf8'),release:handle=>handle.close()});
  try{
    for(const source of ['fn test(path:String)->String { using file=io.file(path); return resource.read(file); }','fn test(path:String)->String { using file=io.file(path); throw "failed"; }']){
      const bundle=lower(source,registry);await assert.rejects(executeIR(bundle.ir,{path},registry),{code:'PERMISSION_DENIED'});const before=opened.length;
      const result=await outcome(()=>executeIR(bundle.ir,{path},registry,{allowedEffects:['fs.file'],capabilities:['fs.file']}));
      assert.equal(opened.length,before+1);if(source.includes('throw'))assert.equal(result.code,'USER_THROW');else assert.equal(result.value,'actual file');
      assert.throws(()=>fstatSync(opened.at(-1).fd),{code:'EBADF'});assert.throws(()=>compileIRToJS(bundle.ir,registry),{code:'UNSUPPORTED_TARGET'});
    }
  }finally{for(const {handle} of opened)await handle.close().catch(()=>{});await rm(directory,{recursive:true,force:true});}
});

test('native release failures are reported while remaining resources still close in LIFO',async()=>{
  const registry=createCoreRegistry(),closed=[];
  registry.registerResource({id:'native',inputs:{n:'Number'},valueType:'Number',acquire:({n})=>n,read:n=>n,release:n=>{closed.push(n);if(n===2)throw new Error('private release error');}});
  const bundle=lower('fn test()->Number { using a=native(1); using b=native(2); return 3; }',registry);
  const result=await outcome(()=>executeIR(bundle.ir,{},registry));assert.equal(result.code,'RESOURCE_CLEANUP');assert.deepEqual(closed,[2,1]);assert.equal(JSON.stringify(result).includes('private'),false);
});

test('native resource protocol validates callbacks, payloads, pinned versions and read-only writes',async()=>{
  const definition={id:'native',inputs:{},valueType:'Number',acquire:()=>1,read:n=>n,release:()=>{}};
  for(const change of [{acquire:1},{release:null},{write:1},{version:''}])assert.throws(()=>createCoreRegistry().registerResource({...definition,...change}));
  for(const [change,source,code] of [
    [{},'fn test()->Number { using value=native(); return resource.write(value,2); }','RESOURCE_READ_ONLY'],
    [{read:()=>"invalid"},'fn test()->Number { using value=native(); return resource.read(value); }','TYPE_MISMATCH']
  ]){let closed=0;const registry=createCoreRegistry().registerResource({...definition,...change,release:()=>closed++}),bundle=lower(source,registry);
    await assert.rejects(executeIR(bundle.ir,{},registry),{code});assert.equal(closed,1);
    const stale=structuredClone(bundle.ir);const call=stale.functions[0].body[0].value;call.target.version='2.0.0';assert.throws(()=>validateControlIR(stale,registry),{code:'CONTRACT_VERSION'});
  }
});

test('cleanup preserves primary user failure and attaches payload-free secondary diagnostics',async()=>{
  let closed=0;const registry=createCoreRegistry().registerResource({id:'native',inputs:{},valueType:'Number',acquire:()=>1,read:n=>n,release:()=>{closed++;throw new Error('private native data');}});
  const bundle=lower('fn test()->Number { using value=native(); throw "primary"; }',registry);
  await assert.rejects(executeIR(bundle.ir,{},registry),error=>{
    assert.equal(error.code,'USER_THROW');assert.equal(error.value,'primary');assert.equal(error.resourceCleanupFailures[0].code,'HOST_ERROR');
    assert.equal(JSON.stringify(error.resourceCleanupFailures).includes('private'),false);return true;
  });assert.equal(closed,1);
});

test('bounded cleanup reports timeout and observes late release completion',{timeout:3000},async()=>{
  let release;const registry=createCoreRegistry();registry.registerResource({id:'native',inputs:{},valueType:'Number',acquire:()=>1,read:n=>n,release:()=>new Promise(resolve=>release=resolve)});
  const bundle=lower('fn test()->Number { using value=native(); return 1; }',registry),events=[];
  const result=await outcome(()=>executeIR(bundle.ir,{},registry,{maxCleanupMs:10,onResourceCleanup:event=>events.push(event)}));assert.equal(result.code,'RESOURCE_CLEANUP');assert.equal(result.details.failures[0].code,'CLEANUP_TIMEOUT');
  release();await new Promise(resolve=>setImmediate(resolve));assert.equal(events.at(-1).phase,'released');
});

test('cancelled acquisition releases late native result and does not leak',{timeout:3000},async()=>{
  const controller=new AbortController(),registry=createCoreRegistry();let acquired,deliver,closed=0;const ready=new Promise(resolve=>acquired=resolve);
  registry.registerResource({id:'native',inputs:{},valueType:'Number',acquire:()=>new Promise(resolve=>{deliver=resolve;acquired();}),read:n=>n,release:()=>closed++});
  const bundle=lower('fn test()->Number { using value=native(); return resource.read(value); }',registry);
  const pending=executeIR(bundle.ir,{},registry,{signal:controller.signal,maxCleanupMs:10});await ready;controller.abort();await assert.rejects(pending,{code:'CANCELLED'});deliver(1);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,1);
});

test('using cleanup on active read cancellation waits for quiescence before deferred native release',{timeout:3000},async()=>{
  const controller=new AbortController(),registry=createCoreRegistry();let reading,deliver,closed=0;const ready=new Promise(resolve=>reading=resolve);
  registry.registerResource({id:'native',inputs:{},valueType:'Number',acquire:()=>1,read:()=>new Promise(resolve=>{deliver=resolve;reading();}),release:(_,{signal})=>{assert.equal(signal.aborted,false);closed++;}});
  const bundle=lower('fn test()->Number { using value=native(); return resource.read(value); }',registry);
  const pending=executeIR(bundle.ir,{},registry,{signal:controller.signal,maxCleanupMs:10});await ready;controller.abort();await assert.rejects(pending,{code:'CANCELLED'});assert.equal(closed,0);deliver(1);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,1);
});

test('resource-backed event cleanup precedes commit and failed cleanup rolls back state',async()=>{
  const state=[{id:'count',type:'Number',initial:0}],registry=createStateRegistry(createCoreRegistry(),state);let closed=0;
  registry.registerResource({id:'native',inputs:{bad:'Boolean'},valueType:'Number',acquire:({bad})=>bad,read:()=>1,release:bad=>{closed++;if(bad)throw new Error('failure');}});
  const bundle=lower('fn test(bad:Boolean)->Number { using value=native(bad); return state.count.write(state.count.read()+resource.read(value)); }',registry);
  const manifest={schemaVersion:'ems-reactor/1',id:'resource.events',version:'1',state,handlers:[{event:'run',program:bundle.ir}]},options={policy:{allowedEffects:['state.read','state.write'],capabilities:['state.read','state.write']},recordTrace:true};
  const session=new ReactorSession(manifest,registry,options);assert.equal(await session.dispatch('run',{bad:false}),1);assert.equal(closed,1);
  await assert.rejects(session.dispatch('run',{bad:true}),{code:'RESOURCE_CLEANUP'});assert.deepEqual(session.snapshot(),{count:1});const replay=new ReactorSession(manifest,registry,options);await replayEvents(replay,session.trace());assert.deepEqual(replay.trace(),session.trace());await session.close();await replay.close();
});

test('invalid cleanup/resource options reject before host execution and observer errors cannot skip later cleanup',async()=>{
  const bundle=lower('fn test()->Number { using a=resource.cell(1); using b=resource.cell(2); return 3; }'),execute=await compiled(bundle);
  for(const options of [{maxResources:0},{maxCleanupMs:0},{onResourceCleanup:1}])assert.deepEqual(await outcome(()=>executeIR(bundle.ir,{},bundle.registry,options)),await outcome(()=>execute({},options)));
  for(const run of [opts=>executeIR(bundle.ir,{},bundle.registry,opts),opts=>execute({},opts)]){
    const order=[];const result=await outcome(()=>run({onResourceCleanup:event=>{order.push(event.resource);throw new Error('observer');}}));assert.equal(result.code,'RESOURCE_CLEANUP');assert.deepEqual(order.filter((id,index)=>index===0 || id!==order[index-1]),[1,0]);
  }
});

test('independent CLI export executes using cleanup outside EMS',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ems-resource-export-')),cli=new URL('../tools/ems.mjs',import.meta.url).pathname;
  try{
    await writeFile(join(directory,'source.ems'),'fn test()->Number { using value=resource.cell(3); return resource.read(value); }');
    for(const args of [['module-ir','source.ems','--entry','test','--out','program.ir.json'],['ir-build','program.ir.json','--out','program.mjs']]){const result=spawnSync(process.execPath,[cli,...args],{cwd:directory,encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
    await writeFile(join(directory,'run.mjs'),'import {execute} from "./program.mjs"; const events=[]; console.log(await execute({},{onResourceCleanup:event=>events.push(event)}),events.length);');
    const result=spawnSync(process.execPath,['run.mjs'],{cwd:directory,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'3 1');
  }finally{await rm(directory,{recursive:true,force:true});}
});
