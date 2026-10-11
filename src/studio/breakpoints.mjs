import {fail} from '../reference/errors.mjs';
/** Exact source/provenance addresses; never infer an executable location from canvas positions. */
export function breakpointAtTextOffset(bundle,offset){
 if(!Number.isSafeInteger(offset)||offset<0)fail('INVALID_DEBUG_BREAKPOINT','Invalid source offset');
 const candidates=[];
 for(const [fn,map]of Object.entries(bundle.provenance.functions))for(const [node,location]of Object.entries(map.nodes??{})){
  if(location.start.offset<=offset&&offset<location.end.offset)candidates.push({fn,node,location});
 }
 candidates.sort((a,b)=>(a.location.end.offset-a.location.start.offset)-(b.location.end.offset-b.location.start.offset)||a.fn.localeCompare(b.fn)||a.node.localeCompare(b.node));
 const at=candidates[0];if(!at)fail('NO_DEBUG_LOCATION','Select an executable EMS operation');
 return bundle.ir.schemaVersion==='ems-ir/2'?{profile:'control',function:at.fn,node:at.node}:{profile:'graph',graph:at.fn,node:at.node};
}
/** Canvas, inputs and project names may change without changing operation identity. */
export function graphBreakpointIdentity(project){
 return JSON.stringify({graph:project.graph,contracts:project.contracts.map(item=>item.graph),collections:project.collections??[]});
}
