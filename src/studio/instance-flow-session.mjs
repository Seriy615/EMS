import {createCoreRegistry} from '../reference/registry.mjs';
import {fail} from '../reference/errors.mjs';
import {projectManagerForLocation} from './manager.mjs';
import {parseFlowProject} from './flow-project.mjs';
import {parseInstanceProject,serializeInstanceProject,instanceProjectFlow,applyInstanceProjectFlow} from './instance-project.mjs';
import {validateInstanceModule} from '../instances/module.mjs';
import {instanceSlot} from '../instances/names.mjs';
/** The ordinary canvas owns an incomplete draft; only explicit checked Save changes the module. */
export class InstanceFlowSession{
 constructor(storage,search,base=createCoreRegistry()){
  this.storage=storage;this.base=base;const params=new URLSearchParams(search);this.projectId=params.get('project');this.fileId=params.get('file');this.fromUI=params.get('nativeUI')==='1';this.manager=projectManagerForLocation(storage,search);const record=this.manager.load(this.manager.fileId??this.projectId);if(record?.kind!=='contract')fail('UNKNOWN_PROJECT','Contract document not found');this.expected=record.source;this.document=parseInstanceProject(record.source,base);this.name=record.name;
  this.target=params.has('invariant')?{kind:'invariant',contract:params.get('definition'),id:params.get('invariant')}:{kind:'transition',instance:params.get('instance'),name:params.get('transition')};const view=instanceProjectFlow(this.document,this.target,base);this.registry=view.registry;this.options=view.options;this.activeContract=view.activeContract;
  this.key='ems.instance.flow-draft.'+this.projectId+':'+(this.fileId??'')+':'+(this.target.kind==='transition'?'body':JSON.stringify(this.target));this.warning='';let flow=view.source;const saved=storage.getItem(this.key);if(saved){let draft;try{draft=JSON.parse(saved);}catch{fail('INVALID_FLOW_DRAFT','Malformed contract graph draft');}if(draft?.schemaVersion!=='ems-instance-flow-draft/1'||typeof draft.base!=='string'||typeof draft.flow!=='string'||Object.keys(draft).sort().join(',')!=='base,flow,schemaVersion')fail('INVALID_FLOW_DRAFT','Invalid contract graph draft');if(draft.base===this.expected)flow=draft.flow;else this.warning='Модуль изменён: открыт применённый граф, прежний черновик сохранён отдельно.';}this.project=parseFlowProject(flow,this.registry,this.options);
  this.labels=new Map();for(const owner of this.document.module.instances){const def=this.document.module.definitions.find(item=>item.id===owner.contract);for(const field of def.fields){const slot=instanceSlot(owner.id,field.name);this.labels.set('state.'+slot+'.read','Прочитать '+owner.id+'.'+field.name);this.labels.set('state.'+slot+'.write','Записать '+owner.id+'.'+field.name);}for(const action of owner.transitions)this.labels.set(action.entry,owner.id+'::'+action.name);}
 }
 saveDraft(flow){parseFlowProject(flow,this.registry,this.options);const old=this.storage.getItem(this.key);if(old&&JSON.parse(old).base!==this.expected)this.storage.setItem(this.key+'.previous',old);this.storage.setItem(this.key,JSON.stringify({schemaVersion:'ems-instance-flow-draft/1',base:this.expected,flow}));}
 prepare(flow){return applyInstanceProjectFlow(this.document,this.target,flow,this.base);}
 apply(flow){const record=this.manager.load(this.manager.fileId??this.projectId);if(record?.source!==this.expected)fail('STALE_INSTANCE_PROJECT','Модуль изменён в другом окне. Черновик графа сохранён.');const candidate=this.prepare(flow),source=serializeInstanceProject(candidate,this.base);this.manager.save({...record,source});this.expected=source;this.document=candidate;this.storage.removeItem(this.key);return source;}
 action(entry){return validateInstanceModule(this.document.module,this.base).transitions.find(item=>item.entry===entry)??null;}
 get returnURL(){const query=new URLSearchParams({project:this.projectId});if(this.fileId)query.set('file',this.fileId);if(this.fromUI){query.set('native','1');return '/web/ui-demo.html?'+query;}return '/web/contracts.html?'+query;}
}
