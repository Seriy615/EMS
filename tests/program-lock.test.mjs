import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoreRegistry } from '../src/reference/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import { lowerGraphToIR } from '../src/ir/index.mjs';
import { registerContractBinding } from '../src/contracts/index.mjs';
import { registerTrustedPinnedModule,sha256 } from '../src/contracts/provenance.mjs';
import { createProgramLock,verifyProgramLock,executeLockedIR,compileLockedIRToJS,serializeProgramLock,parseProgramLock } from '../src/contracts/lock.mjs';
const lower=(source,registry)=>lowerCheckedModule(typecheckModule(parseEMSModule(source),registry),'test',registry);
const policy={target:'node'};
const source='export function create(){return {execute:({x})=>x*2,emitJS:({x})=>`(${x}*2)`};}';
const manifest={schemaVersion:'ems-pinned-binding/1',module:'library',contracts:[{id:'vendor.double',version:'1.0.0',kind:'atomic',inputs:{x:'Number'},output:'Number',exports:{execute:'execute',emitJS:'emitJS'}}]};
async function library(text=source){const registry=createCoreRegistry();await registerTrustedPinnedModule(registry,manifest,[{id:'library',source:text,dependencies:[]}]);return {registry,options:{target:'node',artifactSources:new Map([['library',text]])}};}

for(const text of ['fn test(x:Number)->Number { return x+1; }','fn test(x:Number)->Number { let mut n=0; while n<x { n=n+1; } return n; }','fn test(x:Number)->Number { using value=resource.cell(x); return resource.read(value); }'])test('locked core program executes and exports identical independent output',async()=>{
  const registry=createCoreRegistry(),bundle=lower(text,registry),lock=await createProgramLock(bundle.ir,bundle.registry,policy);assert.equal(await verifyProgramLock(parseProgramLock(serializeProgramLock(lock)),bundle.ir,bundle.registry,policy),true);assert.equal(await executeLockedIR(lock,bundle.ir,{x:3},bundle.registry,policy),text.includes('x+1')?4:3);
  const module=await import(`data:text/javascript,${encodeURIComponent(await compileLockedIRToJS(lock,bundle.ir,bundle.registry,policy))}`);assert.equal(await module.execute({x:3}),text.includes('x+1')?4:3);
});

test('verified source bytes and complete module dependency graph are pinned transitively',async()=>{
  const dependency='export function create(){return {twice:x=>x*2};}',root='export function create(deps){return {execute:({x})=>deps.helper.twice(x),emitJS:({x})=>`(${x}*2)`};}',registry=createCoreRegistry();
  await registerTrustedPinnedModule(registry,manifest,[{id:'library',source:root,dependencies:['helper']},{id:'helper',source:dependency,dependencies:[]}]);const options={target:'node',artifactSources:new Map([['library',root],['helper',dependency]])},bundle=lower('fn test(x:Number)->Number { return vendor.double(x); }',registry),lock=await createProgramLock(bundle.ir,bundle.registry,options);
  assert.deepEqual(lock.artifacts.map(artifact=>artifact.id),['helper','library']);assert.equal(await executeLockedIR(lock,bundle.ir,{x:3},bundle.registry,options),6);
  const changed={...options,artifactSources:new Map(options.artifactSources)};changed.artifactSources.set('helper',dependency+'\n');await assert.rejects(executeLockedIR(lock,bundle.ir,{x:3},bundle.registry,changed),{code:'ARTIFACT_MISMATCH'});
});

test('source drift, callback replacement and unverified host implementations reject before invocation',async()=>{
  const {registry,options}=await library(),bundle=lower('fn test(x:Number)->Number { return vendor.double(x); }',registry),lock=await createProgramLock(bundle.ir,bundle.registry,options);
  await assert.rejects(verifyProgramLock(lock,bundle.ir,bundle.registry,{...options,artifactSources:new Map([['library',source+'\n']])}),{code:'ARTIFACT_MISMATCH'});
  let calls=0;const original=bundle.registry.resolve('vendor.double');bundle.registry.items.set(original.id,{...original,execute:()=>{calls++;return 99;}});
  await assert.rejects(executeLockedIR(lock,bundle.ir,{x:3},bundle.registry,options),{code:'UNPINNED_IMPLEMENTATION'});assert.equal(calls,0);
  const unverified=createCoreRegistry().registerAtomic({id:'host',inputs:{},output:'Number',execute:()=>calls++});await assert.rejects(createProgramLock(lower('fn test()->Number {return host();}',unverified).ir,unverified,policy),{code:'UNPINNED_IMPLEMENTATION'});assert.equal(calls,0);
});

