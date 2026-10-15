import {validateContractFlow} from '../contracts/flow.mjs';
import {parseEMSModule} from '../frontend/index.mjs';
import {typecheckModule} from '../frontend/check.mjs';
import {lowerCheckedModule} from '../frontend/lower.mjs';
import {executeIR,compileIRToJS} from '../ir/index.mjs';

const defaults={Number:'0',Boolean:'false',String:'""',NumberArray:'[]'};
const quote=value=>Object.is(value,-0)?'-0':Array.isArray(value)?'['+value.map(quote).join(',')+']':JSON.stringify(value);
const type=value=>value==='NumberArray'?'Number[]':value;

/** Lower explicit contract activations to the existing checked IR2 state machine. No second evaluator. */
export function compileContractFlow(graph,registry,options={}){
 const checked=validateContractFlow(graph,registry,{...options,complete:true}),nodes=[...checked.nodes.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),numbers=new Map(nodes.map((node,index)=>[node.id,index]));
 let prefix='__ems_flow_';while(Object.keys(graph.inputs).some(name=>name.startsWith(prefix)))prefix+='_';
 const activeNodes=nodes.filter(node=>checked.reachable.has(node.id)),liveCells=new Set(activeNodes.flatMap(node=>[node.id,...Object.values(node.args).filter(ref=>Object.hasOwn(ref,'node')).map(ref=>ref.node)]));
 const pc=prefix+'pc',values=new Map(activeNodes.filter(node=>checked.interfaces.get(node.id).output&&node.uses!=='std.storage.Variable').map(node=>[node.id,prefix+'value_'+numbers.get(node.id)])),cells=new Map(nodes.filter(node=>node.uses==='std.storage.Variable'&&liveCells.has(node.id)).map(node=>[node.id,prefix+'cell_'+numbers.get(node.id)])),lines=['@'+graph.id.replaceAll('.','::')+'('+Object.entries(graph.inputs).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,spec])=>name+':'+type(spec.type)).join(',')+')->'+type(graph.output.type)+' {'];
 for(const node of nodes)if(cells.has(node.id))lines.push('let mut '+cells.get(node.id)+':'+type(node.valueType)+' = '+quote(node.initial)+';');
 for(const [id,name]of values)lines.push('let mut '+name+':'+type(checked.interfaces.get(id).output)+' = '+defaults[checked.interfaces.get(id).output]+';');
 lines.push('let mut '+pc+' = '+numbers.get(graph.entry)+';','while true {');
 const activations={},dataLocations={};
 for(const node of activeNodes){
  lines.push('if '+pc+' == '+numbers.get(node.id)+' {','let '+prefix+'activation = '+numbers.get(node.id)+';');activations[node.id]=lines.length;
  function reference(ref){if(Object.hasOwn(ref,'input'))return ref.input;if(Object.hasOwn(ref,'literal'))return quote(ref.literal);return cells.get(ref.node)??values.get(ref.node);}
  const target=port=>numbers.get(checked.outgoing.get(node.id+':'+port));
  if(node.uses==='std.program.Result')lines.push('return '+reference(node.args.value)+';');
  else if(node.uses==='std.control.If'){const value=reference(node.args.condition),ports=['yes','no'];lines.push('if '+value+' { '+pc+' = '+target(ports[0])+'; } else { '+pc+' = '+target(ports[1])+'; }','continue;');}
  else{if(cells.has(node.id)){if(Object.hasOwn(node.args,'value'))lines.push(cells.get(node.id)+' = '+reference(node.args.value)+';');}else if(values.has(node.id)){lines.push(values.get(node.id)+' = '+node.uses.replaceAll('.','::')+'('+Object.keys(checked.interfaces.get(node.id).inputs).map(port=>reference(node.args[port])).join(',')+');');dataLocations[node.id]=[lines.length];}lines.push(pc+' = '+target(node.uses==='std.control.IterationEnd'?'repeat':'next')+';','continue;');}
  lines.push('}');
 }
 // All emitted activation states end in return/continue. This explicit fallback is unreachable for valid edges.
 lines.push('}','return '+({Number:'0',Boolean:'false',String:'""',NumberArray:'[]'})[graph.output.type]+';','}');
 const source=lines.join('\n'),bundle=lowerCheckedModule(typecheckModule(parseEMSModule(source,{maxTokens:100000,maxDepth:128}),registry),graph.id,registry,{profile:'control'});
 return {...bundle,source,flowMap:{schemaVersion:'ems-contract-flow-map/1',graph:graph.id,activations,data:dataLocations}};
}
export async function executeContractFlow(graph,registry,inputs={},options={}){const bundle=compileContractFlow(graph,registry);return executeIR(bundle.ir,inputs,bundle.registry,options);}
export function compileContractFlowJS(graph,registry){const bundle=compileContractFlow(graph,registry);return compileIRToJS(bundle.ir,bundle.registry);}
