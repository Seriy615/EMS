import {bindingAtPath} from './control-bindings.mjs';
import {fail} from '../reference/errors.mjs';
import {createStateRegistry} from '../runtime/reactor.mjs';
import {parseEMSModule} from '../frontend/index.mjs';
import {typecheckModule} from '../frontend/check.mjs';
import {typeName} from '../frontend/types.mjs';
import {compileUIHandler} from '../ui/source.mjs';

/** Typed source/control projection. Layout is a sidecar; execution remains the ordinary frontend/IR. */
export function handlerSourceGraph(editor,event){
 const workspace=editor.workspace,draft=workspace.sources[event];if(!draft)fail('SOURCE_REQUIRED','Handler has no editable source witness');
 const registry=createStateRegistry(editor.base,workspace.application.reactor.state);
 compileUIHandler(draft.source,draft.entry,workspace.application,editor.base);
 const checked=typecheckModule(parseEMSModule(draft.source,{maxTokens:20000,maxDepth:128}),registry);
 if(checked.collectionApplications.length)fail('UNSUPPORTED_VISUAL_PROFILE','Collection expansion requires a separate source projection');
 const nodes=[],edges=[],functions=new Map();
 function visit(node,id,depth,owner=null){
  if(!node||typeof node!=='object'||!node.kind||['NamedType','Requirement','ImportDeclaration','TypeDeclaration'].includes(node.kind))return null;
  if(nodes.length>=5000)fail('UI_GRAPH_LIMIT','Control source graph exceeds 5000 nodes');
  if(['FunctionDeclaration','ContractDeclaration'].includes(node.kind))owner=node.name;
  const type=node.kind==='Parameter'?checked.signatures.get(owner).inputs.find(input=>input.name===node.name)?.type:checked.types.get(node)??(['LetDeclaration','UsingDeclaration'].includes(node.kind)?checked.types.get(node.value):null),call=checked.calls.get(node),target=call?.target;
  const text=draft.source.slice(node.location.start.offset,node.location.end.offset);
  const contract=target?.contract??(target?.declaration?.external?registry.resolve(target.name):null);
  const item={ports:target?target.inputs.map((input,index)=>({name:input.name,type:typeName(call.inputs?.[index]??input.type)})):[],sourceTarget:node.kind==='CallExpression'?draft.source.slice(node.callee.location.start.offset,node.callee.location.end.offset):null,binding:node.kind==='NameExpression'?bindingAtPath(checked.ast,id,node.name):null,id,kind:node.kind,type:type?typeName(type):null,label:node.operator??node.name??node.binding??node.kind,literalValue:node.kind==='LiteralExpression'?node.value:null,arguments:node.kind==='CallExpression'?node.arguments.map(argument=>draft.source.slice(argument.location.start.offset,argument.location.end.offset)):null,text,location:structuredClone(node.location),depth,editable:!node.external,contract:contract?{id:contract.id,version:contract.version,kind:contract.kind,inputs:structuredClone(contract.inputs),output:contract.kind==='resource'?`ResourceHandle<${contract.valueType}>`:contract.output,effects:[...contract.effects],capabilities:[...contract.capabilities]}:null,callee:target&&!contract?target.name:null};
  nodes.push(item);if(['FunctionDeclaration','ContractDeclaration'].includes(node.kind))functions.set(node.name,id);
  for(const [key,value]of Object.entries(node)){
   if(['location','callee','type','output','requirements'].includes(key))continue;
   const children=Array.isArray(value)?value.map((child,index)=>[child,`${id}/${key}/${index}`]):[[value,`${id}/${key}`]];let previous=null;
   for(const [child,path]of children){const childId=visit(child,path,depth+1,owner);if(!childId)continue;const kind=key==='statements'?'sequence':['then','otherwise','body','handler','finalizer','arms'].includes(key)?'control':'data';edges.push({from:kind==='data'?childId:id,to:kind==='data'?id:childId,kind,label:key});if(key==='statements'&&previous)edges.push({from:previous,to:childId,kind:'next',label:'next'});previous=childId;}
  }
  return id;
 }
 for(const [index,declaration]of checked.ast.declarations.entries())if(['FunctionDeclaration','ContractDeclaration'].includes(declaration.kind)&&!declaration.external)visit(declaration,`declarations/${index}`,0);
 for(const node of nodes)if(node.binding&&nodes.some(def=>def.id===node.binding.id))edges.push({from:node.binding.id,to:node.id,kind:'binding',label:node.binding.name});
 for(const node of nodes)if(node.callee&&functions.has(node.callee))edges.push({from:node.id,to:functions.get(node.callee),kind:'call',label:node.callee});
 return {schemaVersion:'ems-control-source-graph/1',event,source:draft.source,entry:draft.entry,nodes,edges};
}
/** Recompile and transactionally apply a selected source node; never trust caller-provided offsets. */
export function replaceHandlerGraphNode(editor,event,expectedSource,id,replacement){
 const graph=handlerSourceGraph(editor,event);if(graph.source!==expectedSource)fail('STALE_GRAPH','Handler changed since graph selection');
 const node=graph.nodes.find(item=>item.id===id);if(!node||!node.editable)fail('UNKNOWN_GRAPH_NODE','No editable source node');
 if(typeof replacement!=='string'||!replacement.trim()||replacement.length>262144)fail('SOURCE_LIMIT','Invalid bounded node replacement');
 const start=node.location.start.offset,end=node.location.end.offset;
 editor.applyHandler(event,graph.source.slice(0,start)+replacement+graph.source.slice(end),graph.entry);
}
