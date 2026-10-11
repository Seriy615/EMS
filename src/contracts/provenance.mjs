import { Registry } from '../reference/registry.mjs';
import { fail } from '../reference/errors.mjs';
const origins=new WeakMap(),atomicBindings=new WeakMap();
export function rememberAtomicBinding(item,implementation){atomicBindings.set(item.execute,{emitJS:item.emitJS,implementation,metadata:JSON.stringify([item.id,item.version,Object.entries(item.inputs),item.output,item.effects,item.capabilities,item.interfaceBoundary])});}
export function atomicBindingSource(item){const record=atomicBindings.get(item.execute);return record?.emitJS===item.emitJS&&record.metadata===JSON.stringify([item.id,item.version,Object.entries(item.inputs),item.output,item.effects,item.capabilities,item.interfaceBoundary])?record.implementation:null;}
const slots=item=>item.kind==='resource'?['acquire','read','write','release']:['execute','emitJS'];
export function verifiedOrigin(item){
  const key=item.kind==='resource'?item.acquire:item.execute;
  return (origins.get(key)??[]).find(record=>record.kind===item.kind&&slots(item).every(name=>name==='write'&&item.write===null||record.callbacks[name]===item[name]))??null;
}
export function sourceBytes(source){
  if(typeof source==='string')return new TextEncoder().encode(source);
  if(source instanceof Uint8Array)return new Uint8Array(source);
  fail('INVALID_ARTIFACT','Expected UTF-8 text or Uint8Array');
}
export async function sha256(source){if(!globalThis.crypto?.subtle)fail('HASH_UNAVAILABLE','Web Crypto SHA-256 is required');const digest=await globalThis.crypto.subtle.digest('SHA-256',sourceBytes(source));return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');}

/** Explicit TRUSTED module SDK. Factories receive verified dependency exports; no imports are inferred or sandboxed. */
export async function registerTrustedPinnedModule(registry,manifest,modules){
  if(manifest?.schemaVersion!=='ems-pinned-binding/1'||!Array.isArray(manifest.contracts)||!Array.isArray(modules))fail('INVALID_BINDING','Expected pinned binding and module sources');
  const definitions=new Map(),artifacts=new Map(),loaded=new Map(),visiting=new Set();
  for(const module of modules){
    if(!module||typeof module.id!=='string'||!/^[-A-Za-z0-9_.]+$/.test(module.id)||definitions.has(module.id)||!Array.isArray(module.dependencies)||new Set(module.dependencies).size!==module.dependencies.length)fail('INVALID_ARTIFACT','Invalid module definition');
    definitions.set(module.id,{id:module.id,bytes:sourceBytes(module.source),dependencies:[...module.dependencies]});
  }
  async function load(id){
    if(loaded.has(id))return loaded.get(id);
    if(visiting.has(id))fail('ARTIFACT_CYCLE','Module dependency cycle');
    const definition=definitions.get(id);if(!definition)fail('MISSING_ARTIFACT','Missing module source',{artifact:id});visiting.add(id);
    const dependencies=Object.create(null);for(const dependency of definition.dependencies)dependencies[dependency]=await load(dependency);
    const hash=await sha256(definition.bytes),text=new TextDecoder('utf-8',{fatal:true}).decode(definition.bytes);
    const namespace=await import(`data:text/javascript,${encodeURIComponent(text)}`);
    if(typeof namespace.create!=='function')fail('INVALID_ARTIFACT','Module SDK must export create(dependencies)');
    const library=await namespace.create(Object.freeze(dependencies));
    if(!library||typeof library!=='object')fail('INVALID_ARTIFACT','Module factory must return exports');
    artifacts.set(id,Object.freeze({id,sha256:hash,dependencies:Object.freeze([...definition.dependencies].sort())}));loaded.set(id,library);visiting.delete(id);return library;
  }
  const library=await load(manifest.module),staged=new Registry();
  for(const spec of manifest.contracts){
    if(registry.items.has(spec.id))fail('DUPLICATE_CONTRACT','Pinned contract already registered');
    const callbacks={};for(const [name,symbol] of Object.entries(spec.exports??{})){
      if(symbol===null){callbacks[name]=null;continue;}if(typeof symbol!=='string'||!Object.hasOwn(library,symbol)||typeof library[symbol]!=='function')fail('MISSING_EXPORT','Missing pinned callback',{symbol});callbacks[name]=library[symbol];
    }
    if(spec.kind==='atomic')staged.registerAtomic({...spec,...callbacks});
    else if(spec.kind==='resource')staged.registerResource({...spec,...callbacks});
    else fail('INVALID_BINDING','Pinned module supports atomic/resource implementations');
  }
  const records=Object.freeze([...artifacts.values()].sort((a,b)=>a.id.localeCompare(b.id)));
  for(const item of staged.items.values()){
    if(item.kind==='atomic')registry.registerAtomic(item);else registry.registerResource(item);
    const actual=registry.resolve(item.id),key=actual.kind==='resource'?actual.acquire:actual.execute;
    const record=Object.freeze({kind:actual.kind,callbacks:Object.freeze(Object.fromEntries(slots(actual).map(name=>[name,actual[name]]))),module:manifest.module,artifacts:records});
    origins.set(key,[...(origins.get(key)??[]),record]);
  }
  return registry;
}
