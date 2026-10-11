import {ProjectManager} from '../src/studio/manager.mjs';
import {installControlGraph} from './control-graph.mjs';
import {buildUIProjectPackage} from '../src/compiler/ui-package.mjs';
import {packageTAR} from '../src/compiler/archive.mjs';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {createUIWorkerRuntime} from '../src/ui/worker-client.mjs';
import {mountDOMRuntime} from '../src/ui/dom.mjs';
import {UIRuntime} from '../src/ui/model.mjs';
import {installUIAuthoring} from './ui-authoring.mjs';
import {compileUIHandler} from '../src/ui/source.mjs';
import {parseUIProject,parseUIWorkspace} from '../src/ui/project.mjs';
import {UIProjectEditor,UIProjectStorage} from '../src/studio/ui-project.mjs';
const host=document.querySelector('#application'),error=document.querySelector('#error'),source=document.querySelector('#ui-source'),status=document.querySelector('#ui-status');
const policy={capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']};
const base=createCoreRegistry(),storage=new UIProjectStorage(localStorage,base);
const managedId=new URLSearchParams(location.search).get('project'),manager=managedId?new ProjectManager(localStorage):null;
let managedRecord;try{managedRecord=manager?.load(managedId);if(manager&&managedRecord?.kind!=='ui')throw new Error('UI project not found');}catch(failure){error.textContent=(failure.code??'HOST_ERROR')+': '+failure.message;throw failure;}
let debugMode=false,pausedEvent=null;let restarting=Promise.resolve(),authoringQueue=Promise.resolve(),authoring;export let applicationController,editor;
function report(failure){error.textContent=failure.code??'HOST_ERROR';const location=failure.details?.location;if(location?.start?.offset!==undefined){const field=document.querySelector('#handler-source');field.focus();field.setSelectionRange(location.start.offset,location.end?.offset??location.start.offset);error.textContent+=' — '+location.start.line+':'+location.start.column;}}
function render(){authoring?.refresh();source.value=editor.source;document.querySelector('#undo-ui').disabled=!editor.history.length;document.querySelector('#redo-ui').disabled=!editor.future.length;}
function debugPause(pause){
 pausedEvent=pause.eventId;
 const field=document.querySelector('#handler-source'),draft=editor.sources[pause.handler];
 document.querySelector('#ui-debug-location').textContent='Пауза события '+pause.handler+' / '+pause.eventId+'\n'+(pause.profile==='control'?pause.callStack.join(' → ')+' / '+pause.node+' ('+pause.kind+')':pause.callPath.map(call=>call.graph+' / '+call.node).join(' → '));
 document.querySelector('#ui-debug-over').disabled=document.querySelector('#ui-debug-out').disabled=document.querySelector('#ui-debug-step').disabled=false;document.querySelector('#ui-debug-continue').disabled=false;
 if(draft&&pause.location&&document.querySelector('#handler-event').value===pause.handler&&field.value===draft.source){field.focus();field.setSelectionRange(pause.location.start.offset,pause.location.end.offset);}
}
for(const [id,mode]of [['ui-debug-step','step'],['ui-debug-over','over'],['ui-debug-out','out'],['ui-debug-continue','continue']])document.querySelector('#'+id).onclick=()=>{if(applicationController?.runtime.resume(mode)){document.querySelector('#ui-debug-over').disabled=document.querySelector('#ui-debug-out').disabled=document.querySelector('#ui-debug-step').disabled=true;document.querySelector('#ui-debug-continue').disabled=true;}};
document.querySelector('#ui-debug-start').onclick=()=>{debugMode=true;startDemo().catch(report);};
export function startDemo(){const task=restarting.then(async()=>{const application=editor.application;const checked=new UIRuntime(application,base,{policy});await checked.close();const runtime=await createUIWorkerRuntime(editor.source,{policy,debug:debugMode,timeout:debugMode?60000:5000,onPause:debugPause,onDebugEnd:record=>{if(record.eventId===pausedEvent){pausedEvent=null;document.querySelector('#ui-debug-over').disabled=document.querySelector('#ui-debug-out').disabled=document.querySelector('#ui-debug-step').disabled=true;document.querySelector('#ui-debug-continue').disabled=true;document.querySelector('#ui-debug-location').textContent=record.ok?'Событие подтверждено':'Событие отклонено: '+record.code;}}});await applicationController?.close();error.textContent='';try{applicationController=mountDOMRuntime(host,application,runtime,{onError:report});}catch(failure){await runtime.close();throw failure;}render();});restarting=task.catch(()=>{});return task;}
async function apply(candidate){const application=parseUIProject(candidate,base),checked=new UIRuntime(application,base,{policy});await checked.close();editor.replace(candidate);await startDemo();saveManaged();status.textContent='Проект проверен и применён.';}
const response=await fetch('/examples/ui-counter.json');if(!response.ok)throw new Error('Cannot load EMS UI application');const example=await response.json(),counterSource=await (await fetch('/examples/counter.ems')).text();example.reactor.handlers[0].program=compileUIHandler(counterSource,'demo.Counter',example,base).ir;let authoredSources={change:{source:counterSource,entry:'demo.Counter'}},application=example;
try{const saved=manager?parseUIWorkspace(managedRecord.source,base):storage.loadWorkspace();if(saved){const checked=new UIRuntime(saved.application,base,{policy});await checked.close();application=saved.application;authoredSources=saved.sources;}}catch(failure){report(failure);if(manager)throw failure;status.textContent='Сохранённая запись повреждена; пример открыт без перезаписи.';}
editor=new UIProjectEditor(application,base,{sources:authoredSources});const savedError=error.textContent;await startDemo();if(savedError)error.textContent=savedError;
document.querySelector('#restart').onclick=()=>{debugMode=false;startDemo().catch(report);};document.querySelector('#ui-debug-stop').onclick=()=>{pausedEvent=null;applicationController.runtime.close().catch(report);document.querySelector('#ui-debug-over').disabled=document.querySelector('#ui-debug-out').disabled=document.querySelector('#ui-debug-step').disabled=true;document.querySelector('#ui-debug-continue').disabled=true;document.querySelector('#ui-debug-location').textContent='Отладка остановлена; незавершённое событие не подтверждено.';};
document.querySelector('#close').onclick=()=>applicationController.close().catch(report);
document.querySelector('#apply-ui').onclick=()=>{apply(source.value).catch(report);};
document.querySelector('#save-ui').onclick=()=>{try{saveProject();status.textContent='Программа сохранена.';}catch(failure){report(failure);}};
document.querySelector('#open-ui').onclick=()=>{try{const saved=manager?parseUIWorkspace(manager.load(managedId).source,base):storage.loadWorkspace();if(!saved){status.textContent='Сохранённого UI-проекта нет.';return;}apply(new UIProjectEditor(saved.application,base,{sources:saved.sources}).source).catch(report);}catch(failure){report(failure);}};
document.querySelector('#undo-ui').onclick=()=>{try{editor.undo();startDemo().then(saveManaged).catch(report);}catch(failure){report(failure);}};document.querySelector('#redo-ui').onclick=()=>{try{editor.redo();startDemo().then(saveManaged).catch(report);}catch(failure){report(failure);}};
document.querySelector('#export-ui').onclick=()=>{const url=URL.createObjectURL(new Blob([editor.source],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='ems-ui-project.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
document.querySelector('#export-app-ui').onclick=async()=>{
 const button=document.querySelector('#export-app-ui');button.disabled=true;
 try{
  await authoringQueue;await restarting;
  const files=await buildUIProjectPackage(editor.source,{policy});
  const url=URL.createObjectURL(new Blob([packageTAR(files)],{type:'application/x-tar'})),link=document.createElement('a');
  link.href=url;link.download='ems-ui-app.tar';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  status.textContent='Приложение скачано. Распакуйте архив и разместите файлы на статическом сервере.';
 }catch(failure){report(failure);}finally{button.disabled=false;}
};
document.querySelector('#import-ui').onclick=()=>document.querySelector('#file-ui').click();
document.querySelector('#file-ui').onchange=async event=>{const file=event.target.files[0];try{if(file){if(file.size>1048576)throw Object.assign(new Error('UI file exceeds 1 MiB'),{code:'UI_LIMIT'});await apply(await file.text());}}catch(failure){report(failure);}finally{event.target.value='';}};

function change(operation){const task=authoringQueue.then(async()=>{const candidate=new UIProjectEditor(editor.application,base,{sources:editor.sources});operation(candidate);const checked=new UIRuntime(candidate.application,base,{policy});await checked.close();editor.replace(candidate.source);await startDemo();saveManaged();status.textContent='Изменение проверено и применено.';});authoringQueue=task.catch(()=>{});return task;}
authoring=installUIAuthoring(()=>editor,change,report);
document.querySelector('#new-ui').onclick=()=>{const empty={schemaVersion:'ems-ui-app/1',id:'project.ui',version:'1.0.0',reactor:{schemaVersion:'ems-reactor/1',id:'project.ui',version:'1.0.0',state:[],handlers:[]},ui:{schemaVersion:'ems-ui/1',root:{id:'root',kind:'column',props:{},events:{},children:[]}}};if(manager){try{const id='p'+crypto.randomUUID().replaceAll('-','');manager.save({id,name:'Новый UI-проект',kind:'ui',source:new UIProjectEditor(empty,base).source,draft:null});location.href='/web/ui-demo.html?project='+id;}catch(failure){report(failure);}}else apply(new UIProjectEditor(empty,base).source).catch(report);};

installControlGraph(()=>editor,change,report);

function saveProject(){if(manager)manager.save({...manager.load(managedId),source:editor.source});else storage.save(editor.application,{sources:editor.sources});}
function saveManaged(){if(manager)saveProject();}
