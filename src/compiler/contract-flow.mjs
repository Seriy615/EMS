import {emitFlowSource} from '../contracts/flow-source.mjs';
import {validateContractFlow,FLOW_KERNEL} from '../contracts/flow.mjs';
import {createFlowLibrary,flowBaseRegistry} from '../contracts/flow-library.mjs';
import {fail} from '../reference/errors.mjs';
import {parseEMSModule} from '../frontend/index.mjs';
import {typecheckModule} from '../frontend/check.mjs';
import {lowerCheckedModule} from '../frontend/lower.mjs';
import {executeIR,compileIRToJS} from '../ir/index.mjs';

/** Each flow composite becomes a real checked IR function with its own call frame. */
export function compileContractFlow(graph,registry,options={}){
 if(options.sourceSignatures!==undefined)fail('GRAPH_SOURCE_PROFILE','Source signatures require the common module frontend');
 const base=flowBaseRegistry(registry),contracts=options.contracts??[],library=createFlowLibrary(contracts,base,{...options,entryGraph:graph,complete:true});
 if(library.definitions.has(graph.id)||base.items.has(graph.id)||Object.hasOwn(FLOW_KERNEL,graph.id))fail('DUPLICATE_CONTRACT','Entry conflicts with a contract definition');
 let checked;try{checked=validateContractFlow(graph,library.registry,{...options,complete:true});}catch(error){error.details={...error.details,graph:graph.id};throw error;}const entry=options.entry??graph.id;
 if(entry!==graph.id&&!library.definitions.has(entry))fail('UNKNOWN_FLOW_CONTRACT','Unknown execution entry');
 const graphs=[graph,...[...library.definitions.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)];
 if(graphs.reduce((count,graph)=>count+graph.nodes.length,0)>1024)fail('FLOW_LIMIT','Flow module exceeds 1024 nodes');
 const sources=[],functions=Object.create(null);let offset=0;
 for(const current of graphs){const emitted=emitFlowSource(current,current===graph?checked:library.checks.get(current.id));functions[current.id]={activations:Object.fromEntries(Object.entries(emitted.activations).map(([id,line])=>[id,line+offset])),data:Object.fromEntries(Object.entries(emitted.data).map(([id,lines])=>[id,lines.map(line=>line+offset)]))};sources.push(emitted.source);offset+=emitted.source.split('\n').length;}
 const source=sources.join('\n'),bundle=lowerCheckedModule(typecheckModule(parseEMSModule(source,{maxTokens:100000,maxDepth:128}),base),entry,base,{profile:'control'});
 const selected=functions[entry];return {...bundle,source,flowMap:{schemaVersion:'ems-contract-flow-map/1',graph:entry,...selected,functions}};
}
export async function executeContractFlow(graph,registry,inputs={},options={}){const bundle=compileContractFlow(graph,registry,options);return executeIR(bundle.ir,inputs,bundle.registry,options);}
export function compileContractFlowJS(graph,registry,options={}){const bundle=compileContractFlow(graph,registry,options);return compileIRToJS(bundle.ir,bundle.registry);}
