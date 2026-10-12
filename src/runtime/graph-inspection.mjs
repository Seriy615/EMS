import {normalizeInspectionPolicy,copyFiniteInspectionValue} from './inspection.mjs';
import {validateGraph} from '../reference/validate.mjs';
import {analyzeGraphEffects} from '../semantics/effects.mjs';
import {parseControlType} from '../semantics/control-algebraic.mjs';
import {fail} from '../reference/errors.mjs';

/** Execution-local sharing across declared composite calls. Not a sandbox capability. */
export const GRAPH_INSPECTOR=Symbol('EMS graph inspector');
const pointer=name=>String(name).replaceAll('~','~0').replaceAll('/','~1');
/** Declared graph inputs and operation outputs; this catalog never computes a value. */
export function graphInspectionDeclarations(graph,registry){
 validateGraph(graph,registry);
 const inputs=Object.entries(graph.inputs).map(([name,port])=>({name,type:port.type,declaration:'/graph/inputs/'+pointer(name),kind:'input',key:name}));
 const nodes=graph.nodes.map(node=>{if(typeof node.id!=='string')fail('INVALID_INSPECTION_POLICY','Graph inspection needs string node IDs');return {name:node.id,type:registry.resolve(node.uses).output,declaration:'/graph/nodes/'+pointer(node.id),kind:'node',key:node.id};});
 return [...inputs,...nodes];
}

/** Explicit address grants observe inputs and already memoized outputs in the original evaluator. */
export function createGraphInspector(root,registry,value){
 const policy=normalizeInspectionPolicy(value);if(policy.originPolicy)fail('UNSUPPORTED_PROFILE','Origin classification requires control IR');const graphs=new Map(),catalogs=new Map(),grants=new Map();
 function visit(graph,stack=[]){
  if(stack.includes(graph.id)||stack.length>=32)fail('RECURSIVE_COMPOSITE','Recursive graph inspection closure');
  if(graphs.has(graph.id)){if(graphs.get(graph.id)!==graph)fail('INVALID_INSPECTION_POLICY','Ambiguous graph identity');return;}
  graphs.set(graph.id,graph);catalogs.set(graph.id,new Map(graphInspectionDeclarations(graph,registry).map(item=>[item.declaration,item])));
  for(const node of graph.nodes){const contract=registry.resolve(node.uses);if(contract.kind==='composite')visit(contract.graph,[...stack,graph.id]);}
 }
 visit(root);
 for(const id of policy.protectedFunctions)if(!graphs.has(id))fail('INVALID_INSPECTION_POLICY','Unknown protected graph');
 for(const grant of policy.allow){
  if(!Object.hasOwn(grant,'declarations')||!graphs.has(grant.function))fail('INVALID_INSPECTION_POLICY','Graph inspection requires known address grants');
  grants.set(grant.function,grant.declarations.map(path=>{const item=catalogs.get(grant.function).get(path);if(!item)fail('INVALID_INSPECTION_POLICY','Unknown graph declaration');return {...item};}));
 }
 const summary=analyzeGraphEffects(root,registry),protectedProgram=policy.protectedFunctions.length>0,impure=summary.effects.length>0||summary.capabilities.length>0;
 return (graph,inputs,memo)=>{
  if(graphs.get(graph.id)!==graph)fail('INVALID_INSPECTION_POLICY','Graph execution disagrees with inspection closure');
  const variables=[];let truncated=false;
  for(const binding of grants.get(graph.id)??[]){
   const identity={name:binding.name,declaration:binding.declaration};let record={...identity,type:null,status:protectedProgram?'protected-program':impure?'protected-effects':'not-evaluated'};
   if(!protectedProgram&&!impure&&(binding.kind==='input'||memo.has(binding.key))){
    record.type=binding.type;
    try{const descriptor=binding.kind==='input'?Object.getOwnPropertyDescriptor(inputs,binding.key):null;if(binding.kind==='input'&&(!descriptor||!Object.hasOwn(descriptor,'value')))throw 'unavailable';const value=binding.kind==='input'?descriptor.value:memo.get(binding.key);record={...identity,type:binding.type,status:'value',value:copyFiniteInspectionValue(value,parseControlType(binding.type),policy)};}
    catch(reason){record.status=['limit','unavailable'].includes(reason)?reason:'unavailable';}
   }
   const next={schemaVersion:'ems-inspection/2',variables:[...variables,record],truncated:false};
   if(new TextEncoder().encode(JSON.stringify(next)).length>policy.maxBytes){truncated=true;break;}variables.push(record);
  }
  return {schemaVersion:'ems-inspection/2',variables,truncated};
 };
}