test('intrinsic identities cannot be impersonated with arbitrary callbacks and builtin names',async()=>{
  const registry=createCoreRegistry(),bundle=lower('fn test(x:Number)->Number { return core.add(x,1); }',registry),lock=await createProgramLock(bundle.ir,bundle.registry,policy);const item=bundle.registry.resolve('core.add');bundle.registry.items.set(item.id,{...item,execute:()=>99});
  await assert.rejects(verifyProgramLock(lock,bundle.ir,bundle.registry,policy),{code:'UNPINNED_IMPLEMENTATION'});
});

test('unused composite nodes, public interfaces and selected implementation refs remain in dependency closure',async()=>{
  const registry=createCoreRegistry(),graph={schemaVersion:'0.1',id:'impl',version:'1.0.0',inputs:{x:{type:'Number'}},output:{type:'Number'},nodes:[{id:'unused',uses:'core.add',args:{a:{input:'x'},b:{literal:1}}}],returns:{input:'x'}};registry.registerComposite({id:graph.id,version:graph.version,graph});
  const spec={schemaVersion:'ems-contract-interface/1',id:'public',version:'1.0.0',inputs:[{name:'x',type:'Number'}],output:{type:'Number'},errors:[],semantics:{determinism:'deterministic',effects:[],capabilities:[]},conditions:{pre:[],post:[]}},binding={schemaVersion:'ems-contract-binding/1',id:'binding',version:'1.0.0',interface:{id:'public',version:'1.0.0'},implementation:{id:'impl',version:'1.0.0'},targets:['node'],determinism:'deterministic'};registerContractBinding(registry,spec,binding,policy);
  const ir=lowerGraphToIR(registry.resolve('public').graph,registry),lock=await createProgramLock(ir,registry,policy);assert.deepEqual(lock.contracts.map(item=>item.id),['core.add','impl','public']);
  registry.resolve('public').graph.nodes[0].args.b.literal=2;await assert.rejects(verifyProgramLock(lock,ir,registry,policy),{code:'LOCK_MISMATCH'});
});

test('atomic public adapter pins actual captured implementation and rejects stale selection after replacement',async()=>{
  const {registry,options}=await library(),spec={schemaVersion:'ems-contract-interface/1',id:'public',version:'1.0.0',inputs:[{name:'x',type:'Number'}],output:{type:'Number'},errors:[],semantics:{determinism:'deterministic',effects:[],capabilities:[]},conditions:{pre:[],post:[]}},binding={schemaVersion:'ems-contract-binding/1',id:'binding',version:'1.0.0',interface:{id:'public',version:'1.0.0'},implementation:{id:'vendor.double',version:'1.0.0'},targets:['node'],determinism:'deterministic'};registerContractBinding(registry,spec,binding,policy);const bundle=lower('fn test(x:Number)->Number {return public(x);}',registry),lock=await createProgramLock(bundle.ir,bundle.registry,options);assert.deepEqual(lock.contracts.map(item=>item.id),['public','vendor.double']);assert.equal(await executeLockedIR(lock,bundle.ir,{x:3},bundle.registry,options),6);
  const replacement=await library(source.replace('x*2','x*3'));bundle.registry.items.set('vendor.double',replacement.registry.resolve('vendor.double'));await assert.rejects(verifyProgramLock(lock,bundle.ir,bundle.registry,options),{code:'BINDING_DRIFT'});
});

