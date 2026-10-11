import {fail} from '../reference/errors.mjs';
import {validateBreakpoints} from './debugger.mjs';
import {validateSourceBreakpointAnchor,resolveSourceBreakpoint} from './source-anchors.mjs';
import {graphBreakpointIdentity} from './breakpoints.mjs';

const limit=1048576;
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
function fields(value,keys){if(!plain(value)||Reflect.ownKeys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('INVALID_DEBUG_STORAGE','Unexpected debugger metadata fields');}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/** Library identity excludes canvas positions, project names and runtime inputs. No callbacks are invoked. */
export function studioDebuggerContext(editor,draft=null){
 const bindings=[...editor.registry.items.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(item=>({id:item.id,version:item.version,kind:item.kind,inputs:item.inputs,output:item.output,effects:item.effects,capabilities:item.capabilities,interfaceBoundary:item.interfaceBoundary}));
 const library=JSON.stringify({program:graphBreakpointIdentity(editor.project),bindings});
 return draft?{mode:'text',entry:draft.entry,lowering:draft.lowering,library}:{mode:'graph',library};
}
function checkedContext(value){
 fields(value,value?.mode==='graph'?['mode','library']:['mode','entry','lowering','library']);
 if(!['graph','text'].includes(value.mode)||typeof value.library!=='string'||!value.library.length||value.library.length>limit||value.mode==='text'&&(typeof value.entry!=='string'||value.entry.length>1024||!['auto','call'].includes(value.lowering)))fail('INVALID_DEBUG_STORAGE','Invalid debugger context');
 return value.mode==='graph'?{mode:'graph',library:value.library}:{mode:'text',entry:value.entry,lowering:value.lowering,library:value.library};
}
function checkedRecords(records){
 if(!Array.isArray(records)||records.length>64)fail('INVALID_DEBUG_STORAGE','Expected at most 64 saved debugger points');
 const seen=new Set();let bytes=0;
 return records.map(record=>{
  fields(record,['context','point','anchor']);const context=checkedContext(record.context),point=validateBreakpoints([record.point])[0];
  const anchor=context.mode==='text'?validateSourceBreakpointAnchor(record.anchor):null;
  if(context.mode==='graph'&&(record.anchor!==null||point.profile!=='graph')||anchor&&!equal(point,anchor.point))fail('INVALID_DEBUG_STORAGE','Point disagrees with saved anchor/profile');
  const copy={context,point,anchor},key=JSON.stringify(copy);bytes+=new TextEncoder().encode(key).length;if(bytes>limit)fail('DEBUG_ANCHOR_LIMIT','Debugger records exceed 1 MiB');if(seen.has(key))fail('INVALID_DEBUG_STORAGE','Duplicate debugger record');seen.add(key);return copy;
 });
}

/** Separate project-owned editor sidecar. Writes validate before touching storage or the active policy. */
export class StudioDebuggerStorage{
 constructor(storage,project){
  if(typeof project!=='string'||!/^[_A-Za-z][_A-Za-z0-9]*$/.test(project)||project.length>1024)fail('INVALID_DEBUG_STORAGE','Invalid debugger project owner');
  this.storage=storage;this.project=project;this.key='ems.studio.debugger.v1:'+project;
 }
 check(source){
  if(typeof source!=='string'||source.length>limit||new TextEncoder().encode(source).length>limit)fail('DEBUG_ANCHOR_LIMIT','Debugger document exceeds 1 MiB');
  let data;try{data=JSON.parse(source);}catch{fail('INVALID_DEBUG_STORAGE','Malformed debugger document');}
  fields(data,['schemaVersion','project','records']);if(data.schemaVersion!=='ems-studio-debugger/1'||data.project!==this.project)fail('INVALID_DEBUG_STORAGE','Debugger version/owner mismatch');
  return checkedRecords(data.records);
 }
 load(){const source=this.storage.getItem(this.key);return source===null?[]:this.check(source);}
 save(records){const checked=checkedRecords(records),source=JSON.stringify({schemaVersion:'ems-studio-debugger/1',project:this.project,records:checked});this.check(source);this.storage.setItem(this.key,source);}
}

/** Only current, freshly checked points reach an execution worker. Inactive records remain available for Undo. */
export function resolveStudioDebugger(records,context,{bundle=null,project}={}){
 context=checkedContext(context);
 const selected=checkedRecords(records).filter(record=>record.context.mode===context.mode&&(context.mode==='graph'||record.context.entry===context.entry&&record.context.lowering===context.lowering));
 return selected.map(record=>{
  if(record.context.library!==context.library)return {record,point:null,reason:'library-changed'};
  if(context.mode==='text')return {record,...(bundle?resolveSourceBreakpoint(bundle,record.anchor):{point:null,reason:'invalid-draft'})};
  const graph=project?.graph.id===record.point.graph?project.graph:project?.contracts.find(item=>item.graph.id===record.point.graph)?.graph;
  const exists=graph?.nodes.some(node=>node.id===record.point.node);
  return {record,point:exists?structuredClone(record.point):null,reason:exists?null:'changed-or-missing'};
 });
}
