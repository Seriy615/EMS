import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,open,rm } from 'node:fs/promises';
import { fstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCoreRegistry } from '../src/reference/index.mjs';
import { validateContractInterface,registerContractBinding,compareContractInterfaces } from '../src/contracts/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import { executeIR,compileIRToJS,serializeIR,parseIR } from '../src/ir/index.mjs';
import { makeControlThrow } from '../src/semantics/control-errors.mjs';
import { createStateRegistry,ReactorSession } from '../src/runtime/reactor.mjs';
const empty=()=>({pre:[],post:[]});
const specification=()=>({schemaVersion:'ems-resource-interface/1',id:'std.resource',version:'1.0.0',inputs:[{name:'n',type:'Number'}],output:{type:'ResourceHandle<Number>'},errors:[],semantics:{determinism:'deterministic',effects:[],capabilities:[]},conditions:{pre:[{kind:'positive',subject:{input:'n'}}],post:[]},lifecycle:{ownership:'execution',valueType:'Number',read:{errors:[],conditions:{pre:[],post:[{kind:'positive',subject:{result:true}}]}},write:{errors:[],conditions:{pre:[{kind:'positive',subject:{input:'value'}}],post:[{kind:'positive',subject:{result:true}}]}},release:{errors:[]}}});
const binding=()=>({schemaVersion:'ems-contract-binding/1',id:'native.resource',version:'1.0.0',interface:{id:'std.resource',version:'1.0.0'},implementation:{id:'impl.resource',version:'1.0.0'},targets:['node'],determinism:'deterministic'});
function setup(spec=specification(),changes={},registry=createCoreRegistry()){
  const events=[];
  registry.registerResource({id:'impl.resource',inputs:{n:'Number'},valueType:'Number',acquire:({n})=>{events.push('acquire');return {value:n};},read:handle=>{events.push('read');return handle.value;},write:(handle,value)=>{events.push('write');handle.value=value;return value;},release:()=>events.push('release'),...changes});
  registerContractBinding(registry,spec,binding(),{target:'node'});return {registry,events};
}
const lower=(source,registry)=>lowerCheckedModule(typecheckModule(parseEMSModule(source),registry),'test',registry);
const run=async(source,registry,inputs={},options={})=>{const bundle=lower(source,registry);return executeIR(parseIR(serializeIR(bundle.ir,bundle.registry),bundle.registry),inputs,bundle.registry,options);};
const failure=async fn=>{try{await fn();assert.fail('Expected rejection');}catch(error){return error;}};

test('public resource handle uses typed shared IR and releases exactly once',async()=>{
  const {registry,events}=setup();assert.equal(await run('fn test()->Number { using value=std.resource(1); resource.write(value,2); return resource.read(value); }',registry),2);
  assert.deepEqual(events,['acquire','write','read','release']);const item=registry.resolve('std.resource');assert.equal(item.kind,'resource');assert.ok(Object.isFrozen(item.resourceBoundaries[0].interface.lifecycle));
  assert.throws(()=>compileIRToJS(lower('fn test()->Number { using value=std.resource(1); return resource.read(value); }',registry).ir,registry),{code:'UNSUPPORTED_TARGET'});
});

test('factory and write preconditions reject before native operation',async()=>{
  const {registry,events}=setup();await assert.rejects(run('fn test()->Number { using value=std.resource(0); return resource.read(value); }',registry),{code:'PRECONDITION_FAILED'});assert.deepEqual(events,[]);
  await assert.rejects(run('fn test()->Number { using value=std.resource(1); return resource.write(value,-1); }',registry),{code:'PRECONDITION_FAILED'});assert.deepEqual(events,['acquire','release']);
});

test('read/write postconditions and typed payload failures still release owned native resource',async()=>{
  for(const [changes,operation,code] of [[{read:()=>-1},'read(value)','POSTCONDITION_FAILED'],[{read:()=>"private"},'read(value)','TYPE_MISMATCH'],[{write:()=>-1},'write(value,2)','POSTCONDITION_FAILED']]){
    const {registry,events}=setup(specification(),changes);await assert.rejects(run(`fn test()->Number { using value=std.resource(1); return resource.${operation}; }`,registry),{code});assert.equal(events.filter(event=>event==='release').length,1);
  }
});

