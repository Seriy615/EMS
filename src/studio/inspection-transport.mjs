import {fail} from '../reference/errors.mjs';
import {ProjectEditor,parseProject} from './project.mjs';
import {compileTextDraft} from './text.mjs';
import {normalizeInspectionPolicy,createControlInspector,inspectionGrantBindings} from '../runtime/inspection.mjs';
import {controlNodeEntries} from '../ir/control-addresses.mjs';
import {parseControlType,controlVariants} from '../semantics/control-algebraic.mjs';

const error=()=>fail('INVALID_INSPECTION_SNAPSHOT','Invalid or unauthorized inspection message');
const own=(value,key)=>Object.hasOwn(value,key);
function fields(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length||keys.some(key=>!own(value,key))||Reflect.ownKeys(value).some(key=>!own(Object.getOwnPropertyDescriptor(value,key),'value')))error();
}
function array(value,max){if(!Array.isArray(value))error();const length=Object.getOwnPropertyDescriptor(value,'length')?.value;if(!Number.isSafeInteger(length)||length<0||length>max||Reflect.ownKeys(value).length!==length+1)error();return Array.from({length},(_,index)=>{const d=Object.getOwnPropertyDescriptor(value,String(index));if(!d||!own(d,'value'))error();return d.value;});}
function same(actual,expected){
 if(expected===null||typeof expected!=='object')return Object.is(actual,expected);
 if(Array.isArray(expected)){return array(actual,expected.length).length===expected.length&&expected.every((item,index)=>same(Object.getOwnPropertyDescriptor(actual,String(index)).value,item));}
 fields(actual,Reflect.ownKeys(expected));return Reflect.ownKeys(expected).every(key=>same(Object.getOwnPropertyDescriptor(actual,key).value,expected[key]));
}
const finiteType=type=>['Number','Boolean','String','NumberArray','Option','Result'].includes(type.name)&&type.arguments.every(finiteType);

/** Bind host grants to the exact source/entry/profile, then reconstruct the typed program locally. */
export function prepareStudioInspection(request,editor=null){
 if(own(request,'graphInspection'))fail('UNSUPPORTED_INSPECTION_TRANSPORT','Graph value transport requires a checked adapter');
 if(!own(request,'inspection'))return null;
 if(request.action!=='text'||request.debug!==true)fail('UNSUPPORTED_INSPECTION_TRANSPORT','Value inspection requires control text debugging');
 const descriptor=Object.getOwnPropertyDescriptor(request,'inspection');if(!own(descriptor,'value'))error();const witness=descriptor.value;fields(witness,['schemaVersion','source','entry','lowering','policy']);
 if(witness.schemaVersion!=='ems-source-inspection/1'||typeof witness.source!=='string'||witness.source.length>262144||new TextEncoder().encode(witness.source).length>262144||witness.source!==request.draft?.source||witness.entry!==request.draft?.entry||witness.lowering!==request.draft?.lowering)fail('STALE_INSPECTION_SOURCE','Inspection source witness disagrees with execution');
 editor??=new ProjectEditor(parseProject(request.project));if(request.selected&&editor.selectedContract!==request.selected)editor.openContract(request.selected);
 const bundle=compileTextDraft(request.draft,editor);if(bundle.ir.schemaVersion!=='ems-ir/2')fail('UNSUPPORTED_INSPECTION_PROFILE','This value adapter requires control IR');
 const policy=normalizeInspectionPolicy(witness.policy);createControlInspector(bundle.ir,policy);
 const functions=new Map(bundle.ir.functions.map(fn=>[fn.id,{fn,nodes:new Map(controlNodeEntries(fn)),grants:policy.allow.find(grant=>grant.function===fn.id)?inspectionGrantBindings(fn,policy.allow.find(grant=>grant.function===fn.id)):[]}]));
 return {editor,bundle,policy,functions,witness:{schemaVersion:witness.schemaVersion,source:witness.source,entry:witness.entry,lowering:witness.lowering,policy}};
}

