import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCoreRegistry } from '../src/reference/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import { executeIR, compileIRToJS, serializeIR, parseIR } from '../src/ir/index.mjs';
import { validateContractInterface, validateContractBinding, compareContractInterfaces, checkContractBinding, registerContractBinding } from '../src/contracts/idl.mjs';
import { makeControlThrow } from '../src/semantics/control-errors.mjs';
const spec=JSON.parse(await readFile(new URL('../examples/contract-interface.json',import.meta.url),'utf8'));
const binding=JSON.parse(await readFile(new URL('../examples/contract-binding.json',import.meta.url),'utf8'));
const copy=()=>structuredClone(spec),descriptor=()=>structuredClone(binding);
const lower=registry=>lowerCheckedModule(typecheckModule(parseEMSModule('fn test(a:Number,b:Number)->Number { return std.math.divide(a,b); }'),registry),'test',registry);
const compiled=async bundle=>(await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(bundle.ir,bundle.registry))}`)).execute;

for(const profile of ['auto','control'])test(`IDL executes shared interface and enforces preconditions in ${profile} runtime/standalone`,async()=>{
  const registry=createCoreRegistry();registerContractBinding(registry,spec,binding,{target:'node'});
  const checked=typecheckModule(parseEMSModule('fn test(a:Number,b:Number)->Number { return std.math.divide(a,b); }'),registry);
  const bundle=lowerCheckedModule(checked,'test',registry,{profile}),execute=await compiled(bundle),ir=parseIR(serializeIR(bundle.ir,registry),registry);
  assert.equal(await executeIR(ir,{a:6,b:2},registry),3);assert.equal(await execute({a:6,b:2}),3);
  await assert.rejects(executeIR(ir,{a:1,b:-0},registry),{code:'PRECONDITION_FAILED'});await assert.rejects(async()=>execute({a:1,b:0}),{code:'PRECONDITION_FAILED'});
});

test('IDL postconditions and typed output are enforced in both executors',async()=>{
  for(const [impl,code] of [[()=>-1,'POSTCONDITION_FAILED'],[()=>"invalid",'TYPE_MISMATCH']]){
    const registry=createCoreRegistry().registerAtomic({id:'impl',inputs:{a:'Number',b:'Number'},output:'Number',execute:impl,emitJS:()=>impl()===-1?'-1':'"invalid"'}),s=copy(),b=descriptor();
    s.conditions.post=[{kind:'positive',subject:{result:true}}];b.implementation.id='impl';registerContractBinding(registry,s,b,{target:'node'});
    const bundle=lower(registry),execute=await compiled(bundle);await assert.rejects(executeIR(bundle.ir,{a:1,b:1},registry),{code});await assert.rejects(async()=>execute({a:1,b:1}),{code});
  }
});

test('precondition failure prevents any host execution and hides input data',async()=>{
  let calls=0;const registry=createCoreRegistry().registerAtomic({id:'impl',inputs:{a:'Number',b:'Number'},output:'Number',execute:()=>{calls++;return 1;}}),b=descriptor();b.implementation.id='impl';
  const result=registerContractBinding(registry,spec,b,{target:'node'});assert.ok(Object.isFrozen(result.interface.conditions.pre));
  await assert.rejects(registry.resolve(spec.id).execute({a:12345,b:0}),error=>error.code==='PRECONDITION_FAILED'&&!JSON.stringify(error.details).includes('12345'));assert.equal(calls,0);
});

test('binding mismatch rejects interface, implementation versions, target, ports and policy before callbacks',()=>{
  let calls=0;
  for(const [mutation,code] of [[b=>b.interface.version='2.0.0','CONTRACT_VERSION'],[b=>b.implementation.version='2.0.0','CONTRACT_VERSION'],[b=>b.targets=['android'],'UNSUPPORTED_TARGET'],[b=>b.implementation.id='core.sum','INCOMPATIBLE_BINDING'],[b=>b.determinism='unspecified','INCOMPATIBLE_BINDING']]){
    const b=descriptor();mutation(b);assert.throws(()=>registerContractBinding(createCoreRegistry(),spec,b,{target:'node'}),{code});
  }
  const registry=createCoreRegistry().registerAtomic({id:'impl',inputs:{a:'Number',b:'Number'},output:'Number',effects:['fs.read'],capabilities:['fs.read'],execute:()=>calls++}),b=descriptor();b.implementation.id='impl';
  assert.throws(()=>registerContractBinding(registry,spec,b,{target:'node'}),{code:'INCOMPATIBLE_BINDING'});assert.equal(calls,0);assert.equal(registry.items.has(spec.id),false);
});

test('interface policy remains conservative even when selected implementation is pure',async()=>{
  const s=copy();s.semantics.effects=['fs.read'];s.semantics.capabilities=['fs.read'];const registry=createCoreRegistry();registerContractBinding(registry,s,binding,{target:'node'});
  const bundle=lower(registry);await assert.rejects(executeIR(bundle.ir,{a:2,b:1},registry),{code:'PERMISSION_DENIED'});assert.throws(()=>compileIRToJS(bundle.ir,registry),{code:'UNSUPPORTED_TARGET'});
});

test('composite compatibility includes hidden unused nested effects without changing editor representation',()=>{
  const registry=createCoreRegistry().registerAtomic({id:'hidden',inputs:{},output:'Number',effects:['log.write'],execute:()=>1});
  registry.registerComposite({id:'impl',version:'1.0.0',graph:{schemaVersion:'0.1',id:'impl',version:'1.0.0',inputs:{a:{type:'Number'},b:{type:'Number'}},output:{type:'Number'},nodes:[{id:'hidden',uses:'hidden',args:{}}],returns:{input:'a'}}});
  const b=descriptor();b.implementation.id='impl';assert.throws(()=>checkContractBinding(spec,b,registry,'node'),{code:'INCOMPATIBLE_BINDING'});
  const s=copy();s.semantics.effects=['log.write'];assert.equal(checkContractBinding(s,b,registry,'node').implementation.kind,'composite');assert.throws(()=>registerContractBinding(registry,s,b,{target:'node'}),{code:'UNSUPPORTED_BINDING'});
});

test('IDL descriptors are strict, bounded, immutable and use the existing canonical type grammar',()=>{
  const sparsePolicy=copy();sparsePolicy.semantics.effects=new Array(1);sparsePolicy.semantics.effects.extra='log';
  assert.throws(()=>validateContractInterface(sparsePolicy),{code:'INVALID_POLICY'});
  for(const mutation of [s=>s.schemaVersion='unknown',s=>s.kind='atomic',s=>s.version='01.0.0',s=>s.version='1.0.0-beta',s=>s.inputs.push(s.inputs[0]),s=>s.inputs[0].type='Number []',s=>s.conditions.pre[0].subject={result:true},s=>s.conditions.pre[0].kind='executeScript',s=>s.errors=[{code:'USER_THROW',payloadType:null}]]){const s=copy();mutation(s);assert.throws(()=>validateContractInterface(s));}
  for(const type of ['Option<Number>','Result<Number,String>','Future<Number>','ResourceHandle<String>','Stream<Number>']){const s=copy();s.output.type=type;assert.equal(validateContractInterface(s).output.type,type);}
  const s=copy(),validated=validateContractInterface(s);s.inputs[0].type='String';assert.equal(validated.inputs[0].type,'Number');assert.ok(Object.isFrozen(validated.inputs[0]));
  for(const mutation of [b=>b.targets=[],b=>b.documentation='not a field',b=>b.implementation.version='*']){const b=descriptor();mutation(b);assert.throws(()=>validateContractBinding(b));}
});

for(const [label,mutate,reason] of [
  ['signature',s=>s.inputs[0].type='String','signature'],['port ordering',s=>s.inputs.reverse(),'signature'],
  ['capabilities',s=>s.semantics.capabilities=['network'],'capabilities'],['effects',s=>s.semantics.effects=['network'],'effects'],
  ['determinism',s=>s.semantics.determinism='unspecified','determinism'],['errors',s=>s.errors=[{code:'FAIL',payloadType:null}],'errors'],
  ['preconditions',s=>s.conditions.pre.push({kind:'positive',subject:{input:'a'}}),'preconditions'],
  ['major',s=>s.version='2.0.0','major'],['version regression',s=>s.version='0.9.0','version-regression']
])test(`backward compatibility rejects ${label}`,()=>{const next=copy();next.version='1.1.0';mutate(next);const result=compareContractInterfaces(spec,next);assert.equal(result.compatible,false);assert.ok(result.reasons.includes(reason));});

test('compatible evolution permits weaker preconditions, stronger postconditions and removed errors/policy',()=>{
  const old=copy();old.errors=[{code:'FAIL',payloadType:null}];old.semantics.effects=['log'];const next=copy();next.version='1.1.0';next.conditions.pre=[];next.conditions.post=[{kind:'positive',subject:{result:true}}];
  assert.equal(compareContractInterfaces(old,next).compatible,true);
  // Object key order carries no semantics; list order still defines port order.
  const ordered={...spec,inputs:spec.inputs.map(({name,type})=>({type,name}))};assert.equal(compareContractInterfaces(spec,ordered).compatible,true);
  const changed=copy();changed.conditions.pre=[];assert.ok(compareContractInterfaces(spec,changed).reasons.includes('changed-without-version'));
});

test('declared host errors survive and undeclared failures are replaced with payload-free diagnostics',async()=>{
  for(const declared of [false,true]){
    const registry=createCoreRegistry().registerAtomic({id:'impl',inputs:{a:'Number',b:'Number'},output:'Number',execute:()=>{const error=new Error('private host payload');error.code='FAIL';throw error;},emitJS:()=>`(()=>{const error=new Error('private host payload');error.code='FAIL';throw error;})()`}),s=copy(),b=descriptor();b.implementation.id='impl';if(declared)s.errors=[{code:'FAIL',payloadType:null}];
    registerContractBinding(registry,s,b,{target:'node'});const bundle=lower(registry),execute=await compiled(bundle);
    for(const run of [()=>executeIR(bundle.ir,{a:1,b:1},registry),async()=>execute({a:1,b:1})])await assert.rejects(run(),error=>{assert.equal(error.code,declared?'FAIL':'UNDECLARED_CONTRACT_ERROR');if(!declared)assert.equal(JSON.stringify(error).includes('private'),false);return true;});
  }
});

test('typed user error payload is checked and caught by existing EMS catch',async()=>{
  const registry=createCoreRegistry().registerAtomic({id:'impl',inputs:{a:'Number',b:'Number'},output:'Number',execute:()=>{throw makeControlThrow('known','String');},emitJS:()=>`(()=>{const error=new Error('EMS');Object.assign(error,{name:'EmsError',code:'USER_THROW',emsThrow:'ems-user-throw/1',valueType:'String',value:'known',details:{}});throw error;})()`}),s=copy(),b=descriptor();s.errors=[{code:'USER_THROW',payloadType:'String'}];b.implementation.id='impl';registerContractBinding(registry,s,b,{target:'node'});
  const bundle=lowerCheckedModule(typecheckModule(parseEMSModule('fn test()->String { try { std.math.divide(1,1); return "bad"; } catch(error:String){return error;} }'),registry),'test',registry),execute=await compiled(bundle);
  assert.equal(await executeIR(bundle.ir,{},registry),'known');assert.equal(await execute({}),'known');
});


test('malformed declared user payload is rejected consistently rather than escaping typed checks',async()=>{
  for(const [valueType,value,expected] of [['String',3,'TYPE_MISMATCH'],['Number',3,'CONTRACT_ERROR_TYPE']]){
    const make=()=>Object.assign(new Error('private'),{name:'EmsError',code:'USER_THROW',emsThrow:'ems-user-throw/1',valueType,value,details:{}});
    const registry=createCoreRegistry().registerAtomic({id:'impl',inputs:{a:'Number',b:'Number'},output:'Number',execute:()=>{throw make();},emitJS:()=>`(()=>{throw Object.assign(new Error('private'),${JSON.stringify({name:'EmsError',code:'USER_THROW',emsThrow:'ems-user-throw/1',valueType,value,details:{}})});})()`}),s=copy(),b=descriptor();s.errors=[{code:'USER_THROW',payloadType:'String'}];b.implementation.id='impl';registerContractBinding(registry,s,b,{target:'node'});
    const bundle=lower(registry),execute=await compiled(bundle);for(const run of [()=>executeIR(bundle.ir,{a:1,b:1},registry),async()=>execute({a:1,b:1})])await assert.rejects(run(),{code:expected});
  }
});

test('CLI validates and compares IDL, and generated interface checks run independently outside EMS',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ems-idl-')),cli=new URL('../tools/ems.mjs',import.meta.url).pathname;
  try{
    await writeFile(join(directory,'interface.json'),JSON.stringify(spec));await writeFile(join(directory,'binding.json'),JSON.stringify(binding));
    for(const args of [['interface-check','interface.json'],['interface-compare','interface.json','interface.json'],['binding-check','binding.json','--interface','interface.json','--target','node']]){const child=spawnSync(process.execPath,[cli,...args],{cwd:directory,encoding:'utf8'});assert.equal(child.status,0,child.stderr);}
    const next=copy();next.version='2.0.0';await writeFile(join(directory,'next.json'),JSON.stringify(next));const incompatible=spawnSync(process.execPath,[cli,'interface-compare','interface.json','next.json'],{cwd:directory,encoding:'utf8'});assert.equal(incompatible.status,1);assert.equal(JSON.parse(incompatible.stdout).compatible,false);
    const registry=createCoreRegistry();registerContractBinding(registry,spec,binding,{target:'node'});const bundle=lower(registry);
    await writeFile(join(directory,'program.mjs'),compileIRToJS(bundle.ir,bundle.registry));await writeFile(join(directory,'run.mjs'),'import {execute} from "./program.mjs"; console.log(await execute({a:6,b:2}));try{await execute({a:1,b:0});process.exitCode=1;}catch(error){console.log(error.code);}');
    const child=spawnSync(process.execPath,['run.mjs'],{cwd:directory,encoding:'utf8'});assert.equal(child.status,0,child.stderr);assert.equal(child.stdout.trim(),'3\nPRECONDITION_FAILED');
  }finally{await rm(directory,{recursive:true,force:true});}
});


test('nonempty predicates use typed array ports and agree on empty/signed-zero inputs',async()=>{
  const s=copy();s.inputs=[{name:'values',type:'NumberArray'}];s.conditions.pre=[{kind:'nonempty',subject:{input:'values'}}];const b=descriptor();b.implementation.id='core.min';const registry=createCoreRegistry();registerContractBinding(registry,s,b,{target:'node'});
  const bundle=lowerCheckedModule(typecheckModule(parseEMSModule('fn test(values:Number[])->Number { return std.math.divide(values); }'),registry),'test',registry),execute=await compiled(bundle);
  for(const values of [[],[-0],[3,1]]){
    const result=async run=>{try{return {value:await run()};}catch(error){return {code:error.code};}};
    assert.deepEqual(await result(()=>executeIR(bundle.ir,{values},registry)),await result(()=>execute({values})));
  }
});
