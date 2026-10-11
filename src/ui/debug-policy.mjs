import {fail} from '../reference/errors.mjs';
import {validateBreakpoints} from '../studio/debugger.mjs';
const fields=(object,keys)=>object&&typeof object==='object'&&!Array.isArray(object)&&Reflect.ownKeys(object).length===keys.length&&keys.every(key=>Object.hasOwn(object,key));
/** Exact source witnesses are transferred once per handler, outside IR and pause payloads. */
export function normalizeUIDebugOptions(options={start:'step',breakpoints:[],sources:{}}){
 if(!fields(options,['start','breakpoints','sources'])||!['step','continue'].includes(options.start)||!Array.isArray(options.breakpoints)||options.breakpoints.length>64||!options.sources||typeof options.sources!=='object'||Array.isArray(options.sources)||![Object.prototype,null].includes(Object.getPrototypeOf(options.sources))||Reflect.ownKeys(options.sources).length!==Object.keys(options.sources).length)fail('INVALID_DEBUG_OPTION','Invalid bounded UI debug policy');
 const points=[],seen=new Set(),handlers=new Set();
 for(const item of options.breakpoints){
  if(!fields(item,['handler','point'])||typeof item.handler!=='string'||!item.handler||item.handler.length>1024)fail('INVALID_DEBUG_BREAKPOINT','Invalid handler breakpoint');
  const point=validateBreakpoints([item.point])[0],key=JSON.stringify([item.handler,point]);handlers.add(item.handler);if(!seen.has(key)){seen.add(key);points.push({handler:item.handler,point});}
 }
 if(Object.keys(options.sources).length!==handlers.size)fail('INVALID_DEBUG_BREAKPOINT','Expected source witnesses for referenced handlers only');
 const sources=Object.create(null);let bytes=0;
 for(const handler of handlers){
  const draft=Object.hasOwn(options.sources,handler)?options.sources[handler]:null;
  if(!fields(draft,['source','entry'])||typeof draft.source!=='string'||draft.source.length>262144||typeof draft.entry!=='string'||!draft.entry||draft.entry.length>1024)fail('INVALID_DEBUG_BREAKPOINT','Invalid breakpoint source witness');
  const size=new TextEncoder().encode(draft.source).length;if(size>262144||(bytes+=size)>1048576)fail('INVALID_DEBUG_BREAKPOINT','Breakpoint witnesses exceed source budget');
  sources[handler]={source:draft.source,entry:draft.entry};
 }
 return {start:options.start,breakpoints:points,sources};
}
export function checkUIDebugOptions(options,workspace,bundles){
 const checked=normalizeUIDebugOptions(options);
 for(const item of checked.breakpoints){
  const expected=workspace.sources[item.handler],witness=checked.sources[item.handler],bundle=bundles.get(item.handler),fn=item.point.function??item.point.graph;
  if(!expected||expected.source!==witness.source||expected.entry!==witness.entry)fail('STALE_DEBUG_SOURCE','Breakpoint source does not match the running handler');
  if(!bundle||item.point.profile!==(bundle.ir.schemaVersion==='ems-ir/2'?'control':'graph')||!Object.hasOwn(bundle.provenance.functions,fn)||!Object.hasOwn(bundle.provenance.functions[fn].nodes??{},item.point.node))fail('INVALID_DEBUG_BREAKPOINT','Breakpoint has no checked executable source address');
 }
 return checked;
}
export function handlerBreakpoints(options,handler){return options.breakpoints.filter(item=>item.handler===handler).map(item=>item.point);}
