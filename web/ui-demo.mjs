import {createCoreRegistry} from '../src/reference/registry.mjs';
import {mountDOMApplication} from '../src/ui/dom.mjs';
import {UIRuntime} from '../src/ui/model.mjs';
import {parseUIProject} from '../src/ui/project.mjs';
import {UIProjectEditor,UIProjectStorage} from '../src/studio/ui-project.mjs';
const host=document.querySelector('#application'),error=document.querySelector('#error'),source=document.querySelector('#ui-source'),status=document.querySelector('#ui-status');
const policy={capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']};
const base=createCoreRegistry(),storage=new UIProjectStorage(localStorage,base);
let restarting=Promise.resolve();export let applicationController,editor;
function report(failure){error.textContent=failure.code??'HOST_ERROR';}
function render(){source.value=editor.source;document.querySelector('#undo-ui').disabled=!editor.history.length;document.querySelector('#redo-ui').disabled=!editor.future.length;}
export function startDemo(){const task=restarting.then(async()=>{const application=editor.application;const checked=new UIRuntime(application,base,{policy});await checked.close();await applicationController?.close();error.textContent='';applicationController=mountDOMApplication(host,application,base,{policy,onError:report});render();});restarting=task.catch(()=>{});return task;}
async function apply(candidate){const application=parseUIProject(candidate,base),checked=new UIRuntime(application,base,{policy});await checked.close();editor.replace(candidate);await startDemo();status.textContent='Проект проверен и применён.';}
const response=await fetch('/examples/ui-counter.json');if(!response.ok)throw new Error('Cannot load EMS UI application');const example=await response.json();let application=example;
try{const saved=storage.load();if(saved){const checked=new UIRuntime(saved,base,{policy});await checked.close();application=saved;}}catch(failure){report(failure);status.textContent='Сохранённая запись повреждена; пример открыт без перезаписи.';}
editor=new UIProjectEditor(application,base);const savedError=error.textContent;await startDemo();if(savedError)error.textContent=savedError;
document.querySelector('#restart').onclick=()=>{startDemo().catch(report);};document.querySelector('#close').onclick=()=>{applicationController.close().catch(report);};
document.querySelector('#apply-ui').onclick=()=>{apply(source.value).catch(report);};
document.querySelector('#save-ui').onclick=()=>{try{storage.save(editor.application);status.textContent='Программа сохранена.';}catch(failure){report(failure);}};
document.querySelector('#open-ui').onclick=()=>{try{const saved=storage.load();if(!saved){status.textContent='Сохранённого UI-проекта нет.';return;}apply(new UIProjectEditor(saved,base).source).catch(report);}catch(failure){report(failure);}};
document.querySelector('#undo-ui').onclick=()=>{try{editor.undo();startDemo().catch(report);}catch(failure){report(failure);}};document.querySelector('#redo-ui').onclick=()=>{try{editor.redo();startDemo().catch(report);}catch(failure){report(failure);}};
document.querySelector('#export-ui').onclick=()=>{const url=URL.createObjectURL(new Blob([editor.source],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='ems-ui-project.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
document.querySelector('#import-ui').onclick=()=>document.querySelector('#file-ui').click();
document.querySelector('#file-ui').onchange=async event=>{const file=event.target.files[0];try{if(file){if(file.size>1048576)throw Object.assign(new Error('UI file exceeds 1 MiB'),{code:'UI_LIMIT'});await apply(await file.text());}}catch(failure){report(failure);}finally{event.target.value='';}};
