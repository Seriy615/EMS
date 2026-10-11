import {fail} from '../reference/errors.mjs';
import {validateBreakpoints} from './debugger.mjs';
import {graphFromIR} from '../ir/index.mjs';

const blocks=new Set(['body','then','otherwise','finalizer']);
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const omit=(value,keys)=>Object.fromEntries(Object.entries(value).filter(([key])=>!keys.has(key)));
function records(){
 const result=[];let bytes=0;
 result.add=(point,value)=>{const identity=canonical(value),size=new TextEncoder().encode(identity).length;bytes+=size;if(size>1048576||bytes>8388608||result.length>=20000)fail('DEBUG_ANCHOR_LIMIT','Source anchor index exceeds its budget');result.push({point,identity});};
 return result;
}

/** Identity is typed syntax plus lexical/control context, never line number or nearest-node distance. */
function controlIdentities(bundle){
 const result=records();
 for(const fn of bundle.ir.functions){
  const signature=omit(fn,new Set(['body'])),locations=bundle.provenance.functions[fn.id]?.nodes??{};
  function walk(value,path,context,edge){
   if(!value||typeof value!=='object')return;
   if(!Array.isArray(value)&&locations[path])result.add({profile:'control',function:fn.id,node:path},{signature,context,operation:value});
   if(Array.isArray(value)){
    value.forEach((child,index)=>{
     const scope=blocks.has(edge)?{block:edge,bindings:value.slice(0,index).filter(item=>['let','using'].includes(item?.kind))}:edge==='arms'?{arms:true}:{element:index};
     walk(child,path+'/'+index,[...context,scope],null);
    });
   }else for(const [key,child] of Object.entries(value)){
    if(!child||typeof child!=='object')continue;
    const header=omit(value,new Set([...blocks,'arms',key]));
    walk(child,path+'/'+key,[...context,{edge:key,header}],key);
   }
  }
  walk(fn.body,'/body',[],'body');
 }
 return result;
}

function graphIdentities(bundle){
 const result=records(),entry=graphFromIR(bundle.ir,bundle.registry);
 for(const [id,provenance]of Object.entries(bundle.provenance.functions)){
  const graph=id===entry.id?entry:bundle.registry.resolve(id).graph;
  if(!graph)continue;
  const nodes=new Map(graph.nodes.map(node=>[node.id,node])),cache=new Map();
  function operation(id){
   if(cache.has(id))return cache.get(id);
   const node=nodes.get(id);if(!node)fail('INVALID_DEBUG_ANCHOR','Missing graph dependency');
   const contract=bundle.registry.resolve(node.uses);
   const value={uses:node.uses,version:contract.version,inputs:contract.inputs,output:contract.output,effects:contract.effects,capabilities:contract.capabilities,args:Object.fromEntries(Object.entries(node.args).map(([port,ref])=>[port,ref.node?{dependency:operation(ref.node)}:ref]))};
   cache.set(id,value);return value;
  }
  const signature=omit(graph,new Set(['nodes','returns','sequence']));
  for(const node of graph.nodes)if(provenance.nodes?.[node.id]){
   const context=graph.sequence?graph.sequence.slice(0,graph.sequence.indexOf(node.id)).map(operation):[];
   result.add({profile:'graph',graph:id,node:node.id},{signature,context,operation:operation(node.id)});
  }
 }
 return result;
}
const identities=bundle=>bundle.ir.schemaVersion==='ems-ir/2'?controlIdentities(bundle):graphIdentities(bundle);
const same=(a,b)=>canonical(a)===canonical(b);

/** Serializable editor sidecar. Duplicate identities are deliberately unresolved even at the old address. */
export function captureSourceBreakpoint(bundle,point){
 point=validateBreakpoints([point])[0];
 const records=identities(bundle),record=records.find(item=>same(item.point,point));
 if(!record)fail('INVALID_DEBUG_ANCHOR','Operation has no checked source provenance');
 if(records.filter(item=>item.identity===record.identity).length!==1)fail('AMBIGUOUS_DEBUG_ANCHOR','Operation identity is not unique in this source');
 if(record.identity.length>1048576)fail('DEBUG_ANCHOR_LIMIT','Source anchor exceeds 1 MiB');
 return {schemaVersion:'ems-source-breakpoint/1',point,identity:record.identity};
}

export function resolveSourceBreakpoint(bundle,anchor){
 const original=validateSourceBreakpointAnchor(anchor).point,records=identities(bundle);
 const owner=original.function??original.graph;
 const candidates=records.filter(item=>item.point.profile===original.profile&&(item.point.function??item.point.graph)===owner&&item.identity===anchor.identity);
 if(candidates.length!==1)return {point:null,reason:candidates.length?'ambiguous':'changed-or-missing'};
 return {point:structuredClone(candidates[0].point),reason:null};
}

export function validateSourceBreakpointAnchor(anchor){
 if(!anchor||typeof anchor!=='object'||Array.isArray(anchor)||![Object.prototype,null].includes(Object.getPrototypeOf(anchor))||Reflect.ownKeys(anchor).length!==3||['schemaVersion','identity','point'].some(key=>!Object.hasOwn(anchor,key))||anchor.schemaVersion!=='ems-source-breakpoint/1'||typeof anchor.identity!=='string'||!anchor.identity.length||anchor.identity.length>1048576)fail('INVALID_DEBUG_ANCHOR','Invalid source breakpoint anchor');
 if(new TextEncoder().encode(anchor.identity).length>1048576)fail('INVALID_DEBUG_ANCHOR','Source anchor exceeds its UTF-8 budget');
 return {schemaVersion:anchor.schemaVersion,point:validateBreakpoints([anchor.point])[0],identity:anchor.identity};
}

/** Separate local editor metadata: never part of a portable program, UI package or worker message. */
export class UISourceBreakpointStorage{
 constructor(storage,key){this.storage=storage;this.key='ems.ui-source-breakpoints.v1:'+key;}
 load(){const text=this.storage.getItem(this.key);if(text===null)return [];return this.check(text);}
 check(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>1048576)fail('DEBUG_ANCHOR_LIMIT','Stored anchors exceed 1 MiB');
  let data;try{data=JSON.parse(text);}catch{fail('INVALID_DEBUG_ANCHOR','Invalid stored anchors');}
  if(!data||typeof data!=='object'||Array.isArray(data)||Reflect.ownKeys(data).length!==2||data.schemaVersion!=='ems-ui-source-breakpoints/1'||!Array.isArray(data.anchors)||data.anchors.length>64)fail('INVALID_DEBUG_ANCHOR','Invalid stored anchor list');
  return data.anchors.map(item=>{
   if(!item||typeof item!=='object'||Array.isArray(item)||Reflect.ownKeys(item).length!==2||typeof item.handler!=='string'||!item.handler.length||item.handler.length>1024)fail('INVALID_DEBUG_ANCHOR','Invalid handler anchor');
   return {handler:item.handler,anchor:validateSourceBreakpointAnchor(item.anchor)};
  });
 }
 save(anchors){const text=JSON.stringify({schemaVersion:'ems-ui-source-breakpoints/1',anchors:anchors.map(({handler,anchor})=>({handler,anchor}))});this.check(text);this.storage.setItem(this.key,text);}
}
