import { fail } from '../reference/errors.mjs';
import { assertValueType, PRIMITIVE_TYPES } from '../reference/types.mjs';
import { parseControlType } from '../semantics/control-algebraic.mjs';
import { assertPolicyNames, analyzeGraphEffects } from '../semantics/effects.mjs';
import { rememberAtomicBinding } from './provenance.mjs';
import { checkContractConditions, checkContractFailure, emitContractBoundary } from './conditions.mjs';

function fields(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value,key)))
    fail('INVALID_IDL','Unexpected or missing IDL fields');
}
function identifier(value) {
  if (typeof value !== 'string' || !/^[-A-Za-z0-9_.]+$/.test(value)) fail('INVALID_IDL','Invalid identifier');
}
function version(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(value)) fail('INVALID_IDL','Expected stable semantic version');
  const parts=value.split('.').map(Number);
  if(parts.some(part=>!Number.isSafeInteger(part)))fail('INVALID_IDL','Version component exceeds safe range');
  return parts;
}
function list(value) {
  if (!Array.isArray(value) || value.length>1000 || Object.keys(value).length!==value.length)fail('INVALID_IDL','Expected bounded dense list');
}
function type(value) { parseControlType(value,true,true,true); }
function canonical(value) {
  if(Array.isArray(value))return value.map(canonical);
  if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
function freeze(value) {
  if(value && typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;
}

/** Validate a public interface without loading or invoking an implementation. */
export function validateContractInterface(spec) {
  const resource=spec?.schemaVersion==='ems-resource-interface/1';
  fields(spec,['schemaVersion','id','version','inputs','output','errors','semantics','conditions',...(resource?['lifecycle']:[])]);
  if(!resource&&spec.schemaVersion!=='ems-contract-interface/1')fail('IDL_VERSION','Unsupported interface schema');
  identifier(spec.id);version(spec.version);list(spec.inputs);const names=new Map();
  for(const input of spec.inputs){fields(input,['name','type']);if(typeof input.name!=='string'||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(input.name)||names.has(input.name))fail('INVALID_IDL','Invalid or duplicate port');type(input.type);names.set(input.name,input.type);}
  fields(spec.output,['type']);type(spec.output.type);list(spec.errors);const codes=new Set();
  for(const error of spec.errors){fields(error,['code','payloadType']);identifier(error.code);if(codes.has(error.code))fail('INVALID_IDL','Duplicate error code');codes.add(error.code);
    if(error.payloadType!==null){type(error.payloadType);parseControlType(error.payloadType);if(error.code!=='USER_THROW')fail('INVALID_IDL','Typed payload uses USER_THROW envelope');}else if(error.code==='USER_THROW')fail('INVALID_IDL','USER_THROW requires a payload type');}
  fields(spec.semantics,['determinism','effects','capabilities']);
  if(!['deterministic','unspecified'].includes(spec.semantics.determinism))fail('INVALID_IDL','Unknown determinism');
  assertPolicyNames(spec.semantics.effects,'effects');assertPolicyNames(spec.semantics.capabilities,'capabilities');
  fields(spec.conditions,['pre','post']);
  for(const phase of ['pre','post']){list(spec.conditions[phase]);const seen=new Set();
    for(const condition of spec.conditions[phase]){fields(condition,['kind','subject']);let subjectType;
      if(Object.hasOwn(condition.subject??{},'input')){fields(condition.subject,['input']);subjectType=names.get(condition.subject.input);}
      else{fields(condition.subject,['result']);if(condition.subject.result!==true||phase!=='post')fail('INVALID_IDL','Result unavailable in precondition');subjectType=spec.output.type;}
      const expected={nonzero:'Number',positive:'Number',nonempty:'NumberArray'}[condition.kind];
      if(!expected||expected!==subjectType)fail('INVALID_IDL','Invalid condition subject/type');
      const key=`${condition.kind}:${condition.subject.input??'@result'}`;if(seen.has(key))fail('INVALID_IDL','Duplicate condition');seen.add(key);
    }
  }
  if(resource){
    fields(spec.lifecycle,['ownership','valueType','read','write','release']);
    if(spec.lifecycle.ownership!=='execution')fail('INVALID_IDL','Resource requires execution ownership');
    parseControlType(spec.lifecycle.valueType);
    if(spec.output.type!==`ResourceHandle<${spec.lifecycle.valueType}>`)fail('INVALID_IDL','Resource output disagrees with lifecycle value type');
    for(const phase of ['read','write']){
      if(phase==='write'&&spec.lifecycle.write===null)continue;
      const operation=spec.lifecycle[phase];fields(operation,['errors','conditions']);
      validateContractInterface(resourceOperationInterface(spec,phase));
    }
    fields(spec.lifecycle.release,['errors']);
    validateContractInterface(resourceOperationInterface(spec,'release'));
  }
  return freeze(canonical(spec));
}

/** Reuse the ordinary interface type/condition/error rules for each resource phase. */
export function resourceOperationInterface(spec,phase) {
  return {schemaVersion:'ems-contract-interface/1',id:spec.id+'.'+phase,version:spec.version,
    inputs:phase==='write'?[{name:'value',type:spec.lifecycle.valueType}]:[],
    output:{type:phase==='release'?'Boolean':spec.lifecycle.valueType},
    errors:spec.lifecycle[phase].errors,semantics:{determinism:spec.semantics.determinism,effects:[],capabilities:[]},
    conditions:phase==='release'?{pre:[],post:[]}:spec.lifecycle[phase].conditions};
}

/** Strict, exact-version implementation selection metadata, separate from package/license/visibility. */
export function validateContractBinding(binding) {
  fields(binding,['schemaVersion','id','version','interface','implementation','targets','determinism']);
  if(binding.schemaVersion!=='ems-contract-binding/1')fail('IDL_VERSION','Unsupported binding schema');
  identifier(binding.id);version(binding.version);
  for(const key of ['interface','implementation']){fields(binding[key],['id','version']);identifier(binding[key].id);version(binding[key].version);}
  list(binding.targets);assertPolicyNames(binding.targets,'targets');if(!binding.targets.length)fail('INVALID_IDL','Binding has no target');
  if(!['deterministic','unspecified'].includes(binding.determinism))fail('INVALID_IDL','Unknown binding determinism');
  return freeze(canonical(binding));
}

/** Backward compatibility for callers of oldSpec; version changes never authorize an unpinned binding. */
export function compareContractInterfaces(oldSpec,newSpec) {
  const old=validateContractInterface(oldSpec),next=validateContractInterface(newSpec),reasons=[];
  const ov=version(old.version),nv=version(next.version);
  if(old.schemaVersion!==next.schemaVersion)reasons.push('schema');
  if(old.id!==next.id)reasons.push('identity');
  if(nv[0]!==ov[0])reasons.push('major');
  if(nv[0]<ov[0] || nv[0]===ov[0] && (nv[1]<ov[1] || nv[1]===ov[1] && nv[2]<ov[2]))reasons.push('version-regression');
  if(JSON.stringify(old.inputs)!==JSON.stringify(next.inputs)||old.output.type!==next.output.type)reasons.push('signature');
  for(const field of ['effects','capabilities'])if(next.semantics[field].some(name=>!old.semantics[field].includes(name)))reasons.push(field);
  if(old.semantics.determinism==='deterministic'&&next.semantics.determinism!=='deterministic')reasons.push('determinism');
  if(next.errors.some(error=>!old.errors.some(previous=>previous.code===error.code&&previous.payloadType===error.payloadType)))reasons.push('errors');
  const key=condition=>`${condition.kind}:${condition.subject.input??'@result'}`;
  if(next.conditions.pre.some(condition=>!old.conditions.pre.some(previous=>key(previous)===key(condition))))reasons.push('preconditions');
  if(old.conditions.post.some(condition=>!next.conditions.post.some(updated=>key(updated)===key(condition))))reasons.push('postconditions');
  if(old.lifecycle&&next.lifecycle){
    if(old.lifecycle.valueType!==next.lifecycle.valueType||old.lifecycle.ownership!==next.lifecycle.ownership)reasons.push('lifecycle');
    for(const phase of ['read','write','release']){
      if((old.lifecycle[phase]===null)!==(next.lifecycle[phase]===null)){reasons.push(phase);continue;}
      if(old.lifecycle[phase]===null)continue;
      for(const reason of compareContractInterfaces(resourceOperationInterface(old,phase),resourceOperationInterface(next,phase)).reasons)reasons.push(phase+'.'+reason);
    }
  }
  if(old.version===next.version&&JSON.stringify(old)!==JSON.stringify(next))reasons.push('changed-without-version');
  return Object.freeze({compatible:reasons.length===0,reasons:Object.freeze(reasons)});
}

/** Check actual registry metadata, including unused nested composite effects, without executing callbacks. */
export function checkContractBinding(spec,descriptor,registry,target) {
  const contract=validateContractInterface(spec),binding=validateContractBinding(descriptor);
  if(binding.interface.id!==contract.id||binding.interface.version!==contract.version)fail('CONTRACT_VERSION','Binding interface reference mismatch');
  if(!binding.targets.includes(target))fail('UNSUPPORTED_TARGET','Binding does not support requested target');
  const implementation=registry.resolve(binding.implementation.id);
  if(implementation.version!==binding.implementation.version)fail('CONTRACT_VERSION','Implementation version mismatch');
  const actual=Object.entries(implementation.inputs).map(([name,t])=>canonical({name,type:typeof t==='string'?t:t.type}));
  if(JSON.stringify(actual)!==JSON.stringify(contract.inputs)||implementation.output!==contract.output.type)fail('INCOMPATIBLE_BINDING','Implementation signature mismatch');
  const policy=implementation.kind==='composite'?analyzeGraphEffects(implementation.graph,registry):implementation;
  for(const field of ['effects','capabilities'])if([...policy[field],...implementation[field]].some(name=>!contract.semantics[field].includes(name)))fail('INCOMPATIBLE_BINDING','Implementation exceeds interface policy',{field});
  if(contract.semantics.determinism==='deterministic'&&binding.determinism!=='deterministic')fail('INCOMPATIBLE_BINDING','Implementation determinism mismatch');
  if(contract.lifecycle){
    if(implementation.kind!=='resource'||implementation.valueType!==contract.lifecycle.valueType||contract.lifecycle.write!==null&&typeof implementation.write!=='function')
      fail('INCOMPATIBLE_BINDING','Resource lifecycle implementation mismatch');
  }
  return {contract,binding,implementation};
}

/** Install a finite interface binding while preserving atomic/composite representation. */
export function registerContractBinding(registry,spec,descriptor,{target}={}) {
  const {contract,binding,implementation}=checkContractBinding(spec,descriptor,registry,target);
  if(contract.lifecycle){
    if(!contract.inputs.every(input=>PRIMITIVE_TYPES.has(input.type))||!PRIMITIVE_TYPES.has(contract.lifecycle.valueType))fail('UNSUPPORTED_BINDING','Resource native ABI requires primitive inputs/value type');
    registry.registerResource({id:contract.id,version:contract.version,inputs:Object.fromEntries(contract.inputs.map(input=>[input.name,input.type])),valueType:contract.lifecycle.valueType,
      effects:contract.semantics.effects,capabilities:contract.semantics.capabilities,
      acquire:implementation.acquire,read:implementation.read,write:contract.lifecycle.write===null?null:implementation.write,release:implementation.release,
      resourceBoundaries:[{interface:contract,binding},...(implementation.resourceBoundaries??[])]});
    return Object.freeze({interface:contract,binding});
  }
  if(!['atomic','composite'].includes(implementation.kind)||!contract.inputs.every(input=>PRIMITIVE_TYPES.has(input.type))||!PRIMITIVE_TYPES.has(contract.output.type))
    fail('UNSUPPORTED_BINDING','Interface adapter currently requires finite atomic/composite ABI');
  const inputs=Object.fromEntries(contract.inputs.map(input=>[input.name,input.type]));
  if(implementation.kind==='composite'){
    const graph=implementation.interfaceBoundary?{inputs:structuredClone(implementation.graph.inputs),output:structuredClone(implementation.graph.output),nodes:[{id:'implementation',uses:implementation.id,args:Object.fromEntries(contract.inputs.map(input=>[input.name,{input:input.name}]))}],returns:{node:'implementation'}}:structuredClone(implementation.graph);
    graph.schemaVersion='ems-contract-graph/1';graph.interfaceRef={id:contract.id,version:contract.version};graph.id=contract.id;graph.version=contract.version;graph.effects=[...contract.semantics.effects];graph.capabilities=[...contract.semantics.capabilities];
    registry.registerComposite({id:contract.id,version:contract.version,graph,effects:contract.semantics.effects,capabilities:contract.semantics.capabilities,interfaceBoundary:{interface:contract,binding}});
    return Object.freeze({interface:contract,binding});
  }
  async function execute(params,context){
    for(const input of contract.inputs)assertValueType(params[input.name],input.type,'contract input');
    checkContractConditions(contract.conditions.pre,params,undefined,'pre',contract.id);
    try{const result=await implementation.execute(params,context);assertValueType(result,contract.output.type,'contract output');checkContractConditions(contract.conditions.post,params,result,'post',contract.id);return result;}
    catch(error){checkContractFailure(error,contract.errors,contract.id);}
  }
  const emitJS=typeof implementation.emitJS==='function'?args=>emitContractBoundary(contract,args,params=>({statements:[],result:implementation.emitJS(params)})):null;
  registry.registerAtomic({id:contract.id,version:contract.version,inputs,output:contract.output.type,effects:contract.semantics.effects,capabilities:contract.semantics.capabilities,execute,emitJS,interfaceBoundary:{interface:contract,binding}});
  rememberAtomicBinding(registry.resolve(contract.id),implementation);
  return Object.freeze({interface:contract,binding});
}
