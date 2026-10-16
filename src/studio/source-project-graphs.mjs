import {formatFiniteJSON} from '../semantics/data-json.mjs';
import {instanceSourceScopes} from './instance-source.mjs';
import {authoredGraphsFor} from './authored-graphs.mjs';
import {compileSourceWorkspace} from './source-workspace-compiler.mjs';
import {parseSourceProject,serializeSourceProject} from './source-project.mjs';
import {parseEMSModule} from '../frontend/index.mjs';
import {linkEMSModules,modulePath,moduleSourceLocation} from '../frontend/modules.mjs';
import {typecheckModule} from '../frontend/check.mjs';
import {printGraphDeclaration} from '../frontend/graphs.mjs';
import {sourceContractFlow} from './source-flow.mjs';
import {instanceProjectFlow} from './instance-project.mjs';
import {parseFlowProject,serializeFlowProject,flowProjectOptions} from './flow-project.mjs';
import {compileContractFlow} from '../compiler/contract-flow.mjs';
import {validateInstanceModule} from '../instances/module.mjs';
import {instanceSlot} from '../instances/names.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
import {fail} from '../reference/errors.mjs';
const scopes=project=>[project,...(project.contracts??[])];
function bodies(ast){const result=[];function collect(node,parent){if(!node||typeof node!=='object')return;if(node.body?.kind==='ContractGraph')result.push({node,owner:parent?.kind==='StatefulContractDeclaration'?parent:null});if(node.kind==='ApplicationDeclaration')node.declarations.forEach(child=>collect(child,node));if(node.kind==='StatefulContractDeclaration')node.transitions.forEach(child=>collect(child,node));}ast.declarations.forEach(node=>collect(node,null));return result;}
/** Source locations are sidecar authoring data, separate from semantic IR and canvas. */
export function sourceProjectGraphs(source,options={}){
 const project=parseSourceProject(source),compiled=compileSourceWorkspace(source,options),bundle=compiled.bundle,files=new Map([...project.sources].map(([file,text])=>{try{return [file,parseEMSModule(text,{maxTokens:20000,maxDepth:128})];}catch(error){error.details={...error.details,file};throw error;}})),targets=[];
 for(const symbol of bundle.modules.symbols){const item=bodies(files.get(symbol.file)).find(item=>item.node.name===symbol.name&&!item.owner);if(item)targets.push({file:symbol.file,name:symbol.name,id:symbol.id,kind:'function',body:item.node.body.location});}
 if(compiled.kind==='native')for(const binding of bundle.sourceBindings){const location=moduleSourceLocation(bundle.modules,binding.bodyLocation);if(!location)continue;const item=bodies(files.get(location.file)).find(item=>item.node.body.location.start.offset===location.location.start.offset&&item.node.body.location.end.offset===location.location.end.offset);if(item)targets.push({file:location.file,name:item.node.name,id:binding.entry,kind:'transition',instance:binding.instance,operation:binding.name,self:!!item.owner,body:item.node.body.location});}
 return {compiled,targets,files,project};
}
function originalName(context,file,id){
 const symbols=context.compiled.bundle.modules.symbols,own=symbols.find(item=>item.file===file&&item.id===id);if(own)return own.name;
 for(const imported of context.files.get(file).imports){const path=modulePath(imported.source,file),member=symbols.find(item=>item.file===path&&item.id===id&&item.exported);if(member)return imported.alias+'.'+member.name;}
 if(id.startsWith('__ems_module_'))fail('SOURCE_GRAPH_SCOPE','Контракт недоступен через imports этого файла',{file,contract:id});
 return id;
}
function graphText(context,target,graph){
 const copy=structuredClone(graph);copy.id='Body';
 for(const node of copy.nodes){
  let name=node.uses;
  if(context.compiled.kind==='native')for(const instance of context.compiled.bundle.module.instances){const definition=context.compiled.bundle.module.definitions.find(item=>item.id===instance.contract);for(const field of definition.fields)for(const operation of ['read','write'])if(name==='state.'+instanceSlot(instance.id,field.name)+'.'+operation)name=(target.self&&target.instance===instance.id?'self':instance.id)+'.'+field.name+'.'+operation;for(const action of instance.transitions)if(name===action.entry)name=(target.self&&target.instance===instance.id?'self':instance.id)+'.'+action.name;}
  node.uses=originalName(context,target.file,name);
 }
 const printed=printGraphDeclaration(copy),body=parseEMSModule(printed).declarations[0].body.location;
 return printed.slice(body.start.offset,body.end.offset);
}
function ordered(value){if(!value||typeof value!=='object')return value;if(Array.isArray(value))return value.map(ordered);return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,ordered(item)]));}
function graphShape(graph){return formatFiniteJSON(ordered(graph));}
/** One ordinary canvas is bound to exact original module bodies, never to a flattened archive. */
export function openSourceProjectGraph(source,selector,options={}){
 const context=sourceProjectGraphs(source,options),target=context.targets.find(item=>item.file===selector.file&&item.name===selector.name&&(selector.instance===undefined?item.kind==='function':item.instance===selector.instance&&item.operation===selector.operation));
 if(!target)fail('SOURCE_GRAPH_REQUIRED','Выберите контракт с исходным телом graph. Другие формы редактируются в текстовом файле.');
 let flow,registry,settings={};
 if(target.kind==='transition'){
  const view=instanceProjectFlow(context.compiled.bundle.project,{kind:'transition',instance:target.instance,name:target.operation});flow=parseFlowProject(view.source,view.registry,view.options);registry=view.registry;settings=view.options;
  if(view.activeContract){const chosen=flow.contracts.find(item=>item.graph.id===view.activeContract),others=[{graph:flow.graph,inputs:flow.inputs,canvas:flow.canvas},...flow.contracts.filter(item=>item!==chosen)];Object.assign(flow,chosen);flow.contracts=others;}
 }else if(context.compiled.kind==='native'){
  const project=context.compiled.bundle.project,scope=instanceSourceScopes(project.module).find(item=>item.program.functions.some(fn=>fn.id===target.id));if(!scope)fail('SOURCE_GRAPH_REQUIRED','Этот граф пока не входит в исполняемую реализацию проекта. Экспортируйте контракт или подключите его к программе.');registry=scope.scope.kind==='body'?validateInstanceModule(project.module).registry:createCoreRegistry();settings={allowState:scope.scope.kind==='body'};flow=parseFlowProject(sourceContractFlow({...scope.program,entry:target.id},registry,{...settings,authoredGraphs:authoredGraphsFor(project,scope.scope)}),registry,settings);
 }else{
  const root=serializeSourceProject(target.file,context.project.sources),pure=compileSourceWorkspace(root,{mode:'pure',entry:target.name}),linked=linkEMSModules(context.project.sources,target.file),checked=typecheckModule(linked.ast,pure.bundle.registry),ids=new Set(pure.bundle.ir.functions?.map(fn=>fn.id));
  if(pure.bundle.ir.schemaVersion!=='ems-ir/2')fail('SOURCE_GRAPH_PROFILE','Ожидается общий control IR графового тела');
  registry=pure.bundle.registry;flow=parseFlowProject(sourceContractFlow(pure.bundle.ir,registry,{authoredGraphs:[...checked.graphBodies.values()].filter(graph=>ids.has(graph.id))}),registry);
 }
 const baseline=structuredClone(flow),labels=new Map(context.compiled.bundle.modules.symbols.map(symbol=>[symbol.id,symbol.file+' · '+symbol.name]));
 return {context,target,project:flow,registry,options:settings,labels,
  apply(nextSource){
   const candidate=parseFlowProject(nextSource,registry,settings);compileContractFlow(candidate.graph,registry,flowProjectOptions(candidate,settings));
   const previous=new Map(scopes(baseline).map(workspace=>[workspace.graph.id,workspace.graph]));if(scopes(candidate).length!==previous.size||scopes(candidate).some(workspace=>!previous.has(workspace.graph.id)))fail('SOURCE_GRAPH_SCOPE','Создавайте и удаляйте определения контрактов в исходных файлах.');
   const changes=new Map(),intended=[];for(const workspace of scopes(candidate)){
    const before=previous.get(workspace.graph.id),graph=workspace.graph;if(graphShape(graph)===graphShape(before))continue;
    if(JSON.stringify(graph.inputs)!==JSON.stringify(before.inputs)||graph.output.type!==before.output.type)fail('SOURCE_GRAPH_SIGNATURE','Меняйте сигнатуру контракта в исходном тексте.');
    const origin=context.targets.find(item=>item.id===graph.id);if(!origin)fail('SOURCE_GRAPH_REQUIRED','У этого вспомогательного графа нет редактируемого source graph тела.');
    const text=graphText(context,origin,graph),key=origin.file+':'+origin.body.start.offset+':'+origin.body.end.offset;
    if(changes.has(key)&&changes.get(key).text!==text)fail('SOURCE_GRAPH_CONFLICT','Два экземпляра изменили одно исходное тело по-разному.');changes.set(key,{...origin,text});intended.push(graph);
   }
   if(!changes.size)return source;
   const sources=new Map(context.project.sources);for(const file of new Set([...changes.values()].map(change=>change.file))){let text=sources.get(file);for(const change of [...changes.values()].filter(change=>change.file===file).sort((a,b)=>b.body.start.offset-a.body.start.offset))text=text.slice(0,change.body.start.offset)+change.text+text.slice(change.body.end.offset);sources.set(file,text);}
   const candidateSource=serializeSourceProject(context.project.entry,sources),compiled=compileSourceWorkspace(candidateSource,options);const actual=compiled.kind==='native'?compiled.bundle.authoredGraphs?.flatMap(scope=>scope.graphs)??[]:[...typecheckModule(linkEMSModules(sources,context.project.entry).ast,compiled.bundle.registry).graphBodies.values()];for(const expected of intended){const graph=actual.find(graph=>graph.id===expected.id);if(!graph||graphShape(graph)!==graphShape(expected))fail('SOURCE_GRAPH_BINDING','Обратная запись изменила привязку или структуру графа. Исправьте imports/имена в исходном файле.',{graph:expected.id});}return candidateSource;
  }};
}
