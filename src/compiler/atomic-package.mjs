import {compileIRToJS,graphFromIR} from '../ir/index.mjs';
import {validateControlIR} from '../ir/control.mjs';
import {coreIntrinsic} from '../reference/registry.mjs';
import {sha256,registerTrustedPinnedModule} from '../contracts/provenance.mjs';
import {assertTypeName} from '../reference/types.mjs';
import {fail} from '../reference/errors.mjs';

const sealedImplementations=new WeakMap();
function sealedImplementation(item){const known=sealedImplementations.get(item.execute);return known&&item.kind==='atomic'&&!item.interfaceBoundary&&item.id===known.id&&item.version===known.version&&item.output===known.output&&item.emitJS===known.emitJS&&!item.effects.length&&!item.capabilities.length&&JSON.stringify(Object.entries(item.inputs))===known.inputs;}
const primitive=type=>['Number','Boolean','String','NumberArray'].includes(type);
const identity=value=>typeof value==='string'&&value.length<=1024&&/^[-A-Za-z0-9_.]+$/.test(value);
function fields(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))fail('INVALID_ATOMIC_PACKAGE','Unexpected package fields');}

/** Strict finite synchronous ABI. Package and contract identities are independent. */
export function validateAtomicPackage(value){
 fields(value,['schemaVersion','id','version','target','contract','module']);if(value.schemaVersion!=='ems-atomic-package/1'||!identity(value.id)||!identity(value.version)||value.target!=='js-esm-sync/1')fail('INVALID_ATOMIC_PACKAGE','Unsupported package identity/target');
 fields(value.contract,['id','version','kind','inputs','output','effects','capabilities']);const c=value.contract;
 if(!identity(c.id)||!identity(c.version)||c.kind!=='atomic'||!c.inputs||typeof c.inputs!=='object'||Array.isArray(c.inputs)||Reflect.ownKeys(c.inputs).length>64||!primitive(c.output)||!Array.isArray(c.effects)||c.effects.length||!Array.isArray(c.capabilities)||c.capabilities.length)fail('INVALID_ATOMIC_PACKAGE','Invalid finite pure contract');
 const inputs=Object.fromEntries(Reflect.ownKeys(c.inputs).map(name=>{const d=Object.getOwnPropertyDescriptor(c.inputs,name);if(typeof name!=='string'||!/^[_A-Za-z][_A-Za-z0-9]*$/.test(name)||!d||!Object.hasOwn(d,'value')||!primitive(d.value))fail('INVALID_ATOMIC_PACKAGE','Invalid public input');assertTypeName(d.value);return [name,d.value];}));
 fields(value.module,['file','sha256']);if(value.module.file!=='module.mjs'||typeof value.module.sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.module.sha256))fail('INVALID_ATOMIC_PACKAGE','Invalid module descriptor');
 return {schemaVersion:value.schemaVersion,id:value.id,version:value.version,target:value.target,contract:{id:c.id,version:c.version,kind:'atomic',inputs,output:c.output,effects:[],capabilities:[]},module:{file:'module.mjs',sha256:value.module.sha256}};
}

