import {UIProjectEditor} from './ui-project.mjs';
import {parseUIWorkspace} from '../ui/project.mjs';
import {parseFlowProject} from './flow-project.mjs';
import {createStateRegistry} from '../runtime/reactor.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
import {projectManagerForLocation} from './manager.mjs';
import {fail} from '../reference/errors.mjs';
/** Local incomplete draft is distinct from the checked handler saved in the UI application. */
export class UIFlowSession{
 constructor(storage,search,base=createCoreRegistry()){
  this.storage=storage;this.base=base;const params=new URLSearchParams(search);this.event=params.get('handler');this.projectId=params.get('project');this.fileId=params.get('file');this.manager=this.projectId?projectManagerForLocation(storage,search):null;
  const record=this.manager?.load(this.manager.fileId??this.projectId);if(this.manager&&record?.kind!=='ui')fail('UNKNOWN_PROJECT','UI project not found');
  this.expected=record?.source??storage.getItem('ems.studio.ui.v1');const workspace=parseUIWorkspace(this.expected,base),source=workspace.sources[this.event]?.flow;if(!source)fail('FLOW_REQUIRED','This handler has no editable contract flow');
  this.registry=createStateRegistry(base,workspace.application.reactor.state);this.options={allowState:true};this.key='ems.ui.flow-draft.'+(this.projectId??'local')+':'+(this.fileId??'')+':'+this.event;this.warning='';
  let flow=source;const saved=storage.getItem(this.key);if(saved){let draft;try{draft=JSON.parse(saved);}catch{fail('INVALID_FLOW_DRAFT','Malformed handler graph draft');}if(draft?.schemaVersion!=='ems-ui-flow-draft/1'||typeof draft.base!=='string'||typeof draft.flow!=='string'||Object.keys(draft).sort().join(',')!=='base,flow,schemaVersion')fail('INVALID_FLOW_DRAFT','Invalid handler graph draft');if(draft.base===this.expected)flow=draft.flow;else this.warning='UI изменён: открыт последний применённый граф. Прежний черновик сохранён отдельно.';}
  this.project=parseFlowProject(flow,this.registry,this.options);
 }
 saveDraft(flow){parseFlowProject(flow,this.registry,this.options);const previous=this.storage.getItem(this.key);if(previous&&JSON.parse(previous).base!==this.expected)this.storage.setItem(this.key+'.previous',previous);this.storage.setItem(this.key,JSON.stringify({schemaVersion:'ems-ui-flow-draft/1',base:this.expected,flow}));}
 apply(flow){
  const record=this.manager?.load(this.manager.fileId??this.projectId),current=record?.source??this.storage.getItem('ems.studio.ui.v1');if(current!==this.expected)fail('STALE_UI_PROJECT','UI changed in another window. The local graph draft is preserved.');
  const workspace=parseUIWorkspace(current,this.base),candidate=new UIProjectEditor(workspace.application,this.base,{sources:workspace.sources});candidate.applyFlow(this.event,flow);
  if(this.manager)this.manager.save({...record,source:candidate.source});else this.storage.setItem('ems.studio.ui.v1',candidate.source);this.expected=candidate.source;this.storage.removeItem(this.key);return candidate.source;
 }
 get returnURL(){return '/web/ui-demo.html'+(this.projectId?'?project='+encodeURIComponent(this.projectId)+(this.fileId?'&file='+encodeURIComponent(this.fileId):''):'');}
}
