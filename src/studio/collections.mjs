import {fail} from '../reference/errors.mjs';
import {validateGraph} from '../reference/validate.mjs';
import {analyzeGraphEffects,validateEffectSequence} from '../semantics/effects.mjs';
import {parseEMSModule} from '../frontend/index.mjs';
import {typecheckModule} from '../frontend/check.mjs';
import {lowerCheckedModule} from '../frontend/lower.mjs';

export function collectionItem(spec){
 if(!spec||Object.keys(spec).sort().join(',')!=='callback,id,operation,version'||typeof spec.id!=='string'||!/^[-A-Za-z0-9_.]+$/.test(spec.id)||spec.version!=='1.0.0'||!['map','filter'].includes(spec.operation)||!spec.callback||Object.keys(spec.callback).sort().join(',')!=='id,version'||typeof spec.callback.id!=='string'||typeof spec.callback.version!=='string')fail('INVALID_COLLECTION','Invalid typed collection binding');
 return Object.freeze({id:spec.id,version:spec.version,kind:'collection',inputs:Object.freeze({values:'NumberArray'}),output:'NumberArray',effects:Object.freeze([]),capabilities:Object.freeze([]),collection:Object.freeze({...spec,callback:Object.freeze({...spec.callback})})});
}
export function checkCollection(item,registry){
 const target=registry.resolve(item.collection.callback.id);
 if(target.version!==item.collection.callback.version)fail('CONTRACT_VERSION','Collection callback version mismatch');
 const inputs=Object.values(target.inputs).map(type=>typeof type==='string'?type:type.type);
 if(inputs.length!==1||inputs[0]!=='Number'||target.output!==(item.collection.operation==='map'?'Number':'Boolean'))fail('BINDING_SIGNATURE','Collection callback must accept Number and return the declared element type');
 if(!['atomic','composite'].includes(target.kind))fail('BINDING_SIGNATURE','Callback must be an executable atomic/composite contract');
 const policy=target.kind==='composite'?analyzeGraphEffects(target.graph,registry):target;
 if(policy.effects.length||policy.capabilities.length||target.effects.length||target.capabilities.length)fail('COLLECTION_EFFECT','Collection callback must be pure and require no capabilities');
 return target;
}
export function hasCollections(graph,registry,seen=new Set()){
 for(const node of graph.nodes){const item=registry.resolve(node.uses);if(item.kind==='collection')return true;if(item.kind==='composite'&&!seen.has(item.id)){seen.add(item.id);if(hasCollections(item.graph,registry,seen))return true;}}
 return false;
}
/** Graph frontend: preserve demand order/memoization and explicit sequences, then use the existing control backend. */
export function collectionSource(graph,registry){
 const graphs=new Map(),names=new Map(),used=new Set(registry.items.keys());let next=0;
 function fresh(prefix,suffix=''){let name;do{name=prefix+next++ +suffix;}while(used.has(name));used.add(name);return name;}
 const identity=value=>[...String(value)].map(char=>char.codePointAt(0).toString(16).padStart(6,'0')).join('');
 function discover(current,key){
  if(graphs.has(key))return;
  if(current.schemaVersion!=='0.1'||current.interfaceRef)fail('UNSUPPORTED_PROFILE','Owned public interface graphs require their interface boundary backend');
  validateGraph(current,registry);validateEffectSequence(current,registry);
  const policy=analyzeGraphEffects(current,registry);if(policy.effects.length||policy.capabilities.length)fail('COLLECTION_EFFECT','Collection graph must be pure');
  for(const name of Object.keys(current.inputs))used.add(name);graphs.set(key,current);names.set(key,fresh('__ems_visual_','_g'+identity(current.id)+'_v'+identity(current.version)+'_c'+identity(typeof key==='string'?registry.resolve(key).version:current.version)));
  for(const node of current.nodes){const item=registry.resolve(node.uses);if(item.kind==='collection'){const target=checkCollection(item,registry);if(target.kind==='composite'&&!target.interfaceBoundary)discover(target.graph,target.id);}else if(item.kind==='composite'&&!item.interfaceBoundary)discover(item.graph,item.id);else if(item.kind==='composite'&&hasCollections(item.graph,registry))fail('UNSUPPORTED_PROFILE','Collection lowering cannot erase an interface boundary');}
 }
 const root=Symbol('root');discover(graph,root);
 const callable=id=>{if(names.has(id))return names.get(id);if(!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(id))fail('UNSUPPORTED_PROFILE','External contract id cannot be expressed by this frontend');return id;};
 const type=value=>value==='NumberArray'?'Number[]':value;
 const literal=value=>Object.is(value,-0)?'-0':Array.isArray(value)?'['+value.map(literal).join(',')+']':JSON.stringify(value);
 const lines=[`package studio.collections @ ${JSON.stringify(graph.version)};`];
 for(const [key,current] of graphs){
  const args=new Map(Object.keys(current.inputs).map(name=>[name,key===root?name:fresh('__ems_input_')])),memo=new Map(),nodes=new Map(current.nodes.map(node=>[node.id,node])),statements=[];
  function ref(value){if(Object.hasOwn(value,'literal'))return literal(value.literal);if(Object.hasOwn(value,'input'))return args.get(value.input);return node(value.node);}
  function node(id){if(memo.has(id))return memo.get(id);const value=nodes.get(id),item=registry.resolve(value.uses),params=Object.keys(item.inputs).map(port=>ref(value.args[port]));let call;
   if(item.kind==='collection')call=`std.array.${item.collection.operation}(${params[0]},${callable(item.collection.callback.id)})`;
   else call=`${callable(item.id)}(${params.join(',')})`;
   const local=fresh('__ems_node_');memo.set(id,local);statements.push(`let ${local}=${call};`);return local;
  }
  for(const id of current.sequence??[])node(id);const result=ref(current.returns);
  lines.push(`fn ${names.get(key)}(${Object.entries(current.inputs).map(([name,spec])=>args.get(name)+':'+type(spec.type)).join(',')})->${type(current.output.type)} {`,...statements,`return ${result};`,'}');
 }
 return {source:lines.join('\n')+'\n',entry:names.get(root)};
}

export function lowerCollectionGraph(graph,registry){
 const text=collectionSource(graph,registry);return lowerCheckedModule(typecheckModule(parseEMSModule(text.source,{maxTokens:200000}),registry),text.entry,registry,{profile:'control'});
}
