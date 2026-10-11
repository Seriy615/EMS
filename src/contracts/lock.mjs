import { fail } from '../reference/errors.mjs';
import { Registry,coreIntrinsic } from '../reference/registry.mjs';
import { serializeIR,parseIR,executeIR,compileIRToJS,graphFromIR,lowerGraphToIR,EFFECT_PROFILE } from '../ir/index.mjs';
import { verifiedOrigin,atomicBindingSource,sha256 } from './provenance.mjs';

function canonical(value){
  if(typeof value==='number'&&Object.is(value,-0))return {$number:'-0'};
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
const encode=value=>JSON.stringify(canonical(value));
function snapshotRegistry(registry){const copy=new Registry();for(const item of registry.items.values())copy.items.set(item.id,Object.freeze({...item,inputs:structuredClone(item.inputs),...(item.graph?{graph:structuredClone(item.graph)}:{})}));return copy;}
const compare=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
function fields(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Reflect.ownKeys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('INVALID_LOCK','Unexpected lock fields');}
function digest(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail('INVALID_LOCK','Expected SHA-256 digest');}
function dense(value){if(!Array.isArray(value)||value.length>10000||Object.keys(value).length!==value.length||Object.keys(value).some((key,index)=>key!==String(index)))fail('INVALID_LOCK','Expected bounded dense array');}
function text(value){if(typeof value!=='string'||!value)fail('INVALID_LOCK','Nonempty identity required');}
export function validateProgramLock(lock){
  fields(lock,['schemaVersion','target','program','contracts','artifacts']);if(lock.schemaVersion!=='ems-program-lock/1')fail('LOCK_VERSION','Unsupported lock schema');text(lock.target);digest(lock.program);
  for(const field of ['contracts','artifacts']){dense(lock[field]);let previous='';for(const item of lock[field]){
    fields(item,field==='contracts'?['id','version','kind','sha256','implementation']:['id','sha256','dependencies']);text(item.id);digest(item.sha256);if(item.id<=previous)fail('INVALID_LOCK','Records must be sorted and unique');previous=item.id;
    if(field==='contracts'){text(item.version);if(!['atomic','composite','resource'].includes(item.kind))fail('INVALID_LOCK','Unknown contract kind');fields(item.implementation,['kind','id']);text(item.implementation.id);if(!['intrinsic','artifact','composite','binding'].includes(item.implementation.kind))fail('INVALID_LOCK','Unknown provenance kind');}
    else{dense(item.dependencies);if(item.dependencies.some((id,index)=>typeof id!=='string'||!id||index&&id<=item.dependencies[index-1]))fail('INVALID_LOCK','Artifact edges must be sorted unique identities');}
  }}
  return lock;
}

/** Hash semantic program/contract closure without executing callbacks or compiler hooks. Kernel intrinsics are trusted ABI. */
export async function createProgramLock(ir,registry,{target,artifactSources=new Map()}={}){
  text(target);registry=snapshotRegistry(registry);const serialized=serializeIR(ir,registry),program=parseIR(serialized,registry),records=new Map(),artifacts=new Map(),visiting=new Set();
  const roots=new Set();
  function targets(value){if(!value||typeof value!=='object')return;
    if(value.kind==='contract'&&typeof value.id==='string')roots.add(value.id);
    if(value.contract?.id)roots.add(value.contract.id);
    for(const child of Object.values(value))if(Array.isArray(child))child.forEach(targets);else if(child&&typeof child==='object')targets(child);
  }
  targets(program);if(program.interfaceRef)roots.add(program.interfaceRef.id);
  async function visit(id){
    if(records.has(id))return;if(visiting.has(id)||visiting.size>=256)fail('DEPENDENCY_CYCLE','Contract dependency cycle/depth');if(records.size>=10000)fail('LOCK_LIMIT','Too many dependencies');visiting.add(id);
    const item=registry.resolve(id),boundary=item.interfaceBoundary,chain=item.resourceBoundaries??[];
    const metadata={id:item.id,version:item.version,kind:item.kind,inputs:Object.entries(item.inputs),output:item.output,effects:[...item.effects].sort(),capabilities:[...item.capabilities].sort(),...(boundary?{boundary}:{}),...(chain.length?{resourceBoundaries:chain}:{}),...(item.kind==='resource'?{valueType:item.valueType,writable:typeof item.write==='function'}:{})};
    let implementation;
    if(item.kind==='composite'){
      const body=lowerGraphToIR(item.graph,registry,{profile:EFFECT_PROFILE});metadata.graph=JSON.parse(serializeIR(body,registry));implementation={kind:'composite',id:item.id};for(const node of item.graph.nodes)await visit(node.uses);
    }else if(boundary){
      const selected=registry.resolve(boundary.binding.implementation.id),captured=atomicBindingSource(item);
      if(!captured||captured.execute!==selected.execute||captured.emitJS!==selected.emitJS)fail('BINDING_DRIFT','Atomic adapter no longer matches selected implementation');implementation={kind:'binding',id:selected.id};await visit(selected.id);
    }else{
      const intrinsic=coreIntrinsic(item),origin=verifiedOrigin(item);
      if(intrinsic){implementation={kind:'intrinsic',id:intrinsic.operation};metadata.intrinsic=intrinsic;}
      else if(origin){implementation={kind:'artifact',id:origin.module};for(const artifact of origin.artifacts){const previous=artifacts.get(artifact.id);if(previous&&encode(previous)!==encode(artifact))fail('ARTIFACT_CONFLICT','Artifact identity has conflicting bytes/edges');artifacts.set(artifact.id,artifact);}}
      else fail('UNPINNED_IMPLEMENTATION','Implementation has no verified artifact provenance',{contract:id});
    }
    for(const entry of [...(boundary?[boundary]:[]),...chain]){
      if(!entry.binding.targets.includes(target))fail('UNSUPPORTED_TARGET','Locked binding target mismatch');
      const selected=registry.resolve(entry.binding.implementation.id);if(selected.version!==entry.binding.implementation.version)fail('CONTRACT_VERSION','Locked binding version mismatch');
      if(item.kind==='resource'&&['acquire','read','release',...(item.write?['write']:[])].some(slot=>item[slot]!==selected[slot]))fail('BINDING_DRIFT','Resource callback no longer matches selected implementation');await visit(selected.id);
    }
    records.set(id,{id:item.id,version:item.version,kind:item.kind,sha256:await sha256(encode(metadata)),implementation});visiting.delete(id);
  }
  for(const id of [...roots].sort())await visit(id);
  for(const artifact of artifacts.values()){
    if(!artifactSources.has(artifact.id))fail('MISSING_ARTIFACT','Current source bytes required',{artifact:artifact.id});
    if(await sha256(artifactSources.get(artifact.id))!==artifact.sha256)fail('ARTIFACT_MISMATCH','Loaded provenance disagrees with current bytes',{artifact:artifact.id});
    for(const id of artifact.dependencies)if(!artifacts.has(id))fail('MISSING_ARTIFACT','Missing transitive source artifact',{artifact:id});
  }
  return validateProgramLock({schemaVersion:'ems-program-lock/1',target,program:await sha256(serialized),contracts:[...records.values()].sort(compare),artifacts:[...artifacts.values()].sort(compare)});
}
export async function verifyProgramLock(lock,ir,registry,options){
  validateProgramLock(lock);if(options?.target!==lock.target)fail('LOCK_MISMATCH','Lock target differs');
  const current=await createProgramLock(ir,registry,options);if(encode(current)!==encode(lock))fail('LOCK_MISMATCH','Program or dependency closure differs');return true;
}
export async function executeLockedIR(lock,ir,inputs,registry,{target,artifactSources,...options}={}){registry=snapshotRegistry(registry);ir=structuredClone(ir);await verifyProgramLock(lock,ir,registry,{target,artifactSources});return executeIR(ir,inputs,registry,options);}
export async function compileLockedIRToJS(lock,ir,registry,options){registry=snapshotRegistry(registry);ir=structuredClone(ir);await verifyProgramLock(lock,ir,registry,options);return compileIRToJS(ir,registry);}
export const serializeProgramLock=lock=>JSON.stringify(validateProgramLock(lock),null,2)+'\n';
export function parseProgramLock(source){return validateProgramLock(JSON.parse(source));}