test('lock target, program digest and exact record set cannot drift or accept extras',async()=>{
  const registry=createCoreRegistry(),bundle=lower('fn test(x:Number)->Number { return core.add(x,1); }',registry),lock=await createProgramLock(bundle.ir,bundle.registry,policy);
  const changed=structuredClone(lock);changed.program='0'.repeat(64);await assert.rejects(verifyProgramLock(changed,bundle.ir,bundle.registry,policy),{code:'LOCK_MISMATCH'});await assert.rejects(verifyProgramLock(lock,bundle.ir,bundle.registry,{target:'web'}),{code:'LOCK_MISMATCH'});
  const malformed=structuredClone(lock);malformed.secret='ignored';assert.throws(()=>parseProgramLock(JSON.stringify(malformed)),{code:'INVALID_LOCK'});const missing=structuredClone(lock);missing.contracts=[];await assert.rejects(verifyProgramLock(missing,bundle.ir,bundle.registry,policy),{code:'LOCK_MISMATCH'});
});

test('lock creation does not invoke callbacks or emit hooks, and pinned loader stages registration atomically',async()=>{
  const text='export function create(){return {execute:()=>{throw new Error("invoked");},emitJS:()=>{throw new Error("emitted");}};}',{registry,options}=await library(text),bundle=lower('fn test(x:Number)->Number {return vendor.double(x);}',registry);
  const lock=await createProgramLock(bundle.ir,bundle.registry,options);assert.equal(lock.artifacts.length,1);
  const fresh=createCoreRegistry(),bad={...manifest,contracts:[manifest.contracts[0],{...manifest.contracts[0],id:'other',exports:{execute:'missing'}}]};await assert.rejects(registerTrustedPinnedModule(fresh,bad,[{id:'library',source,dependencies:[]}]),{code:'MISSING_EXPORT'});assert.equal(fresh.items.has('vendor.double'),false);
});

