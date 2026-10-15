import {assertStateType,assertStateValue} from '../runtime/state-values.mjs';
import {formatFiniteJSON} from '../semantics/data-json.mjs';
import {signatureIR} from '../ir/index.mjs';
import {validateUISources} from './source.mjs';
import {fail} from '../reference/errors.mjs';
import {typeOfValue,assertValueType,assertTypeName} from '../reference/types.mjs';
import {createStateRegistry} from '../runtime/reactor.mjs';
import {serializeIR,parseIR} from '../ir/index.mjs';
import {linkUIApplication} from './model.mjs';

const limit=1048576,compare=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
function fields(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Reflect.ownKeys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('INVALID_UI_PROJECT','Unexpected UI project fields');}
const encodeNumber=value=>Object.is(value,-0)?'-0':value;
function typed(value,decode=false,expected=null,rich=false){
 const version=rich?'ems-reactor/2':'ems-reactor/1';
 if(!decode){const type=expected??typeOfValue(value);assertStateValue(value,type,'UI project value',version);return {type,value:type==='Number'?encodeNumber(value):type==='NumberArray'?value.map(encodeNumber):structuredClone(value)};}
 fields(value,['type','value']);const from=value=>value==='-0'?-0:value,type=value.type,raw=value.value;
 if(expected!==null&&type!==expected)fail('UI_BINDING_TYPE','Saved value type disagrees with its declared type');
 assertStateType(type,version,'UI project value');
 const result=type==='Number'?from(raw):type==='NumberArray'&&Array.isArray(raw)?raw.map(from):raw;
 assertStateValue(result,type,'UI project value',version);return result;
}
function transform(application,decode=false,registry=null){
 const rich=application.schemaVersion==='ems-ui-app/2';
 fields(application,['schemaVersion','id','version','reactor','ui']);
 fields(application.reactor,['schemaVersion','id','version','state','handlers']);
 fields(application.ui,['schemaVersion','root']);
 if(!Array.isArray(application.reactor.state)||application.reactor.state.length>100||!Array.isArray(application.reactor.handlers)||application.reactor.handlers.length>100)fail('UI_LIMIT','UI state/handler transport limit');
 let count=0;
 const signatures=decode?null:new Map(application.reactor.handlers.map(handler=>[handler.event,signatureIR(handler.program,registry)]));
 function ref(value,hint=null){if(!value||typeof value!=='object'||Array.isArray(value))fail('INVALID_UI_PROJECT','Expected binding');if(Object.hasOwn(value,'literal')){fields(value,['literal']);return {literal:typed(value.literal,decode,hint,rich)};}return structuredClone(value);}
 function node(value,depth){
  if(++count>1000||depth>32)fail('UI_LIMIT','UI transport tree size/depth limit');fields(value,['id','kind','props','events','children']);
  for(const name of ['props','events'])if(!value[name]||typeof value[name]!=='object'||Array.isArray(value[name]))fail('INVALID_UI_PROJECT','Invalid UI node record');
  if(!Array.isArray(value.children))fail('INVALID_UI_PROJECT','Invalid UI children');
  const props=Object.fromEntries(Object.keys(value.props).sort().map(key=>[key,ref(value.props[key])]));
  const events=Object.fromEntries(Object.keys(value.events).sort().map(key=>{const event=value.events[key];fields(event,['handler','inputs']);if(!event.inputs||typeof event.inputs!=='object'||Array.isArray(event.inputs))fail('INVALID_UI_PROJECT','Invalid event inputs');return [key,{handler:event.handler,inputs:Object.fromEntries(Object.keys(event.inputs).sort().map(name=>[name,ref(event.inputs[name],signatures?.get(event.handler)?.inputs[name]?.type??null)]))}];}));
  return {id:value.id,kind:value.kind,props,events,children:value.children.map(child=>node(child,depth+1))};
 }
 const state=application.reactor.state.map(slot=>{fields(slot,['id','type','initial']);const initial=typed(slot.initial,decode,slot.type,rich);if(decode&&slot.initial.type!==slot.type)fail('UI_BINDING_TYPE','Saved state type disagrees with initial value');assertStateValue(decode?initial:slot.initial,slot.type,'UI state initial',application.reactor.schemaVersion);return {id:slot.id,type:slot.type,initial};});
 return {schemaVersion:application.schemaVersion,id:application.id,version:application.version,reactor:{schemaVersion:application.reactor.schemaVersion,id:application.reactor.id,version:application.reactor.version,state,handlers:structuredClone(application.reactor.handlers)},ui:{schemaVersion:application.ui.schemaVersion,root:node(application.ui.root,0)}};
}
function references(application,registry){
 const roots=new Set(),pins=new Map(),active=new Set();
 function scan(value){if(!value||typeof value!=='object')return;if(value.kind==='contract'&&typeof value.id==='string')roots.add(value.id);if(value.contract?.id)roots.add(value.contract.id);if(value.interfaceRef?.id)roots.add(value.interfaceRef.id);for(const child of Object.values(value))if(Array.isArray(child))child.forEach(scan);else scan(child);}
 for(const handler of application.reactor.handlers)scan(JSON.parse(serializeIR(handler.program,registry)));
 function visit(id){
  if(pins.has(id))return;if(active.has(id)||active.size>=256)fail('DEPENDENCY_CYCLE','UI contract dependency cycle/depth');if(pins.size+active.size>=10000)fail('UI_LIMIT','Too many UI contract references');active.add(id);const item=registry.resolve(id);
  if(item.kind==='composite')for(const node of item.graph.nodes)visit(node.uses);
  for(const boundary of [...(item.interfaceBoundary?[item.interfaceBoundary]:[]),...(item.resourceBoundaries??[])]){const selected=registry.resolve(boundary.binding.implementation.id);if(selected.version!==boundary.binding.implementation.version)fail('CONTRACT_VERSION','UI implementation version mismatch');visit(selected.id);}
  active.delete(id);pins.set(id,{id,version:item.version});
 }
 for(const id of roots)visit(id);return [...pins.values()].sort(compare);
}
/** Canonical typed UI transport. Exact version pins are not byte provenance or a security signature. */
export function serializeUIProject(application,baseRegistry,{sources={}}={}){
 const linked=linkUIApplication(application,baseRegistry),encoded=transform(linked.application,false,linked.registry);
 encoded.reactor.handlers=linked.application.reactor.handlers.map(handler=>({event:handler.event,program:JSON.parse(serializeIR(handler.program,linked.registry))}));
 const checkedSources=validateUISources(linked.application,baseRegistry,sources),hasSources=Object.keys(checkedSources).length>0;
 const rich=application.schemaVersion==='ems-ui-app/2',record={schemaVersion:rich?'ems-ui-project/4':hasSources?(Object.values(checkedSources).some(draft=>Object.hasOwn(draft,'flow'))?'ems-ui-project/3':'ems-ui-project/2'):'ems-ui-project/1',application:encoded,references:references(linked.application,linked.registry),...(hasSources||rich?{sources:checkedSources}:{})};
 const source=(rich?formatFiniteJSON(record):JSON.stringify(record,null,2))+'\n';
 if((source.length>limit||new TextEncoder().encode(source).length>limit))fail('UI_LIMIT','UI project exceeds 1 MiB UTF-8 bytes');return source;
}
/** Decode typed signed values, validate the whole linked application and exact transitive version closure. */
export function parseUIProject(source,baseRegistry){
 if(typeof source!=='string'||(source.length>limit||new TextEncoder().encode(source).length>limit))fail('UI_LIMIT','UI project source must be bounded text');let data;try{data=JSON.parse(source);}catch{fail('INVALID_UI_PROJECT','Malformed UI project JSON');}
 fields(data,['schemaVersion','application','references',...(['ems-ui-project/2','ems-ui-project/3','ems-ui-project/4'].includes(data.schemaVersion)?['sources']:[])]);if(!['ems-ui-project/1','ems-ui-project/2','ems-ui-project/3','ems-ui-project/4'].includes(data.schemaVersion))fail('UI_VERSION','Unsupported UI project version');
 if((data.schemaVersion==='ems-ui-project/4')!==(data.application?.schemaVersion==='ems-ui-app/2'))fail('UI_VERSION','Rich UI values require project v4');
 const application=transform(data.application,true),registry=createStateRegistry(baseRegistry,application.reactor.state,application.reactor.schemaVersion);
 application.reactor.handlers=application.reactor.handlers.map(handler=>{fields(handler,['event','program']);return {event:handler.event,program:parseIR(JSON.stringify(handler.program),registry)};});
 const linked=linkUIApplication(application,baseRegistry);
 if(!Array.isArray(data.references)||data.references.length>10000)fail('CONTRACT_VERSION','Invalid UI project references');
 const saved=data.references.map(pin=>{fields(pin,['id','version']);if(typeof pin.id!=='string'||typeof pin.version!=='string')fail('CONTRACT_VERSION','Invalid UI reference');return {id:pin.id,version:pin.version};}).sort(compare);
 if(JSON.stringify(saved)!==JSON.stringify(references(application,linked.registry)))fail('CONTRACT_VERSION','UI project references disagree with current contract closure');
 if(data.schemaVersion==='ems-ui-project/4')validateUISources(application,baseRegistry,data.sources);
 if(['ems-ui-project/2','ems-ui-project/3'].includes(data.schemaVersion)){if(!Object.keys(data.sources??{}).length)fail('INVALID_UI_PROJECT','Empty v2 authoring sources');validateUISources(application,baseRegistry,data.sources);const hasFlow=Object.values(data.sources).some(draft=>Object.hasOwn(draft,'flow'));if(hasFlow!==(data.schemaVersion==='ems-ui-project/3'))fail('UI_VERSION','Flow witnesses require UI project v3');}
 return application;
}

/** Preserve validated authored source separately from the runtime application shape. */
export function parseUIWorkspace(source,baseRegistry){const application=parseUIProject(source,baseRegistry),sources=JSON.parse(source).sources??{};return {application,sources};}
