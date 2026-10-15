import {assertFlowType,assertFlowValue} from './flow-values.mjs';
import {stateIntrinsic} from '../runtime/state-bindings.mjs';
import {fail} from '../reference/errors.mjs';
import {assertTypeName,assertValueType,typeOfValue} from '../reference/types.mjs';
import {describeContract} from './descriptions.mjs';

export const CONTRACT_FLOW_VERSION='ems-contract-flow/1';
export const RICH_CONTRACT_FLOW_VERSION='ems-contract-flow/2';
export const SHARED_STORAGE_FLOW_VERSION='ems-contract-flow/3';
export const richContractFlow=graph=>[RICH_CONTRACT_FLOW_VERSION,SHARED_STORAGE_FLOW_VERSION].includes(graph.schemaVersion);
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
  return {id:node.uses,version:'1.0.0',kind:'atomic',title:kernel.title,description:kernel.title,inputs,output:node.uses==='std.storage.Variable'?node.valueType:null,activation:{input:'enter',outputs:kernel.outputs},effects:[],capabilities:[],implementation:graph.schemaVersion};
 }
 const contract=registry.resolve(node.uses);
 if(contract.version!==node.version)fail('CONTRACT_VERSION','Contract version mismatch',{node:node.id});
 if((contract.effects.length||contract.capabilities.length)&&!(allowState===true&&stateIntrinsic(contract)))fail('UNSUPPORTED_FLOW_CONTRACT','This flow profile accepts pure contracts and local storage only',{node:node.id});
 if(contract.valueProfile!==undefined&&!(richContractFlow(graph)&&contract.valueProfile==='ems-algebraic/1')||!['atomic','composite'].includes(contract.kind))fail('UNSUPPORTED_FLOW_CONTRACT','Unsupported contract value profile',{node:node.id});
 const inputs=Object.fromEntries(Object.entries(contract.inputs).map(([name,type])=>[name,typeof type==='string'?type:type.type]));
 for(const type of [...Object.values(inputs),contract.output])assertFlowType(type,'flow contract',richContractFlow(graph));
 return {id:contract.id,version:contract.version,kind:contract.kind,title:contract.id,description:describeContract(contract),inputs,output:contract.output,activation:{input:'enter',outputs:['next']},effects:[...contract.effects],capabilities:[...contract.capabilities],implementation:'registry'};
}

/** Closed semantic graph, independent of canvas positions, creation order and descriptions. */
export function validateContractFlow(graph,registry,{complete=true,allowState=false}={}){
 fields(graph,['schemaVersion','id','version','inputs','output','nodes','connections','entry']);
 const rich=richContractFlow(graph),shared=graph.schemaVersion===SHARED_STORAGE_FLOW_VERSION;
 if(![CONTRACT_FLOW_VERSION,RICH_CONTRACT_FLOW_VERSION,SHARED_STORAGE_FLOW_VERSION].includes(graph.schemaVersion))fail('FLOW_VERSION','Unsupported contract-flow version');
 if(typeof graph.id!=='string'||graph.id.length>200||!ids.test(graph.id)||graph.version!=='1.0.0')fail('INVALID_FLOW','Invalid flow identity');
 object(graph.inputs);fields(graph.output,['type']);assertFlowType(graph.output.type,'flow result',rich);
 if(Object.keys(graph.inputs).length>100||!Array.isArray(graph.nodes)||graph.nodes.length>256||!Array.isArray(graph.connections)||graph.connections.length>1024)fail('FLOW_LIMIT','Contract flow exceeds limits');
 for(const [name,spec]of Object.entries(graph.inputs)){if(!names.test(name)||name.length>200)fail('INVALID_FLOW','Invalid input name');fields(spec,['type']);assertFlowType(spec.type,'flow input',rich);}
 const nodes=new Map(),interfaces=new Map();
 for(const node of graph.nodes){const bound=shared&&Object.hasOwn(node,'storage');fields(node,['id','uses','version','args',...(node.uses==='std.storage.Variable'?['valueType',bound?'storage':'initial']:[])]);if(typeof node.id!=='string'||node.id.length>200||!names.test(node.id)||nodes.has(node.id)||typeof node.uses!=='string'||!ids.test(node.uses))fail('INVALID_FLOW','Invalid or duplicate contract identity');object(node.args);if(node.uses==='std.storage.Variable'){assertFlowType(node.valueType,'variable',rich);if(!bound){if(!rich)literal(node.initial);assertFlowValue(node.initial,node.valueType,'variable initial',rich);}}nodes.set(node.id,node);interfaces.set(node.id,flowContractInterface(node,graph,registry,{allowState}));}
 const storageOwners=new Map();
 for(const node of nodes.values())if(node.uses==='std.storage.Variable'){
  const owner=Object.hasOwn(node,'storage')?nodes.get(node.storage):node;
  if(!owner)fail('UNKNOWN_FLOW_STORAGE','Variable storage does not exist',{node:node.id});
  if(owner.uses!=='std.storage.Variable'||Object.hasOwn(owner,'storage'))fail('INVALID_FLOW_STORAGE','Bind directly to a variable that owns its initial value',{node:node.id});
  if(owner.valueType!==node.valueType)fail('TYPE_MISMATCH','Shared variable value types differ',{node:node.id});
  storageOwners.set(node.id,owner.id);
 }
 if(graph.entry!==null&&!nodes.has(graph.entry)||complete&&graph.entry===null)fail('MISSING_FLOW_ENTRY','Select a contract to start execution');
 function referenceType(ref,expected){object(ref);if(Object.hasOwn(ref,'literal')){fields(ref,['literal']);if(rich){assertFlowValue(ref.literal,expected,'flow literal',true);return expected;}return literal(ref.literal);}if(Object.hasOwn(ref,'input')){fields(ref,['input']);if(!Object.hasOwn(graph.inputs,ref.input))fail('UNKNOWN_INPUT','Unknown flow input');return graph.inputs[ref.input].type;}fields(ref,['node']);const target=interfaces.get(ref.node);if(!target?.output)fail('INVALID_FLOW_PORT','Contract has no value output',{node:ref.node});return target.output;}
 for(const node of nodes.values()){const spec=interfaces.get(node.id);for(const [port,ref]of Object.entries(node.args)){if(!Object.hasOwn(spec.inputs,port))fail('INVALID_FLOW_PORT','Unknown contract input',{node:node.id,port});const type=referenceType(ref,spec.inputs[port]);if(type!==spec.inputs[port])fail('TYPE_MISMATCH','Contract-flow port types differ',{node:node.id,port,expected:spec.inputs[port],received:type});}if(complete&&node.uses!=='std.storage.Variable')for(const port of Object.keys(spec.inputs))if(!Object.hasOwn(node.args,port))fail('UNCONNECTED_FLOW_INPUT','Connect the required input',{node:node.id,port});}
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
  for(const id of reachable)for(const [port,ref]of Object.entries(nodes.get(id).args))if(Object.hasOwn(ref,'node')&&nodes.get(ref.node).uses!=='std.storage.Variable'&&!dominators.get(id).has(ref.node))fail('UNINITIALIZED_FLOW_VALUE','Activate the producer before consuming its value',{node:id,producer:ref.node,port});
 }
 return {graph,nodes,interfaces,outgoing,reachable,storageOwners};
}