test('factory postcondition executes after native ownership and failure cannot leak acquisition',async()=>{
  const spec=specification();spec.conditions.post=[{kind:'positive',subject:{input:'n'}}];let released=0;
  const {registry}=setup(spec,{acquire:params=>{params.n=-1;return {value:1};},release:handle=>{assert.equal(handle.value,1);released++;}});
  await assert.rejects(run('fn test()->Number { using value=std.resource(1); return 1; }',registry),{code:'POSTCONDITION_FAILED'});assert.equal(released,1);
});

test('declared typed phase errors use existing catch and malformed error payload fails validation',async()=>{
  for(const malformed of [false,true]){
    const spec=specification();spec.lifecycle.read.errors=[{code:'USER_THROW',payloadType:'String'}];
    const {registry,events}=setup(spec,{read:()=>{const error=makeControlThrow('recover','String');if(malformed)error.value=1;throw error;}});
    const source='fn test()->String { using value=std.resource(1); try { resource.read(value); return "bad"; } catch(error:String){return error;} }';
    if(malformed)await assert.rejects(run(source,registry),{code:'TYPE_MISMATCH'});else assert.equal(await run(source,registry),'recover');assert.equal(events.at(-1),'release');
  }
});

test('undeclared acquire/read errors suppress private host payload and still obey lifecycle',async()=>{
  for(const phase of ['acquire','read']){
    const {registry,events}=setup(specification(),{[phase]:()=>{throw new Error('private native data');}});const error=await failure(()=>run('fn test()->Number { using value=std.resource(1); return resource.read(value); }',registry));
    assert.equal(error.code,'UNDECLARED_CONTRACT_ERROR');assert.equal(JSON.stringify(error).includes('private'),false);assert.equal(events.filter(event=>event==='release').length,phase==='read'?1:0);
  }
});

test('release phase errors retain only code in cleanup failures and do not suppress primary failure',async()=>{
  for(const declared of [false,true]){
    const spec=specification();if(declared)spec.lifecycle.release.errors=[{code:'RELEASE_FAILED',payloadType:null}];
    const {registry}=setup(spec,{release:()=>{throw Object.assign(new Error('private native release'),{code:'RELEASE_FAILED'});}});
    for(const source of ['fn test()->Number { using value=std.resource(1); return 1; }','fn test()->Number { using value=std.resource(1); throw "primary"; }']){
      const error=await failure(()=>run(source,registry));assert.equal(error.code,source.includes('throw')?'USER_THROW':'RESOURCE_CLEANUP');const failures=error.resourceCleanupFailures??error.details.failures;
      assert.equal(failures[0].code,declared?'RELEASE_FAILED':'UNDECLARED_CONTRACT_ERROR');assert.equal(JSON.stringify(failures).includes('private'),false);
    }
  }
});

test('read-only public resource hides native write implementation; writable interface requires write callback',async()=>{
  const spec=specification();spec.lifecycle.write=null;const {registry,events}=setup(spec);await assert.rejects(run('fn test()->Number { using value=std.resource(1); return resource.write(value,2); }',registry),{code:'RESOURCE_READ_ONLY'});assert.deepEqual(events,['acquire','release']);
  assert.throws(()=>setup(specification(),{write:null}),{code:'INCOMPATIBLE_BINDING'});
});

test('whole lifecycle interface grants are checked before acquisition even for pure native callbacks',async()=>{
  const spec=specification();spec.semantics.effects=['device.read'];spec.semantics.capabilities=['device'];const {registry,events}=setup(spec);
  const source='fn test()->Number { using value=std.resource(1); return resource.read(value); }';await assert.rejects(run(source,registry),{code:'PERMISSION_DENIED'});assert.deepEqual(events,[]);
  assert.equal(await run(source,registry,{}, {allowedEffects:['device.read'],capabilities:['device']}),1);assert.deepEqual(events,['acquire','read','release']);
});