/** Compile and link without executing generated modules. Unsupported dependency ABI fails before output. */
export async function buildAtomicPackage(ir,registry,{id,packageId=id+'.package',version='1.0.0',packageVersion=version,target='js-esm-sync/1'}={}){
 if(target!=='js-esm-sync/1')fail('UNSUPPORTED_TARGET','Only finite synchronous ESM sealing is supported');if(!identity(id)||!identity(packageId)||!identity(version)||!identity(packageVersion))fail('INVALID_ATOMIC_PACKAGE','Invalid package/contract identity');
 let inputs,output;const roots=new Set();
 if(ir?.schemaVersion==='ems-ir/2'){
  const checked=validateControlIR(ir,registry);for(const fn of checked.functions.values()){if(fn.async||fn.localEffects?.length||fn.policy.effects.length||fn.policy.capabilities.length)fail('UNSUPPORTED_TARGET','Sealing cannot erase async/local/external effects');for(const s of walk(fn.body))if(s.kind==='call'&&s.target.kind==='contract')roots.add(s.target.id);}
  if(!['ems-control-finite/1','ems-control-errors/1','ems-control-algebraic/1'].includes(ir.profile))fail('UNSUPPORTED_TARGET','Public synchronous package ABI does not support futures/streams/resources');
  inputs=Object.fromEntries(checked.entry.inputs.map(p=>[p.name,p.type]));output=checked.entry.output.type;
 }else{const graph=graphFromIR(ir,registry);inputs=Object.fromEntries(Object.entries(graph.inputs).map(([name,p])=>[name,p.type]));output=graph.output.type;for(const n of graph.nodes)roots.add(n.uses);}
 if(!primitive(output)||Object.values(inputs).some(type=>!primitive(type)))fail('UNSUPPORTED_TARGET','Package public ABI currently requires primitive finite types');
 const visited=new Set();function dependency(name){if(visited.has(name))return;visited.add(name);const item=registry.resolve(name);if(item.kind==='composite'){if(item.effects.length||item.capabilities.length)fail('UNSUPPORTED_TARGET','Effectful composite cannot be sealed');for(const n of item.graph.nodes)dependency(n.uses);}else if(!coreIntrinsic(item)&&!sealedImplementation(item))fail('UNPINNED_IMPLEMENTATION','Standalone sealing requires builtins or matching trusted sealed-package implementations');}for(const name of roots)dependency(name);
 const code=compileIRToJS(ir,registry);if(!code.includes('export function execute('))fail('UNSUPPORTED_TARGET','Package module must provide synchronous execute');
 const embedded=code.replace('export function execute(','function execute('),names=Object.keys(inputs);
 const module=code+'\nexport function create(dependencies){if(Object.keys(dependencies).length)throw new Error("Unexpected package dependencies");return {execute,emitJS(args){const names='+JSON.stringify(names)+';return "(()=>{\\n"+'+JSON.stringify(embedded)+'+"\\nreturn execute(Object.fromEntries(["+names.map(name=>\"[\"+JSON.stringify(name)+\",(\"+args[name]+\")]\").join(\",\")+" ]));})()";}};}\n';
 if(new TextEncoder().encode(module).length>2097152)fail('ATOMIC_PACKAGE_LIMIT','Linked package exceeds 2 MiB');
 const manifest=validateAtomicPackage({schemaVersion:'ems-atomic-package/1',id:packageId,version:packageVersion,target,contract:{id,version,kind:'atomic',inputs,output,effects:[],capabilities:[]},module:{file:'module.mjs',sha256:await sha256(module)}});
 return {manifest,files:{'module.mjs':module,'contract.json':JSON.stringify(manifest,null,2)+'\n'}};
}
function* walk(value){if(!value||typeof value!=='object')return;if(typeof value.kind==='string')yield value;for(const child of Object.values(value))yield* walk(child);}

/** Explicit trusted import. Hash mismatch/duplicate IDs fail before any module is evaluated. Not a sandbox. */
export async function registerTrustedAtomicPackage(registry,value,source){
 const manifest=validateAtomicPackage(value);if(typeof source!=='string'||new TextEncoder().encode(source).length>2097152)fail('INVALID_ATOMIC_PACKAGE','Invalid bounded module source');if(registry.items.has(manifest.contract.id))fail('DUPLICATE_CONTRACT','Contract already registered');
 if(await sha256(source)!==manifest.module.sha256)fail('ARTIFACT_MISMATCH','Package module bytes do not match manifest');
 const c=manifest.contract;await registerTrustedPinnedModule(registry,{schemaVersion:'ems-pinned-binding/1',module:manifest.id,contracts:[{...c,exports:{execute:'execute',emitJS:'emitJS'}}]},[{id:manifest.id,source,dependencies:[]}]);const item=registry.resolve(c.id);sealedImplementations.set(item.execute,{id:item.id,version:item.version,output:item.output,emitJS:item.emitJS,inputs:JSON.stringify(Object.entries(item.inputs))});return registry;
}