test('SHA-256 uses standard test vector; dependency cycles and missing byte sources reject',async()=>{
  assert.equal(await sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const registry=createCoreRegistry();await assert.rejects(registerTrustedPinnedModule(registry,manifest,[{id:'library',source,dependencies:['library']}]),{code:'ARTIFACT_CYCLE'});
  const loaded=await library(),bundle=lower('fn test(x:Number)->Number {return vendor.double(x);}',loaded.registry);await assert.rejects(createProgramLock(bundle.ir,bundle.registry,policy),{code:'MISSING_ARTIFACT'});
});

test('locked execution snapshots the checked registry before asynchronous verification',async()=>{
  const registry=createCoreRegistry(),bundle=lower('fn test(x:Number)->Number {return core.add(x,1);}',registry),lock=await createProgramLock(bundle.ir,bundle.registry,policy);
  const pending=executeLockedIR(lock,bundle.ir,{x:3},bundle.registry,policy),original=bundle.registry.resolve('core.add');bundle.registry.items.set('core.add',{...original,execute:()=>99});assert.equal(await pending,4);
});

test('verified native file module and readonly public binding lock actual source bytes and release OS resource',async()=>{
  const {mkdtemp,writeFile,rm}=await import('node:fs/promises'),{fstatSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
  const directory=await mkdtemp(join(tmpdir(),'ems-lock-file-')),path=join(directory,'file.txt');await writeFile(path,'locked file');
  const text=`export async function create(){const {open}=await import('node:fs/promises');return {acquire:async({path})=>{const file=await open(path,'r');globalThis.__emsLockedFileFD=file.fd;return file;},read:(file,{signal})=>file.readFile({encoding:'utf8',signal}),release:file=>file.close()};}`;
  const registry=createCoreRegistry(),manifest={schemaVersion:'ems-pinned-binding/1',module:'node.file',contracts:[{kind:'resource',id:'native.file',version:'1.0.0',inputs:{path:'String'},valueType:'String',effects:['fs.read'],capabilities:['fs.read'],exports:{acquire:'acquire',read:'read',write:null,release:'release'}}]};
  await registerTrustedPinnedModule(registry,manifest,[{id:'node.file',source:text,dependencies:[]}]);
  const spec={schemaVersion:'ems-resource-interface/1',id:'public.file',version:'1.0.0',inputs:[{name:'path',type:'String'}],output:{type:'ResourceHandle<String>'},errors:[],semantics:{determinism:'unspecified',effects:['fs.read'],capabilities:['fs.read']},conditions:{pre:[],post:[]},lifecycle:{ownership:'execution',valueType:'String',read:{errors:[],conditions:{pre:[],post:[]}},write:null,release:{errors:[]}}};
  registerContractBinding(registry,spec,{schemaVersion:'ems-contract-binding/1',id:'binding.file',version:'1.0.0',interface:{id:spec.id,version:spec.version},implementation:{id:'native.file',version:'1.0.0'},targets:['node'],determinism:'unspecified'},policy);
  const options={target:'node',artifactSources:new Map([['node.file',text]])},bundle=lower('fn test(path:String)->String {using file=public.file(path);return resource.read(file);}',registry),lock=await createProgramLock(bundle.ir,bundle.registry,options);
  try{assert.deepEqual(lock.contracts.map(item=>item.id),['native.file','public.file']);assert.equal(await executeLockedIR(lock,bundle.ir,{path},bundle.registry,{...options,allowedEffects:['fs.read'],capabilities:['fs.read']}),'locked file');assert.throws(()=>fstatSync(globalThis.__emsLockedFileFD),{code:'EBADF'});await assert.rejects(compileLockedIRToJS(lock,bundle.ir,bundle.registry,options),{code:'UNSUPPORTED_TARGET'});}finally{delete globalThis.__emsLockedFileFD;await rm(directory,{recursive:true,force:true});}
});

test('CLI lock/run/build workflow exports an independent program and refuses program drift',async()=>{
  const {mkdtemp,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{spawnSync}=await import('node:child_process');const directory=await mkdtemp(join(tmpdir(),'ems-lock-cli-')),cli=new URL('../tools/ems.mjs',import.meta.url).pathname;
  try{
    await writeFile(join(directory,'source.ems'),'fn test(x:Number)->Number {return x+1;}');
    for(const args of [['module-ir','source.ems','--entry','test','--out','program.ir.json'],['lock','program.ir.json','--target','node','--out','program.lock.json'],['locked-run','program.ir.json','--lock','program.lock.json','--target','node','{"x":3}'],['locked-build','program.ir.json','--lock','program.lock.json','--target','node','--out','program.mjs']]){const child=spawnSync(process.execPath,[cli,...args],{cwd:directory,encoding:'utf8'});assert.equal(child.status,0,child.stderr);}
    await writeFile(join(directory,'run.mjs'),'import {execute} from "./program.mjs"; console.log(execute({x:3}));');const exported=spawnSync(process.execPath,['run.mjs'],{cwd:directory,encoding:'utf8'});assert.equal(exported.status,0,exported.stderr);assert.equal(exported.stdout.trim(),'4');
    const denied=spawnSync(process.execPath,[cli,'locked-run','program.ir.json','--lock','program.lock.json','--target','web','{"x":3}'],{cwd:directory,encoding:'utf8'});assert.equal(denied.status,1);assert.match(denied.stderr,/LOCK_MISMATCH/);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('atomic interface metadata preserves ordinary call graph roots sharing public identity',async()=>{
  const {registry,options}=await library(),spec={schemaVersion:'ems-contract-interface/1',id:'public',version:'1.0.0',inputs:[{name:'x',type:'Number'}],output:{type:'Number'},errors:[],semantics:{determinism:'deterministic',effects:[],capabilities:[]},conditions:{pre:[],post:[]}};
  registerContractBinding(registry,spec,{schemaVersion:'ems-contract-binding/1',id:'binding',version:'1.0.0',interface:{id:'public',version:'1.0.0'},implementation:{id:'vendor.double',version:'1.0.0'},targets:['node'],determinism:'deterministic'},policy);
  const graph={schemaVersion:'0.1',id:'public',version:'1.0.0',inputs:{x:{type:'Number'}},output:{type:'Number'},nodes:[{id:'call',uses:'public',args:{x:{input:'x'}}}],returns:{node:'call'}},ir=lowerGraphToIR(graph,registry),lock=await createProgramLock(ir,registry,options);assert.equal(await executeLockedIR(lock,ir,{x:3},registry,options),6);
});