test('resource IDL validates lifecycle phase types, ownership and strict fields',()=>{
  for(const change of [s=>s.lifecycle.ownership='borrowed',s=>s.lifecycle.valueType='String',s=>s.lifecycle.read.conditions.pre=[{kind:'positive',subject:{result:true}}],s=>s.lifecycle.write.conditions.pre[0].subject.input='unknown',s=>s.lifecycle.release.conditions=empty(),s=>s.lifecycle.read.errors=[{code:'USER_THROW',payloadType:'ResourceHandle<Number>'}],s=>s.lifecycle.read=null]){const spec=specification();change(spec);assert.throws(()=>validateContractInterface(spec));}
  const spec=specification();delete spec.lifecycle;assert.throws(()=>validateContractInterface(spec),{code:'INVALID_IDL'});
});

test('backward comparison includes every phase predicate/error and write availability',()=>{
  for(const [change,reason] of [[s=>s.lifecycle.read.conditions.post=[], 'read.postconditions'],[s=>s.lifecycle.write.conditions.pre.push({kind:'nonzero',subject:{input:'value'}}),'write.preconditions'],[s=>s.lifecycle.release.errors=[{code:'FAIL',payloadType:null}],'release.errors'],[s=>s.lifecycle.write=null,'write']]){
    const old=specification(),next=specification();next.version='1.1.0';change(next);assert.ok(compareContractInterfaces(old,next).reasons.includes(reason));
  }
  const old=specification(),next=specification();next.version='1.1.0';next.lifecycle.write.conditions.pre=[];next.lifecycle.read.conditions.post.push({kind:'nonzero',subject:{result:true}});assert.equal(compareContractInterfaces(old,next).compatible,true);
});

test('rebinding preserves nested phase predicates around a single actual native callback/release',async()=>{
  const {registry,events}=setup(specification(),{read:()=>-1}),spec=specification(),descriptor=binding();spec.id='std.rebound';spec.lifecycle.read.conditions.post=[];descriptor.interface.id=spec.id;descriptor.implementation.id='std.resource';registerContractBinding(registry,spec,descriptor,{target:'node'});
  const error=await failure(()=>run('fn test()->Number { using value=std.rebound(1); return resource.read(value); }',registry));assert.equal(error.code,'POSTCONDITION_FAILED');assert.equal(error.details.contract,'std.resource.read');assert.deepEqual(events,['acquire','release']);assert.equal(registry.resolve(spec.id).resourceBoundaries.length,2);
});

test('cancelled late acquisition is released through declared public phase boundary exactly once',{timeout:3000},async()=>{
  let ready,deliver,released=0;const begun=new Promise(resolve=>ready=resolve),controller=new AbortController();const {registry}=setup(specification(),{acquire:()=>new Promise(resolve=>{deliver=resolve;ready();}),release:(_,{signal})=>{assert.equal(signal.aborted,false);released++;}});
  const pending=run('fn test()->Number { using value=std.resource(1); return resource.read(value); }',registry,{}, {signal:controller.signal,maxCleanupMs:10});await begun;controller.abort();await assert.rejects(pending,{code:'CANCELLED'});deliver({value:1});await new Promise(resolve=>setImmediate(resolve));assert.equal(released,1);
});

