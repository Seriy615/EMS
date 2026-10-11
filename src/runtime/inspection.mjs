import {fail} from '../reference/errors.mjs';
import {controlNodeEntries} from '../ir/control-addresses.mjs';
import {parseControlType,controlVariants,controlTypeName} from '../semantics/control-algebraic.mjs';

const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
function fields(value,allowed,required=[]){if(!plain(value)||Reflect.ownKeys(value).some(key=>!allowed.includes(key))||required.some(key=>!Object.hasOwn(value,key))||Reflect.ownKeys(value).some(key=>!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')))fail('INVALID_INSPECTION_POLICY','Invalid inspection fields');}
const identifier=value=>typeof value==='string'&&value.length<=128&&/^[_A-Za-z][_A-Za-z0-9]*$/.test(value);
function list(value,max){
 if(!Array.isArray(value))fail('INVALID_INSPECTION_POLICY','Expected bounded data array');const length=Object.getOwnPropertyDescriptor(value,'length')?.value;
 if(!Number.isSafeInteger(length)||length<0||length>max||Reflect.ownKeys(value).length!==length+1)fail('INVALID_INSPECTION_POLICY','Invalid data array');
 return Array.from({length},(_,index)=>{const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor||!Object.hasOwn(descriptor,'value'))fail('INVALID_INSPECTION_POLICY','Inspection arrays require own data entries');return descriptor.value;});
}
const functionId=value=>typeof value==='string'&&value.length<=1024&&/^[-A-Za-z0-9_.]+$/.test(value);

/** Explicit host grant, copied before execution. No policy means no value-bearing diagnostics. */
export function normalizeInspectionPolicy(value){
 fields(value,['allow','protectedFunctions','maxBytes','maxStringBytes','maxArrayItems']);
 const own=(key,fallback)=>Object.hasOwn(value,key)?Object.getOwnPropertyDescriptor(value,key).value:fallback;
 const allow=list(own('allow',[]),32),protectedFunctions=list(own('protectedFunctions',[]),64),maxBytes=own('maxBytes',8192),maxStringBytes=own('maxStringBytes',4096),maxArrayItems=own('maxArrayItems',128);
 if(!Array.isArray(allow)||allow.length>32||!Array.isArray(protectedFunctions)||protectedFunctions.length>64||protectedFunctions.some(id=>!functionId(id))||new Set(protectedFunctions).size!==protectedFunctions.length)fail('INVALID_INSPECTION_POLICY','Invalid inspection grants/protection');
 for(const [key,actual,min,max]of [['maxBytes',maxBytes,256,65536],['maxStringBytes',maxStringBytes,0,16384],['maxArrayItems',maxArrayItems,0,1024]])if(!Number.isSafeInteger(actual)||actual<min||actual>max)fail('INVALID_INSPECTION_POLICY','Invalid inspection budget',{field:key});
 const functions=new Set();let slots=0;
 const grants=allow.map(record=>{
  fields(record,['function','names','declarations'],['function']);
  const named=Object.hasOwn(record,'names'),addressed=Object.hasOwn(record,'declarations');if(named===addressed)fail('INVALID_INSPECTION_POLICY','Choose names or declarations');
  const key=named?'names':'declarations',entries=list(record[key],32);
  const valid=named?identifier:entry=>typeof entry==='string'&&entry.length<=1024&&/^\/(?:inputs\/[0-9]+|body(?:\/[A-Za-z0-9_~/-]+)?)$/.test(entry);
  if(!functionId(record.function)||functions.has(record.function)||!entries.length||entries.some(entry=>!valid(entry))||new Set(entries).size!==entries.length)fail('INVALID_INSPECTION_POLICY','Invalid inspection grant');
  functions.add(record.function);slots+=entries.length;if(slots>32)fail('INVALID_INSPECTION_POLICY','At most 32 inspection slots');
  return {function:record.function,[key]:entries};
 });
 return {allow:grants,protectedFunctions:[...protectedFunctions],maxBytes,maxStringBytes,maxArrayItems};
}

const supported=type=>['Number','Boolean','String','NumberArray','Option','Result'].includes(type.name)&&type.arguments.every(supported);
function copyFinite(value,type,policy,depth=0){
 if(depth>32)throw 'limit';
 if(type.name==='Number'){if(typeof value!=='number'||!Number.isFinite(value))throw 'unavailable';return value;}
 if(type.name==='Boolean'){if(typeof value!=='boolean')throw 'unavailable';return value;}
 if(type.name==='String'){if(typeof value!=='string')throw 'unavailable';if(value.length>policy.maxStringBytes||new TextEncoder().encode(value).length>policy.maxStringBytes)throw 'limit';return value;}
 if(type.name==='NumberArray'){
  if(!Array.isArray(value))throw 'unavailable';const length=Object.getOwnPropertyDescriptor(value,'length')?.value;
  if(!Number.isSafeInteger(length)||length>policy.maxArrayItems)throw 'limit';const result=[];
  for(let i=0;i<length;i++){const descriptor=Object.getOwnPropertyDescriptor(value,String(i));if(!descriptor||!Object.hasOwn(descriptor,'value'))throw 'unavailable';result.push(copyFinite(descriptor.value,{name:'Number',arguments:[]},policy,depth+1));}
  return result;
 }
 if(!plain(value))throw 'unavailable';
 const tag=Object.getOwnPropertyDescriptor(value,'tag');if(!tag||!Object.hasOwn(tag,'value'))throw 'unavailable';
 const variant=controlVariants(type)?.get(tag.value);if(!variant)throw 'unavailable';
 if(!variant.length)return {tag:tag.value};
 const payload=Object.getOwnPropertyDescriptor(value,'value');if(!payload||!Object.hasOwn(payload,'value'))throw 'unavailable';return {tag:tag.value,value:copyFinite(payload.value,variant[0],policy,depth+1)};
}

/** Initial confidentiality boundary: pure functions only; any marked protected function blocks the whole program.
 * This is conservative host classification, not inferred taint tracking or declassification. */
export function createControlInspector(ir,value){
 const policy=normalizeInspectionPolicy(value),functions=new Map(ir.functions.map(fn=>[fn.id,fn])),grants=new Map(),version=policy.allow.some(record=>Object.hasOwn(record,'declarations'))?'ems-inspection/2':'ems-inspection/1';
 for(const id of policy.protectedFunctions)if(!functions.has(id))fail('INVALID_INSPECTION_POLICY','Unknown protected function');
 for(const grant of policy.allow){const fn=functions.get(grant.function);if(!fn)fail('INVALID_INSPECTION_POLICY','Unknown inspected function');grants.set(fn.id,inspectionGrantBindings(fn,grant));}
 return (id,scope)=>{
  const variables=[],fn=functions.get(id),bindings=grants.get(id)??[],protectedProgram=policy.protectedFunctions.length>0,impure=(fn.policy?.effects.length??0)>0||(fn.policy?.capabilities.length??0)>0||(fn.localEffects?.length??0)>0;let truncated=false;
  for(const binding of bindings){
   const {name,declaration}=binding;const identity=version==='ems-inspection/2'?{name,declaration}:{name};
   let record={...identity,type:null,status:protectedProgram?'protected-program':impure?'protected-effects':'not-in-scope'};
   if(!protectedProgram&&!impure&&scope.has(name)&&(!binding.addressed||scope.get(name).declaration===declaration)){
    const cell=scope.get(name);record.type=cell.type??null;
    try{const type=parseControlType(cell.type,true,true,true);if(!supported(type))record.status='excluded-type';else{record={...identity,type:cell.type,status:'value',value:copyFinite(cell.value,type,policy)};}}
    catch(reason){record.status=['limit','unavailable'].includes(reason)?reason:'unavailable';}
   }
   const next={schemaVersion:version,variables:[...variables,record],truncated:false};
   if(new TextEncoder().encode(JSON.stringify(next)).length>policy.maxBytes){truncated=true;break;}
   variables.push(record);
  }
  return {schemaVersion:version,variables,truncated};
 };
}

/** Match bindings get their declared algebraic payload type, never a guessed runtime JS type. */
export function inspectionPatternTypes(pattern,type,result=new Map()){
 const parsed=typeof type==='string'?parseControlType(type,true,true,true):type;
 if(pattern.kind==='binding')result.set(pattern.name,controlTypeName(parsed));
 if(pattern.kind==='constructor'){const payload=controlVariants(parsed)?.get(pattern.tag);pattern.arguments.forEach((child,index)=>inspectionPatternTypes(child,payload[index],result));}
 return result;
}

/** Catalog each declaration by a structural IR address, independent of canvas and source offsets. */
export function controlInspectionDeclarations(fn){
 const result=fn.inputs.map((input,index)=>({name:input.name,type:input.type,declaration:'/inputs/'+index})),patterns=new Map();
 function patternTypes(pattern,type){
  if(pattern.kind==='binding')patterns.set(pattern,controlTypeName(type));
  if(pattern.kind==='constructor'){const payload=controlVariants(type).get(pattern.tag);pattern.arguments.forEach((child,index)=>patternTypes(child,payload[index]));}
 }
 const entries=[...controlNodeEntries(fn)];
 for(const [,node]of entries)if(node.kind==='match')for(const arm of node.arms)patternTypes(arm.pattern,parseControlType(node.value.type,true,true,true));
 for(const [path,node]of entries){
  if(['let','using'].includes(node.kind))result.push({name:node.name,type:node.type,declaration:path});
  if(node.kind==='binding')result.push({name:node.name,type:patterns.get(node),declaration:path});
  if(['for','forAwait'].includes(node.kind))result.push({name:node.binding,type:node.kind==='for'?'Number':controlTypeName(parseControlType(node.iterable.type,true,true,true).arguments[0]),declaration:path+'/binding'});
  if(node.kind==='try'&&node.handler)result.push({name:node.handler.binding,type:node.handler.type,declaration:path+'/handler/binding'});
 }
 return result;
}
/** Resolve a validated grant against declarations; legacy names must remain unambiguous. */
export function inspectionGrantBindings(fn,grant){
 const catalog=controlInspectionDeclarations(fn);
 const addressed=Object.hasOwn(grant,'declarations');
 return (addressed?grant.declarations:grant.names).map(key=>{
  const candidates=catalog.filter(item=>addressed?item.declaration===key:item.name===key);
  if(candidates.length!==1)fail('INVALID_INSPECTION_POLICY','Unknown or ambiguous inspected binding');return {...candidates[0],addressed};
 });
}
/** Legacy name catalog, retaining ambiguity information for existing host consumers. */
export function controlInspectionBindings(fn){
 const catalog=controlInspectionDeclarations(fn),names=new Set(catalog.map(item=>item.name));
 return [...names].map(name=>{const declarations=catalog.filter(item=>item.name===name);return {name,type:declarations[0].type,ambiguous:declarations.length!==1};});
}
