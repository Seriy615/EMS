import {FLOW_KERNEL,validateContractFlow} from './flow.mjs';
import {fail} from '../reference/errors.mjs';
const bindings=new WeakMap();
export const RECURSIVE_FLOW_CALL_PROFILE='ems-flow-recursive/1';
export const flowCompositeGraph=item=>bindings.get(item)??null;
export const flowBaseRegistry=registry=>registry.flowBaseRegistry??registry;

/** Whether adding one ordinary call closes a cycle between graph definitions. */
export function flowCallCreatesCycle(graphs,from,to){
 const definitions=new Map(graphs.map(graph=>[graph.id,graph])),seen=new Set();
 function visit(id){if(id===from)return true;if(seen.has(id))return false;seen.add(id);return definitions.get(id)?.nodes.some(node=>visit(node.uses))??false;}
 return definitions.has(to)&&visit(to);
}
export const recursiveFlowCalls=graphs=>graphs.some(graph=>graph.nodes.some(node=>flowCallCreatesCycle(graphs,graph.id,node.uses)));

/** Typed, inspectable definitions. Recursive policy is a bounded monotone fixed point. */
export function createFlowLibrary(graphs,registry,options={}){
 const base=flowBaseRegistry(registry),recursive=options.callProfile===RECURSIVE_FLOW_CALL_PROFILE;
 if(options.callProfile!==undefined&&!recursive)fail('FLOW_CALL_PROFILE','Unsupported flow call profile');
 if(!Array.isArray(graphs)||graphs.length>32)fail('FLOW_LIMIT','At most 32 flow contract definitions are supported');
 const definitions=new Map(),all=new Map(),policies=new Map(),dependencies=new Map();let count=0;
 function insert(graph,entry=false){
  if(!graph||typeof graph.id!=='string'||!Array.isArray(graph.nodes))fail('INVALID_FLOW','Invalid flow definition');
  if(all.has(graph.id)||base.items.has(graph.id)||Object.hasOwn(FLOW_KERNEL,graph.id))fail('DUPLICATE_CONTRACT','Flow definition conflicts with another contract',{contract:graph.id});
  try{base.resolve(graph.id);fail('DUPLICATE_CONTRACT','Flow definition shadows an available contract',{contract:graph.id});}catch(error){if(error.code!=='MISSING_CONTRACT')throw error;}
  count+=graph.nodes.length;if(count>1024)fail('FLOW_LIMIT','Flow library exceeds 1024 nodes');all.set(graph.id,graph);if(!entry)definitions.set(graph.id,graph);
 }
 for(const graph of graphs)insert(graph);
 if(recursive){if(!options.entryGraph)fail('INVALID_FLOW','Recursive calls require the entry graph');insert(options.entryGraph,true);}
 for(const [id,graph]of all){
  const effects=new Set(),capabilities=new Set(),calls=new Set();
  for(const node of graph.nodes){
   if(!node||typeof node.uses!=='string')fail('INVALID_FLOW','Invalid flow call');
   if(Object.hasOwn(FLOW_KERNEL,node.uses))continue;
   if(all.has(node.uses)){calls.add(node.uses);continue;}
   const target=base.resolve(node.uses);for(const name of target.effects)effects.add(name);for(const name of target.capabilities)capabilities.add(name);
  }
  policies.set(id,{effects,capabilities});dependencies.set(id,calls);
 }
 if(!recursive&&recursiveFlowCalls(graphs))fail('RECURSIVE_FLOW_CONTRACT','Recursive calls require ems-flow-project/3');
 // At most N-1 call edges connect distinct definitions; one extra round detects stability.
 for(let round=0;round<all.size;round++){
  let changed=false;
  for(const [id,calls]of dependencies)for(const dependency of calls)for(const field of ['effects','capabilities'])for(const name of policies.get(dependency)[field])if(!policies.get(id)[field].has(name)){policies.get(id)[field].add(name);changed=true;}
  if(!changed)break;
 }
 const items=new Map(base.items);
 for(const [id,graph]of all){const policy=policies.get(id),item=Object.freeze({id,version:graph.version,kind:'composite',inputs:graph.inputs,output:graph.output?.type,graph,effects:[...policy.effects].sort(),capabilities:[...policy.capabilities].sort()});bindings.set(item,graph);items.set(id,item);}
 const scoped={items,flowBaseRegistry:base,resolve(id){if(all.has(id))return items.get(id);const item=base.resolve(id);items.set(id,item);return item;}};
 const checks=new Map([...all].map(([id,graph])=>{try{return [id,validateContractFlow(graph,scoped,options)];}catch(error){error.details={...error.details,graph:id};throw error;}}));
 return {registry:scoped,definitions,checks};
}
