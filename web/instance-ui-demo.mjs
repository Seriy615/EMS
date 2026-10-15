import {InstanceUIProjectEditor} from '../src/studio/instance-ui-project.mjs';
import {parseInstanceProject,withInstanceUI} from '../src/studio/instance-project.mjs';
import {projectManagerForLocation} from '../src/studio/manager.mjs';
import {createUIWorkerRuntime} from '../src/ui/worker-client.mjs';
import {mountDOMRuntime} from '../src/ui/dom.mjs';
import {buildInstanceUIPackage} from '../src/compiler/instance-ui-package.mjs';
import {packageTAR} from '../src/compiler/archive.mjs';
import {installUIDesigner} from './ui-designer.mjs';
import {installUIAuthoring} from './ui-authoring.mjs';
import {installUIConnections} from './ui-connections.mjs';
import {installProjectFiles} from './project-files.mjs';
const programLink=document.querySelector('nav a[href="/web/flow.html"]');
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),manager=projectManagerForLocation(localStorage,location.search),id=manager.fileId??params.get('project'),record=manager.load(id),policy={capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']};
if(record?.kind!=='contract')throw Error('Контрактный модуль не найден');let expected=record.source,revision=0,queue=Promise.resolve(),authoring,designer,connections;
export const editor=new InstanceUIProjectEditor(parseInstanceProject(record.source));export let applicationController;
function report(error){$('error').textContent=(error.code??'ERROR')+': '+error.message+(error.details?.instance?' · '+error.details.instance+' / '+error.details.invariant:'');}
function moduleURL(){const query=new URLSearchParams(location.search);query.delete('native');return '/web/contracts.html?'+query;}
function save(){const latest=manager.load(id);if(latest?.source!==expected)throw Object.assign(Error('Модуль изменён в другом окне. Экспортируйте текущую копию или откройте документ заново.'),{code:'STALE_INSTANCE_PROJECT'});manager.save({...latest,source:editor.source});expected=editor.source;$('ui-status').textContent='Интерфейс и контрактный модуль сохранены вместе.';}
function render(){authoring?.refresh();designer?.refresh();connections?.refresh();$('ui-source').value=editor.source;$('undo-ui').disabled=!editor.history.length;$('redo-ui').disabled=!editor.future.length;}
export async function startDemo(){const token=++revision;await applicationController?.close();applicationController=null;const document=editor.document;let runtime;try{runtime=await createUIWorkerRuntime(editor.source,{policy});if(token!==revision){await runtime.close();return;}applicationController=mountDOMRuntime($('application'),{ui:document.ui},runtime,{onError:report});$('error').textContent='';}catch(error){await runtime?.close();if(token===revision)report(error);}}
function change(operation){const task=queue.then(async()=>{const candidate=new InstanceUIProjectEditor(editor.document);operation(candidate);const previous=editor.source,history=[...editor.history],future=[...editor.future];try{editor.replace(candidate.source);save();}catch(error){editor.source=previous;editor.history=history;editor.future=future;throw error;}render();await startDemo();});queue=task.catch(()=>{});return task;}
function graph(event){try{const action=editor.document.module.instances.flatMap(instance=>instance.transitions.map(action=>({instance:instance.id,name:action.name,id:instance.id+'::'+action.name}))).find(action=>action.id===event);if(!action)throw Error('Выберите операцию экземпляра');save();const query=new URLSearchParams(location.search);query.delete('native');query.set('nativeUI','1');query.set('instance',action.instance);query.set('transition',action.name);location.assign('/web/flow.html?'+query);}catch(error){report(error);}}
// Native transitions are authored in their module, never copied into a second UI handler body.
for(const id of ['handler-code','create-handler','ui-debug-start','ui-debug-step','ui-debug-over','ui-debug-out','ui-debug-continue','ui-debug-stop','ui-debug-location'])$(id).hidden=true;
for(const element of document.querySelectorAll('.technical-handler-graph,.ui-point-settings'))element.hidden=true;$('ui-debug-after').closest('label').hidden=true;$('state-id').closest('details').hidden=true;
for(const [id,label]of [['handler-select','Операция экземпляра'],['event-handler','Операция контракта']]){const parent=$(id).closest('label');if(parent?.firstChild?.nodeType===Node.TEXT_NODE)parent.firstChild.textContent=label;}
$('handler-inspect').setAttribute('aria-label','Связь события с операцией');
const moduleLink=document.createElement('a');moduleLink.href=moduleURL();moduleLink.textContent='Открыть модуль: данные, операции и инварианты';$('handler-select').closest('fieldset').append(moduleLink);const stateLink=moduleLink.cloneNode(true);$('state-list').after(stateLink);
$('new-ui').textContent='Очистить интерфейс';$('new-ui').onclick=()=>change(candidate=>candidate.edit(app=>{app.ui=withInstanceUI(candidate.document).ui;})).catch(report);
$('restart').onclick=()=>startDemo().catch(report);$('close').onclick=()=>{revision++;void applicationController?.close();applicationController=null;};$('save-ui').onclick=()=>{try{save();}catch(error){report(error);}};
function history(method){const task=queue.then(async()=>{const previous={source:editor.source,history:[...editor.history],future:[...editor.future]};try{editor[method]();save();}catch(error){Object.assign(editor,previous);throw error;}render();await startDemo();});queue=task.catch(()=>{});task.catch(report);}
$('undo-ui').onclick=()=>history('undo');$('redo-ui').onclick=()=>history('redo');
$('open-ui').onclick=()=>location.reload();$('apply-ui').onclick=()=>{const source=$('ui-source').value;change(candidate=>candidate.replace(source)).catch(report);};
function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-ui').onclick=()=>download(editor.source,'native-ui.ems-project.json','application/json');$('export-app-ui').onclick=async()=>{try{await queue;download(packageTAR(buildInstanceUIPackage(editor.source,{policy})),'ems-ui-app.tar','application/x-tar');}catch(error){report(error);}};
$('import-ui').onclick=()=>$('file-ui').click();$('file-ui').onchange=async()=>{try{const file=$('file-ui').files[0];if(file){if(file.size>4*1024*1024)throw Error('Документ превышает 4 MiB');const source=await file.text();await change(candidate=>candidate.replace(source));}}catch(error){report(error);}finally{$('file-ui').value='';}};
authoring=installUIAuthoring(()=>editor,change,report);designer=installUIDesigner(()=>editor,change,report);connections=installUIConnections(()=>editor,authoring,designer);
$('open-handler-graph').onclick=()=>graph($('handler-select').value);document.addEventListener('ems:ui-open-graph',event=>graph(event.detail.event));
render();await startDemo();installProjectFiles();if(programLink){programLink.href=moduleURL();programLink.textContent='Контракты';}document.querySelector('nav a[aria-current="page"]').href=location.href;window.addEventListener('pagehide',()=>{revision++;void applicationController?.close();});
