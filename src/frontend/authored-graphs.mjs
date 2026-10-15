import {parseEMSModule} from './index.mjs';
import {printControlProgram} from './print-control.mjs';
import {typecheckModule} from './check.mjs';
import {lowerCheckedModule} from './lower.mjs';
import {printGraphDeclaration} from './graphs.mjs';
import {validateControlIR} from '../ir/control.mjs';
import {controlFunctionIdentity} from '../ir/control-alpha.mjs';
import {validateContractFlow} from '../contracts/flow.mjs';
import {fail} from '../reference/errors.mjs';
/** Authoring witnesses are finite own data, never code-bearing host objects. */
export function assertAuthoredData(value,{maxRecordKeys=200}={}){
 if(!Number.isSafeInteger(maxRecordKeys)||maxRecordKeys<1||maxRecordKeys>2048)fail('AUTHORED_GRAPH_LIMIT','Invalid own-data record limit');
 const active=new Set();let count=0;
 function visit(value,depth){if(++count>200000||depth>256)fail('AUTHORED_GRAPH_LIMIT','Authored graph data exceeds structural limit');if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
  if(!value||typeof value!=='object'||active.has(value))fail('INVALID_AUTHORED_GRAPH','Expected finite own data');const array=Array.isArray(value),keys=Reflect.ownKeys(value);
  if(array&&(Object.getPrototypeOf(value)!==Array.prototype||value.length>20000||keys.length!==value.length+1)||!array&&(![Object.prototype,null].includes(Object.getPrototypeOf(value))||keys.length>maxRecordKeys))fail('INVALID_AUTHORED_GRAPH','Invalid graph data record');
  if(array)for(let i=0;i<value.length;i++)if(!Object.hasOwn(value,String(i)))fail('INVALID_AUTHORED_GRAPH','Graph arrays must be dense');
  active.add(value);for(const key of keys){if(array&&key==='length')continue;const descriptor=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)fail('INVALID_AUTHORED_GRAPH','Graph accessors and symbols are prohibited');visit(descriptor.value,depth+1);}active.delete(value);
 }
 visit(value,0);
}
/** Recompile each claimed graph in the actual function environment and compare all operations,
 * branches, versions, data references and requirements, modulo private lexical binder names.
 * No witness is trusted merely because it contains a hash or a copy of an IR function. */
export function verifyAuthoredProgramGraphs(program,graphs,registry,{allowState=false}={}){
 validateControlIR(program,registry);assertAuthoredData(graphs);if(!Array.isArray(graphs)||graphs.length>33||graphs.reduce((n,g)=>n+(g?.nodes?.length??0),0)>1024)fail('AUTHORED_GRAPH_LIMIT','Authored program exceeds33 graphs or1024 nodes');
 const functions=new Map(program.functions.map(fn=>[fn.id,fn])),seen=new Set(),sourceSignatures=new Map(program.functions.map(fn=>[fn.id,{inputs:Object.fromEntries(fn.inputs.map(port=>[port.name,port.type])),output:fn.output.type}]));
 const sort=ports=>[...ports].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
 for(const graph of graphs){if(!graph||typeof graph!=='object'||Array.isArray(graph))fail('INVALID_AUTHORED_GRAPH','Expected a graph record');if(seen.has(graph.id))fail('INVALID_AUTHORED_GRAPH','Duplicate authored function');seen.add(graph.id);const fn=functions.get(graph.id);if(!fn||JSON.stringify(sort(fn.inputs))!==JSON.stringify(sort(Object.entries(graph.inputs??{}).map(([name,spec])=>({name,type:spec.type}))))||fn.output.type!==graph.output?.type)fail('AUTHORED_GRAPH_SIGNATURE','Graph interface differs from the semantic function',{function:graph.id});validateContractFlow(graph,registry,{allowState,sourceSignatures});}
 if(!graphs.length)return new Map();
 const printed=printControlProgram(program,registry,{functionNames:new Map(program.functions.map(fn=>[fn.id,fn.id]))}),ast=parseEMSModule(printed.source,{maxSourceLength:8*1024*1024,maxTokens:1000000,maxDepth:1024}),declarations=new Map(ast.declarations.map(node=>[node.name,node]));
 for(const graph of graphs){const declaration=declarations.get(graph.id),body=parseEMSModule(printGraphDeclaration(graph)).declarations[0].body;declaration.body=body;}
 const checked=typecheckModule(ast,registry),result=new Map();
 for(const graph of graphs){const bundle=lowerCheckedModule(checked,graph.id,registry,{profile:'control'}),actual=bundle.ir.functions.find(fn=>fn.id===graph.id),expected=functions.get(graph.id);if(controlFunctionIdentity(actual)!==controlFunctionIdentity(expected))fail('AUTHORED_GRAPH_MISMATCH','Graph implementation differs from the semantic function',{function:graph.id});result.set(graph.id,structuredClone(graph));}
 return result;
}
