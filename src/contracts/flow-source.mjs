import {defaultFlowValue,flowValueSource} from './flow-values.mjs';

const type=value=>value==='NumberArray'?'Number[]':value;

/** Lower explicit contract activations to the existing checked IR2 state machine. No second evaluator. */
export function emitFlowSource(graph,checked,{preserveInputOrder=false,symbol=name=>name}={}){
 const callable=id=>{const parts=id.split('.').map(symbol);if(parts[0].startsWith('"'))parts[0]='#'+parts[0];return parts.join('::');};
 const nodes=[...checked.nodes.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),numbers=new Map(nodes.map((node,index)=>[node.id,index]));
 let prefix='__ems_flow_';while(Object.keys(graph.inputs).some(name=>name.startsWith(prefix)))prefix+='_';
 const activeNodes=nodes.filter(node=>checked.reachable.has(node.id)),liveCells=new Set(activeNodes.flatMap(node=>[node.id,...Object.values(node.args).filter(ref=>Object.hasOwn(ref,'node')).map(ref=>ref.node)]));
 const liveOwners=new Set([...liveCells].map(id=>checked.storageOwners.get(id)).filter(Boolean));
 const pc=prefix+'pc',values=new Map(activeNodes.filter(node=>checked.interfaces.get(node.id).output&&node.uses!=='std.storage.Variable').map(node=>[node.id,prefix+'value_'+numbers.get(node.id)])),cells=new Map(nodes.filter(node=>node.uses==='std.storage.Variable'&&liveOwners.has(checked.storageOwners.get(node.id))).map(node=>[node.id,prefix+'cell_'+numbers.get(checked.storageOwners.get(node.id))])),lines=['@'+graph.id.split('.').map(symbol).join('::')+'('+(preserveInputOrder?Object.entries(graph.inputs):Object.entries(graph.inputs).sort(([a],[b])=>a<b?-1:a>b?1:0)).map(([name,spec])=>symbol(name)+':'+type(spec.type)).join(',')+')->'+type(graph.output.type)+' {'];
 for(const node of nodes)if(cells.has(node.id)&&!Object.hasOwn(node,'storage'))lines.push('let mut '+cells.get(node.id)+':'+type(node.valueType)+' = '+flowValueSource(node.initial,node.valueType)+';');
 for(const [id,name]of values)lines.push('let mut '+name+':'+type(checked.interfaces.get(id).output)+' = '+flowValueSource(defaultFlowValue(checked.interfaces.get(id).output),checked.interfaces.get(id).output)+';');
 lines.push('let mut '+pc+' = '+numbers.get(graph.entry)+';','while true {');
 const activations=Object.create(null),dataLocations=Object.create(null);
 for(const node of activeNodes){
  lines.push('if '+pc+' == '+numbers.get(node.id)+' {','let '+prefix+'activation = '+numbers.get(node.id)+';');activations[node.id]=lines.length;
  function reference(ref,expected){if(Object.hasOwn(ref,'input'))return symbol(ref.input).startsWith('"')?'#'+symbol(ref.input):symbol(ref.input);if(Object.hasOwn(ref,'literal'))return flowValueSource(ref.literal,expected);return cells.get(ref.node)??values.get(ref.node);}
  const target=port=>numbers.get(checked.outgoing.get(node.id+':'+port));
  if(node.uses==='std.program.Result')lines.push('return '+reference(node.args.value,node.uses==='std.program.Result'?graph.output.type:node.valueType)+';');
  else if(node.uses==='std.control.If'){const value=reference(node.args.condition,'Boolean'),ports=['yes','no'];lines.push('if '+value+' { '+pc+' = '+target(ports[0])+'; } else { '+pc+' = '+target(ports[1])+'; }','continue;');}
  else{if(cells.has(node.id)){if(Object.hasOwn(node.args,'value'))lines.push(cells.get(node.id)+' = '+reference(node.args.value,node.uses==='std.program.Result'?graph.output.type:node.valueType)+';');}else if(values.has(node.id)){lines.push(values.get(node.id)+' = '+callable(node.uses)+'('+(checked.interfaces.get(node.id).implementation==='flow'?Object.keys(checked.interfaces.get(node.id).inputs).sort():Object.keys(checked.interfaces.get(node.id).inputs)).map(port=>reference(node.args[port],checked.interfaces.get(node.id).inputs[port])).join(',')+');');dataLocations[node.id]=[lines.length];}lines.push(pc+' = '+target(node.uses==='std.control.IterationEnd'?'repeat':'next')+';','continue;');}
  lines.push('}');
 }
 // All emitted activation states end in return/continue. This explicit fallback is unreachable for valid edges.
 lines.push('}','return '+flowValueSource(defaultFlowValue(graph.output.type),graph.output.type)+';','}');
 return {source:lines.join('\n'),activations,data:dataLocations};
}
