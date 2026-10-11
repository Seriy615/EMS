import {fail} from '../reference/errors.mjs';
import {createStateRegistry} from '../runtime/reactor.mjs';
import {parseEMSModule} from '../frontend/index.mjs';
import {typecheckModule} from '../frontend/check.mjs';
import {typeName} from '../frontend/types.mjs';
import {handlerSourceGraph} from './control-graph.mjs';
import {editHandlerGraphNode} from './control-graph-ops.mjs';
import {bindingAtPath} from './control-bindings.mjs';
/** Actual installed contracts and source functions; no invented ABI or implementations. */
export function handlerGraphCatalog(editor,event){
 const graph=handlerSourceGraph(editor,event),registry=createStateRegistry(editor.base,editor.application.reactor.state);
 const checked=typecheckModule(parseEMSModule(graph.source,{maxTokens:20000,maxDepth:128}),registry),items=new Map();
 for(const contract of registry.items.values())if(contract.kind!=='collection'&&/^[_A-Za-z][_A-Za-z0-9]*(\.[_A-Za-z][_A-Za-z0-9]*)*$/.test(contract.id))items.set(contract.id,{id:contract.id,version:contract.version,kind:contract.kind,inputs:Object.entries(contract.inputs).map(([name,type])=>({name,type:typeof type==='string'?type:type.type})),output:contract.kind==='resource'?`ResourceHandle<${contract.valueType}>`:contract.output,effects:[...contract.effects],capabilities:[...contract.capabilities]});
 for(const fn of checked.signatures.values())if(!fn.declaration.external)items.set(fn.name,{id:fn.name,version:null,kind:'function',inputs:fn.inputs.map(input=>({name:input.name,type:typeName(input.type)})),output:typeName(fn.output),...structuredClone(checked.policies.get(fn.name))});
 return [...items.values()].sort((a,b)=>a.id.localeCompare(b.id));
}
/** Connect an existing lexical value/literal to one call port, without copying effectful evaluations. */
export function connectHandlerGraphPort(editor,event,expectedSource,sourceId,targetId,port){
 const graph=handlerSourceGraph(editor,event);if(graph.source!==expectedSource)fail('STALE_GRAPH','Handler changed since graph selection');
 const source=graph.nodes.find(node=>node.id===sourceId),target=graph.nodes.find(node=>node.id===targetId);
 if(!source||target?.kind!=='CallExpression')fail('INVALID_GRAPH_CONNECTION','Select an existing value and call');
 const index=target.ports.findIndex(input=>input.name===port);if(index<0)fail('INVALID_GRAPH_CONNECTION','Unknown call input port');
 let expression;
 if(source.kind==='LiteralExpression')expression=source.text;
 else{
  const ast=parseEMSModule(graph.source,{maxTokens:20000,maxDepth:128});
  const binding=['LetDeclaration','UsingDeclaration','Parameter'].includes(source.kind)?{id:source.id,name:source.label}:source.kind==='NameExpression'?bindingAtPath(ast,source.id,source.label):null;
  const visible=binding?bindingAtPath(ast,target.id,binding.name):null;
  if(!binding||!visible||binding.id!==visible.id)fail('INVALID_GRAPH_CONNECTION','Value is not visible at target; use an existing local binding');
  expression=binding.name;
 }
 const args=[...target.arguments];args[index]=expression;
 editHandlerGraphNode(editor,event,expectedSource,targetId,{kind:'call',target:target.sourceTarget,arguments:args});
}