/** Closed finite DTO copier. It never invokes accessors and never echoes malformed payloads in errors. */
function valueCopy(value,type,policy){
 if(type.name==='Number'){if(typeof value!=='number'||!Number.isFinite(value))error();return value;}
 if(type.name==='Boolean'){if(typeof value!=='boolean')error();return value;}
 if(type.name==='String'){if(typeof value!=='string'||value.length>policy.maxStringBytes||new TextEncoder().encode(value).length>policy.maxStringBytes)error();return value;}
 if(type.name==='NumberArray')return array(value,policy.maxArrayItems).map(item=>valueCopy(item,{name:'Number',arguments:[]},policy));
 if(!finiteType(type))error();
 const tagDescriptor=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,'tag'):null;
 if(!tagDescriptor||!own(tagDescriptor,'value'))error();const tag=tagDescriptor.value,variant=controlVariants(type)?.get(tag);if(!variant)error();
 fields(value,variant.length?['tag','value']:['tag']);return variant.length?{tag,value:valueCopy(value.value,variant[0],policy)}:{tag};
}
export function validateInspectionSnapshot(snapshot,fnId,prepared){
 fields(snapshot,['schemaVersion','variables','truncated']);if(!['ems-inspection/1','ems-inspection/2'].includes(snapshot.schemaVersion)||typeof snapshot.truncated!=='boolean')error();
 const owner=prepared.functions.get(fnId);if(!owner)error();const bindings=owner.grants,variables=array(snapshot.variables,32),version=prepared.policy.allow.some(item=>own(item,'declarations'))?'ems-inspection/2':'ems-inspection/1';if(snapshot.schemaVersion!==version)error();
 if(variables.length>bindings.length||!snapshot.truncated&&variables.length!==bindings.length||snapshot.truncated&&variables.length>=bindings.length)error();
 const protectedProgram=prepared.policy.protectedFunctions.length>0,impure=owner.fn.policy.effects.length>0||owner.fn.policy.capabilities.length>0||(owner.fn.localEffects?.length??0)>0;
 const copied=variables.map((record,index)=>{
  const hasValue=record&&typeof record==='object'&&own(record,'value'),keys=['name','type','status',...(version==='ems-inspection/2'?['declaration']:[]),...(hasValue?['value']:[])];fields(record,keys);const binding=bindings[index];if(record.name!==binding.name||version==='ems-inspection/2'&&record.declaration!==binding.declaration)error();const identity=version==='ems-inspection/2'?{name:record.name,declaration:record.declaration}:{name:record.name};
  if(protectedProgram||impure){if(hasValue||record.type!==null||record.status!==(protectedProgram?'protected-program':'protected-effects'))error();return {...identity,type:null,status:record.status};}
  if(record.status==='not-in-scope'){if(hasValue||record.type!==null)error();return {...identity,type:null,status:record.status};}
  const type=binding.type;if(record.type!==type)error();const parsed=parseControlType(type,true,true,true),supported=finiteType(parsed);
  if(!supported){if(hasValue||record.status!=='excluded-type')error();return {...identity,type,status:record.status};}
  if(record.status==='value'){if(!hasValue)error();return {...identity,type,status:'value',value:valueCopy(record.value,parsed,prepared.policy)};}
  if(hasValue||!['limit','unavailable'].includes(record.status))error();return {...identity,type,status:record.status};
 });
 const result={schemaVersion:version,variables:copied,truncated:snapshot.truncated};if(new TextEncoder().encode(JSON.stringify(result)).length>prepared.policy.maxBytes)error();return result;
}

/** A pause carries exact checked operation metadata; values are allowed only under the current source grant. */
export function validateInspectionPause(pause,prepared){
 if(!prepared)error();
 const profile=pause&&Object.getOwnPropertyDescriptor(pause,'profile');if(profile&&!own(profile,'value'))error();
 fields(pause,profile?.value==='control'?['phase','profile','function','node','kind','type','callStack','frames','step','location','inspection','token']:['phase','callPath','frames','inputs','output','effects','capabilities','location','token']);
 const frames=array(pause?.frames,64);if(!frames.length||frames.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(frames).size!==frames.length||!Number.isSafeInteger(pause.token)||pause.token<1||pause.phase!=='enter')error();
 if(pause.profile==='control'){
  fields(pause,['phase','profile','function','node','kind','type','callStack','frames','step','location','inspection','token']);
  const owner=prepared.functions.get(pause.function),node=owner?.nodes.get(pause.node);if(!node||pause.kind!==node.kind||pause.type!==(node.type??null)||!Number.isSafeInteger(pause.step)||pause.step<1)error();
  const stack=array(pause.callStack,64);if(!stack.length||stack.at(-1)!==pause.function||stack.some(id=>!prepared.functions.has(id)))error();
  const location=prepared.bundle.provenance.functions[pause.function]?.nodes?.[pause.node]??null;if(!same(pause.location,location))error();
  const inspection=validateInspectionSnapshot(pause.inspection,pause.function,prepared);
  return {phase:'enter',profile:'control',function:pause.function,node:pause.node,kind:pause.kind,type:pause.type,callStack:[...stack],frames:[...frames],step:pause.step,location:structuredClone(location),inspection,token:pause.token};
 }
 fields(pause,['phase','callPath','frames','inputs','output','effects','capabilities','location','token']);
 const calls=array(pause.callPath,32);if(!calls.length)error();let previous=null,leaf;
 for(const call of calls){fields(call,['graph','node','contract']);const graph=prepared.editor.registry.items.get(call.graph)?.graph;const node=graph?.nodes.find(node=>node.id===call.node);if(!node||node.uses!==call.contract||previous&&previous.kind!=='composite'||previous&&previous.graph.id!==call.graph)error();leaf=prepared.editor.registry.resolve(call.contract);previous=leaf;}
 const expectedInputs=Object.fromEntries(Object.entries(leaf.inputs).map(([name,type])=>[name,typeof type==='string'?type:type.type]));
 if(!same(pause.inputs,expectedInputs)||pause.output!==leaf.output||!same(pause.effects,leaf.effects)||!same(pause.capabilities,leaf.capabilities)||pause.location!==null)error();
 return {phase:'enter',callPath:structuredClone(calls),frames:[...frames],inputs:expectedInputs,output:leaf.output,effects:[...leaf.effects],capabilities:[...leaf.capabilities],location:null,token:pause.token};
}
