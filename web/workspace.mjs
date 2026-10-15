import {newInstanceProject,serializeInstanceProject} from '../src/studio/instance-project.mjs';
import {newFlowProject} from '../src/studio/flow-project.mjs';
import {ProjectManager,ProjectFileManager,parseWorkspaceFiles,workspaceSource} from '../src/studio/manager.mjs';
import {newProject,serializeProject} from '../src/studio/project.mjs';
import {UIProjectEditor} from '../src/studio/ui-project.mjs';
import {validateStoredDraft,compileTextDraft} from '../src/studio/text.mjs';
import {ProjectEditor} from '../src/studio/project.mjs';
const $=id=>document.getElementById(id),manager=new ProjectManager(localStorage),id=new URLSearchParams(location.search).get('project');
const report=error=>$('error').textContent=(error.code??'HOST_ERROR')+': '+error.message;
function render(){const project=manager.load(id);if(project?.kind!=='workspace')throw Error('Проект с файлами не найден');$('title').textContent=project.name;$('files').replaceChildren();for(const file of parseWorkspaceFiles(project.source).files){const row=document.createElement('p'),link=document.createElement('a');link.textContent=file.path;link.href=new ProjectFileManager(localStorage,id,file.record.id).url();link.dataset.file=file.record.id;row.append(link);$('files').append(row);}}
$('create-file').onsubmit=event=>{event.preventDefault();try{const project=manager.load(id),files=parseWorkspaceFiles(project.source).files,kind=$('kind').value,fileId='f'+crypto.randomUUID().replaceAll('-',''),path=$('path').value.trim();let source,draft=null;
 if(kind==='instance')source=serializeInstanceProject(newInstanceProject());
 else if(kind==='graph')source=JSON.stringify(newFlowProject(fileId,path));
 else if(kind==='ui')source=new UIProjectEditor({schemaVersion:'ems-ui-app/1',id:'project.ui',version:'1.0.0',reactor:{schemaVersion:'ems-reactor/1',id:'project.ui',version:'1.0.0',state:[],handlers:[]},ui:{schemaVersion:'ems-ui/1',root:{id:'root',kind:'column',props:{},events:{},children:[]}}}).source;
 else{const graph=newProject(fileId,path);source=serializeProject(graph);if(kind==='contract'){const entry=$('entry').value.trim();if(!/^[_A-Za-z][_A-Za-z0-9]*(\.[_A-Za-z][_A-Za-z0-9]*)*$/.test(entry))throw Error('Укажите имя контракта EMS');draft=validateStoredDraft({schemaVersion:'ems-studio-text/1',source:'@'+entry.replaceAll('.','::')+'(value:Number)->Number { return value; }',entry,inputs:'{"value":0}',lowering:'auto'});compileTextDraft(draft,new ProjectEditor(graph));}}
 files.push({path,record:{id:fileId,name:path,kind:kind==='instance'?'contract':kind==='ui'?'ui':kind==='graph'?'flow':'graph',source,draft}});manager.save({...project,source:workspaceSource(files)});location.href=new ProjectFileManager(localStorage,id,fileId).url();}catch(error){report(error);}};
try{render();}catch(error){report(error);}
