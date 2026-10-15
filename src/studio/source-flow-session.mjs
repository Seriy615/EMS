import {ProjectEditor,parseProject} from './project.mjs';
import {compileTextDraft,validateStoredDraft} from './text.mjs';
import {sourceContractFlow} from './source-flow.mjs';
import {parseFlowProject,serializeFlowProject} from './flow-project.mjs';
import {compileContractFlow} from '../compiler/contract-flow.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
import {projectManagerForLocation,workspaceSource} from './manager.mjs';
import {fail} from '../reference/errors.mjs';

/** Read-only projection of a saved textual document into the ordinary canvas. */
export function savedSourceFlow(record){
 if(record?.kind!=='graph'||!record.draft)fail('SOURCE_FLOW_UNSUPPORTED','У документа нет сохранённого исходника EMS.');
 const draft=validateStoredDraft(record.draft),editor=new ProjectEditor(parseProject(record.source)),bundle=compileTextDraft(draft,editor);
 if(bundle.ir.schemaVersion!=='ems-ir/2')fail('SOURCE_FLOW_UNSUPPORTED','Этот исходник использует другой профиль графа.');
 const project=parseFlowProject(sourceContractFlow(bundle.ir,bundle.registry,{id:record.id,name:record.name}),bundle.registry);
 let inputs;try{inputs=JSON.parse(draft.inputs);}catch{fail('INVALID_DRAFT','Неверные данные запуска исходника.');}
 project.inputs=inputs;
 const registry=createCoreRegistry();compileContractFlow(project.graph,registry);
 return {project:parseFlowProject(serializeFlowProject(project,registry),registry),registry};
}

/** A draft never replaces its source. Explicit Save creates a real sibling flow document. */
export class SourceFlowSession{
 constructor(storage,search){
  this.storage=storage;const params=new URLSearchParams(search);this.projectId=params.get('project');this.fileId=params.get('file');
  if(!this.projectId||params.get('source')!=='1')fail('UNKNOWN_PROJECT','Исходный документ не выбран');
  this.manager=projectManagerForLocation(storage,search);this.id=this.manager.fileId??this.projectId;
  const record=this.manager.load(this.id);this.expected=JSON.stringify(record);
  const projection=savedSourceFlow(record);this.registry=projection.registry;this.project=projection.project;
  this.key='ems.source.flow-draft.'+this.projectId+':'+(this.fileId??'');this.warning='';
  const saved=storage.getItem(this.key);if(saved){const draft=this.readDraft(saved);if(draft.base===this.expected)this.project=parseFlowProject(draft.flow,this.registry);else this.warning='Исходник изменён. Открыта его текущая версия; прежний черновик графа сохранён отдельно.';}
 }
 readDraft(source){let draft;try{draft=JSON.parse(source);}catch{fail('INVALID_FLOW_DRAFT','Повреждён черновик графа исходника');}if(draft?.schemaVersion!=='ems-source-flow-draft/1'||typeof draft.base!=='string'||typeof draft.flow!=='string'||Object.keys(draft).sort().join(',')!=='base,flow,schemaVersion')fail('INVALID_FLOW_DRAFT','Неверный черновик графа исходника');return draft;}
 saveDraft(flow){parseFlowProject(flow,this.registry);const previous=this.storage.getItem(this.key);if(previous&&this.readDraft(previous).base!==this.expected)this.storage.setItem(this.key+'.previous',previous);this.storage.setItem(this.key,JSON.stringify({schemaVersion:'ems-source-flow-draft/1',base:this.expected,flow}));}
 apply(flow){
  const record=this.manager.load(this.id);if(JSON.stringify(record)!==this.expected)fail('STALE_SOURCE_PROJECT','Исходник изменён в другом окне. Ваш черновик графа сохранён.');
  // Validate with the standard registry used after reopen: no transient source library may escape.
  const registry=createCoreRegistry(),project=parseFlowProject(flow,registry);compileContractFlow(project.graph,registry);
  let id=this.id+'_flow',index=1;while(this.manager.load(id))id=this.id+'_flow_'+(++index);
  project.id=id;const source=serializeFlowProject(project,registry);
  const graphRecord={id,name:project.name,kind:'flow',source,draft:null};
  if(this.manager.fileMode)this.manager.save(graphRecord);
  else this.manager.save({id:record.id,name:record.name,kind:'workspace',draft:null,source:workspaceSource([{path:'source.ems.json',record},{path:'main.graph.json',record:graphRecord}])});
  this.storage.removeItem(this.key);
  return '/web/flow.html?'+new URLSearchParams({project:this.projectId,file:id});
 }
 get sourceURL(){const query=new URLSearchParams({project:this.projectId,text:'1'});if(this.fileId)query.set('file',this.fileId);return '/web/index.html?'+query;}
}
