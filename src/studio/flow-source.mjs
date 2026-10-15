import {parseEMSModule} from '../frontend/index.mjs';
import {typecheckModule} from '../frontend/check.mjs';
import {printGraphDeclaration} from '../frontend/graphs.mjs';
import {validateFlowProject,formatFlowValue} from './flow-project.mjs';
import {defaultFlowValue} from '../contracts/flow-values.mjs';
import {recursiveFlowCalls,RECURSIVE_FLOW_CALL_PROFILE} from '../contracts/flow-library.mjs';
import {fail} from '../reference/errors.mjs';
const scopes=project=>[project,...(project.contracts??[])];
/** Text draft concurrency excludes geometry, descriptions and test inputs, which text never replaces. */
export const flowSourceIdentity=project=>formatFlowValue(scopes(project).map(scope=>scope.graph));
export function printFlowProjectSource(project,registry,options={}){validateFlowProject(project,registry,options);return scopes(project).map(scope=>printGraphDeclaration(scope.graph)).join('\n\n')+'\n';}
/** Apply complete source candidates transactionally; the caller commits only after full validation. */
export function applyFlowProjectSource(project,source,registry,options={}){
 const ast=parseEMSModule(source);if(ast.package||ast.imports.length||ast.declarations.some(node=>node.kind!=='TypeDeclaration'&&node.body?.kind!=='ContractGraph'))fail('GRAPH_SOURCE_PROJECT_PROFILE','The canvas requires graph contract bodies; structured contracts remain supported by the language');
 const checked=typecheckModule(ast,registry),graphs=[...(checked.graphBodies?.values()??[])],root=graphs.find(graph=>graph.id===project.graph.id);
 if(!root)fail('GRAPH_SOURCE_ENTRY','Keep the current root contract identity',{contract:project.graph.id});
 const previous=new Map(scopes(project).map(scope=>[scope.graph.id,scope]));
 function workspace(graph){
  const old=previous.get(graph.id),ids=new Set([...graph.nodes.map(node=>node.id),...Object.keys(graph.inputs).map(name=>'input:'+name)]),oldIDs=new Set(old?[...old.graph.nodes.map(node=>node.id),...Object.keys(old.graph.inputs).map(name=>'input:'+name)]:[]),canvas=structuredClone(old?.canvas??{positions:{},view:{x:0,y:0,scale:1},descriptions:{}});
  for(const field of ['positions','descriptions'])canvas[field]=Object.fromEntries(Object.entries(canvas[field]).filter(([id])=>ids.has(id)));
  const positions=Object.values(canvas.positions),right=positions.length?Math.max(...positions.map(p=>p.x))+300:oldIDs.size?400:40;let index=0;for(const id of ids)if(!oldIDs.has(id)){canvas.positions[id]={x:right+(index%3)*290,y:80+Math.floor(index/3)*230};index++;}
  const inputs=Object.fromEntries(Object.entries(graph.inputs).map(([name,spec])=>[name,old?.graph.inputs[name]?.type===spec.type?structuredClone(old.inputs[name]):defaultFlowValue(spec.type)]));
  return {graph,inputs,canvas};
 }
 const candidate=structuredClone(project),main=workspace(root),contracts=graphs.filter(graph=>graph!==root).map(workspace);Object.assign(candidate,main);
 if(candidate.schemaVersion==='ems-flow-project/3'||recursiveFlowCalls(graphs)){candidate.schemaVersion='ems-flow-project/3';candidate.callProfile=RECURSIVE_FLOW_CALL_PROFILE;candidate.contracts=contracts;}
 else if(contracts.length||candidate.schemaVersion==='ems-flow-project/2'){candidate.schemaVersion='ems-flow-project/2';candidate.contracts=contracts;delete candidate.callProfile;}
 else{candidate.schemaVersion='ems-flow-project/1';delete candidate.contracts;delete candidate.callProfile;}
 return validateFlowProject(candidate,registry,options);
}
/** A graph source file opens directly as the same ordinary graph, never as a projected dispatcher. */
export function flowProjectFromSource(source,registry,{id='imported',name,entry}={}){
 const ast=parseEMSModule(source),first=ast.declarations.find(node=>node.body?.kind==='ContractGraph');if(!first)fail('GRAPH_SOURCE_PROJECT_PROFILE','Expected at least one graph contract body');
 const project={schemaVersion:'ems-flow-project/1',id,name:name??first.name,graph:{id:entry??first.name,nodes:[],inputs:{}},inputs:{},canvas:{positions:{},view:{x:0,y:0,scale:1},descriptions:{}}};
 return applyFlowProjectSource(project,source,registry);
}
/** Independent bounded text draft with compare-and-swap and explicit recovery copy. */
export class FlowTextDraft{
 constructor(storage,owner,project,registry,options={}){this.storage=storage;this.key='ems.flow.text.'+owner;this.registry=registry;this.options=options;this.expected=storage.getItem(this.key);this.base=flowSourceIdentity(project);this.text=printFlowProjectSource(project,registry,options);this.dirty=false;if(this.expected!==null){let data;try{data=JSON.parse(this.expected);}catch{fail('INVALID_FLOW_TEXT_DRAFT','Malformed graph text draft');}if(data?.schemaVersion!=='ems-flow-text-draft/1'||Object.keys(data).sort().join(',')!=='base,schemaVersion,text'||typeof data.base!=='string'||data.base.length>4*1024*1024||typeof data.text!=='string'||data.text.length>1_000_000)fail('INVALID_FLOW_TEXT_DRAFT','Invalid graph text draft');this.base=data.base;this.text=data.text;this.dirty=true;}}
 assertStorage(){if(this.storage.getItem(this.key)!==this.expected)fail('STALE_FLOW_TEXT_DRAFT','Текст изменён в другом окне. Скачайте свою копию и обновите страницу.');}
 save(text){if(typeof text!=='string')fail('INVALID_SOURCE','Graph text must be a string');this.text=text;this.dirty=true;if(text.length>1_000_000)fail('SOURCE_LIMIT','Graph text exceeds source limit');this.assertStorage();const raw=JSON.stringify({schemaVersion:'ems-flow-text-draft/1',base:this.base,text});this.storage.setItem(this.key,raw);this.expected=raw;}
 stale(project){return this.base!==flowSourceIdentity(project);}
 assertCurrent(project){this.assertStorage();if(this.stale(project))fail('STALE_FLOW_TEXT','Граф изменён. Скачайте черновик или загрузите актуальный текст перед применением.');}
 reset(project){this.assertStorage();const text=printFlowProjectSource(project,this.registry,this.options);if(this.expected!==null)this.storage.setItem(this.key+'.previous',this.expected);this.storage.removeItem(this.key);this.expected=null;this.text=text;this.base=flowSourceIdentity(project);this.dirty=false;}
}
