import {analyzeControlOrigins} from './control-origins.mjs';
import {fail} from '../reference/errors.mjs';

function fields(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key))||Reflect.ownKeys(value).some(key=>!keys.includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')))fail('INVALID_ORIGIN_POLICY','Expected closed origin policy data');
}
function sourceArray(value){
 if(!Array.isArray(value))fail('INVALID_ORIGIN_POLICY','Expected source list');
 const size=Object.getOwnPropertyDescriptor(value,'length')?.value;
 if(!Number.isSafeInteger(size)||size>2048||Reflect.ownKeys(value).length!==size+1)fail('INVALID_ORIGIN_POLICY','Invalid source list');
 return Array.from({length:size},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!Object.hasOwn(d,'value'))fail('INVALID_ORIGIN_POLICY','Expected own source records');return d.value;});
}
const sourceKey=source=>JSON.stringify([source.kind,source.function,source.path]);

/** Copy closed host annotations. Only actual input/literal roots can be annotated. */
export function normalizeOriginPolicy(value){
 fields(value,['schemaVersion','sources']);
 if(value.schemaVersion!=='ems-origin-policy/1')fail('INVALID_ORIGIN_POLICY','Unsupported origin policy version');
 const seen=new Set(),sources=sourceArray(value.sources).map(source=>{
  fields(source,['kind','function','path','classification']);
  if(!['input','literal'].includes(source.kind)||!['public','private'].includes(source.classification)||typeof source.function!=='string'||!source.function.length||source.function.length>1024||typeof source.path!=='string'||!source.path.startsWith('/')||source.path.length>1024)fail('INVALID_ORIGIN_POLICY','Invalid source annotation');
  const key=sourceKey(source);if(seen.has(key))fail('INVALID_ORIGIN_POLICY','Duplicate source annotation');seen.add(key);
  return {kind:source.kind,function:source.function,path:source.path,classification:source.classification};
 });
 return {schemaVersion:value.schemaVersion,sources};
}

/** Public < private < unknown. This advisory classification can only restrict diagnostics. */
export function classifyControlOrigins(ir,registry,value){
 const policy=normalizeOriginPolicy(value),analysis=analyzeControlOrigins(ir,registry),roots=new Set();
 for(const node of analysis.nodes)if(['input','literal','pattern-literal'].includes(node.kind))roots.add(sourceKey({kind:node.kind==='input'?'input':'literal',function:node.function,path:node.path}));
 for(const source of policy.sources)if(!roots.has(sourceKey(source)))fail('INVALID_ORIGIN_POLICY','Annotation must address an existing semantic source');
 const labels=new Map(policy.sources.map(source=>[sourceKey(source),source.classification]));
 const nodes=analysis.nodes.map(node=>{
  const reasons=node.origins.map(origin=>{
   const classification=['input','literal'].includes(origin.kind)?labels.get(sourceKey(origin))??'unknown':'unknown';
   return {origin,classification,reason:classification==='unknown'?(['input','literal'].includes(origin.kind)?'unclassified-source':'unresolved-boundary'):'host-annotation'};
  });
  const classification=!reasons.length||reasons.some(r=>r.classification==='unknown')?'unknown':reasons.some(r=>r.classification==='private')?'private':'public';
  return {id:node.id,function:node.function,path:node.path,kind:node.kind,type:node.type,...(node.name?{name:node.name}:{}),classification,reasons};
 });
 const result={schemaVersion:'ems-origin-classification/1',entry:analysis.entry,securityDecision:false,policy,nodes};
 if(new TextEncoder().encode(JSON.stringify(result)).length>2097152)fail('ANALYSIS_LIMIT','Classification artifact byte budget exceeded');return result;
}
