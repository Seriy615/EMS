import {stateIntrinsic} from '../runtime/state-bindings.mjs';
import {fail} from '../reference/errors.mjs';
import {assertTypeName,assertValueType,typeOfValue} from '../reference/types.mjs';
import {describeContract} from './descriptions.mjs';

export const CONTRACT_FLOW_VERSION='ems-contract-flow/1';
export const FLOW_KERNEL=Object.freeze({
 'std.control.If':{title:'Условие',inputs:{condition:'Boolean'},outputs:['yes','no']},
 'std.control.IterationBegin':{title:'Начало итерации',inputs:{},outputs:['next']},
 'std.control.IterationEnd':{title:'Конец итерации',inputs:{},outputs:['repeat']},
 'std.storage.Variable':{title:'Переменная',inputs:null,outputs:['next']},
 'std.program.Result':{title:'Результат',inputs:null,outputs:[]}
});
const names=/^[_A-Za-z][_A-Za-z0-9]*$/,ids=/^[_A-Za-z][_A-Za-z0-9]*(\.[_A-Za-z][_A-Za-z0-9]*)*$/;
function object(value){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==Object.keys(value).length)fail('INVALID_FLOW','Expected a plain flow record');}
function fields(value,keys){object(value);if(Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('INVALID_FLOW','Unexpected contract-flow fields');}
function literal(value){if(Array.isArray(value)&&value.length>10000||typeof value==='string'&&value.length>262144)fail('FLOW_LIMIT','Literal exceeds contract-flow limit');const type=typeOfValue(value);assertTypeName(type,'flow literal');return type;}

/** The same typed interface describes a card, its ports and compiler implementation. */
export function flowContractInterface(node,graph,registry,{allowState=false}={}){
 const kernel=FLOW_KERNEL[node.uses];
 if(kernel){
  if(node.version!=='1.0.0')fail('CONTRACT_VERSION','Kernel contract version mismatch',{node:node.id});
  const inputs=node.uses==='std.storage.Variable'?{value:node.valueType}:node.uses==='std.program.Result'?{value:graph.output.type}:kernel.inputs;
  return {id:node.uses,version:'1.0.0',kind:'atomic',title:kernel.title,description:kernel.title,inputs,output:node.uses==='std.storage.Variable'?node.valueType:null,activation:{input:'enter',outputs:kernel.outputs},effects:[],capabilities:[],implementation:'ems-contract-flow/1'};
 }
 const contract=registry.resolve(node.uses);
 if(contract.version!==node.version)fail('CONTRACT_VERSION','Contract version mismatch',{node:node.id});
 if((contract.effects.length||contract.capabilities.length)&&!(allowState===true&&stateIntrinsic(contract)))fail('UNSUPPORTED_FLOW_CONTRACT','This flow profile accepts pure contracts and local storage only',{node:node.id});
 if(contract.valueProfile!==undefined||!['atomic','composite'].includes(contract.kind))fail('UNSUPPORTED_FLOW_CONTRACT','Unsupported contract value profile',{node:node.id});
 const inputs=Object.fromEntries(Object.entries(contract.inputs).map(([name,type])=>[name,typeof type==='string'?type:type.type]));
 return {id:contract.id,version:contract.version,kind:contract.kind,title:contract.id,description:describeContract(contract),inputs,output:contract.output,activation:{input:'enter',outputs:['next']},effects:[...contract.effects],capabilities:[...contract.capabilities],implementation:'registry'};
}

/** Closed semantic graph, independent of canvas positions, creation order and descriptions. */
export function validateContractFlow(graph,registry,{complete=true,allowState=false}={}){
 fields(graph,['schemaVersion','id','version','inputs','output','nodes','connections','entry']);
 if(graph.schemaVersion!==CONTRACT_FLOW_VERSION)fail('FLOW_VERSION','Unsupported contract-flow version');
 if(typeof graph.id!=='string'||graph.id.length>200||!ids.test(graph.id)||graph.version!=='1.0.0')fail('INVALID_FLOW','Invalid flow identity');
 object(graph.inputs);fields(graph.output,['type']);assertTypeName(graph.output.type,'flow result');
 if(Object.keys(graph.inputs).length>100||!Array.isArray(graph.nodes)||graph.nodes.length>256||!Array.isArray(graph.connections)||graph.connections.length>1024)fail('FLOW_LIMIT','Contract flow exceeds limits');
 for(const [name,spec]of Object.entries(graph.inputs)){if(!names.test(name)||name.length>200)fail('INVALID_FLOW','Invalid input name');fields(spec,['type']);assertTypeName(spec.type,'flow input');}
 const nodes=new Map(),interfaces=new Map();
 for(const node of graph.nodes){fields(node,['id','uses','version','args',...(node.uses==='std.storage.Variable'?['valueType','initial']:[])]);if(typeof node.id!=='string'||node.id.length>200||!names.test(node.id)||nodes.has(node.id)||typeof node.uses!=='string'||!ids.test(node.uses))fail('INVALID_FLOW','Invalid or duplicate contract identity');object(node.args);if(node.uses==='std.storage.Variable'){assertTypeName(node.valueType,'variable');literal(node.initial);assertValueType(node.initial,node.valueType,'variable initial');}nodes.set(node.id,node);interfaces.set(node.id,flowContractInterface(node,graph,registry,{allowState}));}
 if(graph.entry!==null&&!nodes.has(graph.entry)||complete&&graph.entry===null)fail('MISSING_FLOW_ENTRY','Select a contract to start execution');
 function referenceType(ref){object(ref);if(Object.hasOwn(ref,'literal')){fields(ref,['literal']);return literal(ref.literal);}if(Object.hasOwn(ref,'input')){fields(ref,['input']);if(!Object.hasOwn(graph.inputs,ref.input))fail('UNKNOWN_INPUT','Unknown flow input');return graph.inputs[ref.input].type;}fields(ref,['node']);const target=interfaces.get(ref.node);if(!target?.output)fail('INVALID_FLOW_PORT','Contract has no value output',{node:ref.node});return target.output;}
 for(const node of nodes.values()){const spec=interfaces.get(node.id);for(const [port,ref]of Object.entries(node.args)){if(!Object.hasOwn(spec.inputs,port))fail('INVALID_FLOW_PORT','Unknown contract input',{node:node.id,port});const type=referenceType(ref);if(type!==spec.inputs[port])fail('TYPE_MISMATCH','Contract-flow port types differ',{node:node.id,port,expected:spec.inputs[port],received:type});}if(complete&&node.uses!=='std.storage.Variable')for(const port of Object.keys(spec.inputs))if(!Object.hasOwn(node.args,port))fail('UNCONNECTED_FLOW_INPUT','Connect the required input',{node:node.id,port});}
 // Storage outputs cut data dependency cycles. Their write inputs are demanded only on activation.
 const done=new Set(),active=new Set();
 function visit(id){if(active.has(id))fail('DATA_DEPENDENCY_CYCLE','A data cycle requires an explicit storage boundary',{node:id});if(done.has(id))return;active.add(id);const node=nodes.get(id);if(node.uses!=='std.storage.Variable')for(const ref of Object.values(node.args))if(Object.hasOwn(ref,'node'))visit(ref.node);active.delete(id);done.add(id);}
 for(const id of nodes.keys())visit(id);
 const outgoing=new Map();
 for(const edge of graph.connections){fields(edge,['from','to']);fields(edge.from,['node','port']);fields(edge.to,['node','port']);const from=interfaces.get(edge.from.node),to=interfaces.get(edge.to.node);if(!from||!to||!from.activation.outputs.includes(edge.from.port)||edge.to.port!=='enter')fail('INVALID_FLOW_PORT','Connect compatible activation ports');const key=edge.from.node+':'+edge.from.port;if(outgoing.has(key))fail('AMBIGUOUS_ACTIVATION','This profile permits one target per activation output');outgoing.set(key,edge.to.node);}
 const reachable=new Set(),pending=graph.entry===null?[]:[graph.entry];
 while(pending.length){const id=pending.pop();if(reachable.has(id))continue;reachable.add(id);for(const port of interfaces.get(id).activation.outputs){const next=outgoing.get(id+':'+port);if(next)pending.push(next);else if(complete)fail('UNCONNECTED_FLOW_OUTPUT','Connect the activation output',{node:id,port});}}
 if(complete&&graph.entry!==null){
  const predecessors=new Map([...reachable].map(id=>[id,[]]));for(const edge of graph.connections)if(reachable.has(edge.from.node))predecessors.get(edge.to.node).push(edge.from.node);
  const dominators=new Map([...reachable].map(id=>[id,new Set(id===graph.entry?[id]:reachable)]));let changed=true;
  while(changed){changed=false;for(const id of reachable){if(id===graph.entry)continue;const parents=predecessors.get(id),next=new Set([...dominators.get(parents[0])].filter(value=>parents.every(parent=>dominators.get(parent).has(value))));next.add(id);const before=dominators.get(id);if(next.size!==before.size||[...next].some(value=>!before.has(value))){dominators.set(id,next);changed=true;}}}
  for(const id of reachable)for(const ref of Object.values(nodes.get(id).args))if(Object.hasOwn(ref,'node')&&nodes.get(ref.node).uses!=='std.storage.Variable'&&!dominators.get(id).has(ref.node))fail('UNINITIALIZED_FLOW_VALUE','Activate the producer before consuming its value',{node:id,producer:ref.node});
 }
 return {graph,nodes,interfaces,outgoing,reachable};
}
