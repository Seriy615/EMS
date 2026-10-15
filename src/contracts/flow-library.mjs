import {FLOW_KERNEL,validateContractFlow} from './flow.mjs';
import {fail} from '../reference/errors.mjs';
const bindings=new WeakMap();
export const flowCompositeGraph=item=>bindings.get(item)??null;
export const flowBaseRegistry=registry=>registry.flowBaseRegistry??registry;

/** Typed, inspectable flow definitions. These are not host executors or registry atoms. */
export function createFlowLibrary(graphs,registry,options={}){
 const base=flowBaseRegistry(registry);
 if(!Array.isArray(graphs)||graphs.length>32)fail('FLOW_LIMIT','At most 32 flow contract definitions are supported');
 const definitions=new Map(),policies=new Map(),visiting=new Set();let count=0;
 for(const graph of graphs){
  if(!graph||typeof graph.id!=='string'||!Array.isArray(graph.nodes))fail('INVALID_FLOW','Invalid flow definition');
  if(definitions.has(graph.id)||base.items.has(graph.id)||Object.hasOwn(FLOW_KERNEL,graph.id))fail('DUPLICATE_CONTRACT','Flow definition conflicts with another contract',{contract:graph.id});
  try{base.resolve(graph.id);fail('DUPLICATE_CONTRACT','Flow definition shadows an available contract',{contract:graph.id});}catch(error){if(error.code!=='MISSING_CONTRACT')throw error;}
  count+=graph.nodes.length;if(count>1024)fail('FLOW_LIMIT','Flow library exceeds 1024 nodes');definitions.set(graph.id,graph);
 }
 function policy(id){
  if(policies.has(id))return policies.get(id);
  if(visiting.has(id))fail('RECURSIVE_FLOW_CONTRACT','Recursive flow definitions require a separate call profile',{contract:id});
  if(visiting.size>=32)fail('FLOW_LIMIT','Flow contract dependency depth exceeds 32');visiting.add(id);
  const effects=new Set(),capabilities=new Set();
  for(const node of definitions.get(id).nodes){
   if(!node||typeof node.uses!=='string')fail('INVALID_FLOW','Invalid flow call');
   if(Object.hasOwn(FLOW_KERNEL,node.uses))continue;
   const target=definitions.has(node.uses)?policy(node.uses):base.resolve(node.uses);
   for(const name of target.effects)effects.add(name);for(const name of target.capabilities)capabilities.add(name);
  }
  visiting.delete(id);const result={effects:[...effects].sort(),capabilities:[...capabilities].sort()};policies.set(id,result);return result;
 }
 const items=new Map(base.items);
 for(const graph of graphs){const item=Object.freeze({id:graph.id,version:graph.version,kind:'composite',inputs:graph.inputs,output:graph.output?.type,graph,...policy(graph.id)});bindings.set(item,graph);items.set(graph.id,item);}
 const scoped={items,flowBaseRegistry:base,resolve(id){if(definitions.has(id))return items.get(id);const item=base.resolve(id);items.set(id,item);return item;}};
 const checks=new Map(graphs.map(graph=>{try{return [graph.id,validateContractFlow(graph,scoped,options)];}catch(error){error.details={...error.details,graph:graph.id};throw error;}}));
 return {registry:scoped,definitions,checks};
}