test('actual Node file descriptor is closed through public resource interface on success and failure',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ems-idl-file-')),path=join(directory,'file.txt'),opened=[];
  await writeFile(path,'actual file');const spec=specification();spec.inputs=[{name:'path',type:'String'}];spec.output.type='ResourceHandle<String>';spec.lifecycle.valueType='String';spec.conditions=empty();spec.lifecycle.read.conditions=empty();spec.lifecycle.write=null;spec.errors=[{code:'ENOENT',payloadType:null}];spec.semantics={determinism:'unspecified',effects:['fs.read'],capabilities:['fs.read']};
  const registry=createCoreRegistry().registerResource({id:'impl.resource',inputs:{path:'String'},valueType:'String',effects:['fs.read'],capabilities:['fs.read'],acquire:async({path})=>{const file=await open(path,'r');opened.push(file.fd);return file;},read:file=>file.readFile('utf8'),release:file=>file.close()}),descriptor=binding();descriptor.determinism='unspecified';registerContractBinding(registry,spec,descriptor,{target:'node'});
  try{
    const options={allowedEffects:['fs.read'],capabilities:['fs.read']};
    for(const source of ['fn test(path:String)->String { using file=std.resource(path); return resource.read(file); }','fn test(path:String)->String { using file=std.resource(path); throw "failure"; }']){
      const before=opened.length;await assert.rejects(run(source,registry,{path}),{code:'PERMISSION_DENIED'});assert.equal(opened.length,before);
      if(source.includes('throw'))await assert.rejects(run(source,registry,{path},options),{code:'USER_THROW'});else assert.equal(await run(source,registry,{path},options),'actual file');assert.throws(()=>fstatSync(opened.at(-1)),{code:'EBADF'});
    }
    await assert.rejects(run('fn test(path:String)->String { using file=std.resource(path); return resource.read(file); }',registry,{path:join(directory,'missing')},options),{code:'ENOENT'});
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('phase postcondition failure rolls back actor state after release and metadata survives registry cloning',async()=>{
  const state=[{id:'count',type:'Number',initial:0}],registry=createStateRegistry(createCoreRegistry(),state);let released=0;setup(specification(),{read:()=>-1,release:()=>released++},registry);
  const bundle=lower('fn test()->Number { using value=std.resource(1); state.count.write(5); return resource.read(value); }',registry),session=new ReactorSession({schemaVersion:'ems-reactor/1',id:'resource.idl.events',version:'1',state,handlers:[{event:'read',program:bundle.ir}]},bundle.registry,{policy:{allowedEffects:['state.read','state.write'],capabilities:['state.read','state.write']}});
  try{await assert.rejects(session.dispatch('read',{}),{code:'POSTCONDITION_FAILED'});assert.deepEqual(session.snapshot(),{count:0});assert.equal(released,1);}finally{await session.close();}
});

test('active native read cancellation defers release until quiescence without losing resource phase guards',{timeout:3000},async()=>{
  let ready,deliver,released=0;const begun=new Promise(resolve=>ready=resolve),controller=new AbortController();const {registry}=setup(specification(),{read:()=>new Promise(resolve=>{deliver=resolve;ready();}),release:(_,{signal})=>{assert.equal(signal.aborted,false);released++;}});
  const pending=run('fn test()->Number { using value=std.resource(1); return resource.read(value); }',registry,{}, {signal:controller.signal,maxCleanupMs:10});await begun;controller.abort();const error=await failure(()=>pending);assert.equal(error.code,'CANCELLED');assert.equal(error.resourceCleanupFailures[0].code,'CLEANUP_TIMEOUT');assert.equal(released,0);
  deliver(-1);await new Promise(resolve=>setImmediate(resolve));assert.equal(released,1);
});

test('resource binding target/version/signature/policy checks reject before acquisition',()=>{
  let calls=0;const spec=specification(),registry=createCoreRegistry().registerResource({id:'impl.resource',inputs:{n:'Number'},valueType:'Number',acquire:()=>calls++,read:()=>1,write:()=>1,release:()=>{}});
  for(const [change,code] of [[b=>b.interface.version='2.0.0','CONTRACT_VERSION'],[b=>b.implementation.version='2.0.0','CONTRACT_VERSION'],[b=>b.targets=['web'],'UNSUPPORTED_TARGET']]){const descriptor=binding();change(descriptor);assert.throws(()=>registerContractBinding(registry,spec,descriptor,{target:'node'}),{code});}
  const wrong=specification();wrong.inputs[0].type='String';wrong.conditions=empty();assert.throws(()=>registerContractBinding(registry,wrong,binding(),{target:'node'}),{code:'INCOMPATIBLE_BINDING'});
  assert.throws(()=>setup(specification(),{effects:['hidden.native']}),{code:'INCOMPATIBLE_BINDING'});assert.equal(calls,0);
});
