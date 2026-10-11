import {ProjectManager,projectURL} from '../src/studio/manager.mjs';
import {newProject,serializeProject} from '../src/studio/project.mjs';
import {UIProjectEditor} from '../src/studio/ui-project.mjs';
const manager=new ProjectManager(localStorage),$=id=>document.getElementById(id),identity=()=> 'p'+crypto.randomUUID().replaceAll('-','');
const report=error=>{$('error').textContent=(error.code??'HOST_ERROR')+': '+error.message;};
function action(work){return async()=>{try{await work();$('error').textContent='';render();}catch(error){report(error);}};}
function element(tag,text){const node=document.createElement(tag);node.textContent=text;return node;}
function render(){const list=$('project-list');list.replaceChildren();for(const record of manager.list()){
 const row=document.createElement('p'),link=element('a',record.name+' · '+(record.kind==='ui'?'UI / события':'Граф / текст'));link.href=projectURL(record);link.dataset.project=record.id;row.append(link,' ');
 for(const [label,work] of [['Переименовать',()=>manager.rename(record.id,$('name').value)],['Копия',()=>manager.copy(record.id,identity(),record.name.slice(0,185)+' (копия)')],['Экспорт',()=>{const url=URL.createObjectURL(new Blob([manager.export(record.id)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=record.id+'.ems-project.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}],['Удалить',()=>manager.remove(record.id)]]){const button=element('button',label);button.onclick=action(work);row.append(button,' ');}list.append(row);
 }if(!list.children.length)list.textContent='Пока нет проектов.';}
async function create(kind,counter=false){const id=identity(),name=$('name').value;let source;
 if(kind==='graph')source=serializeProject(newProject(id,name));
 else{let app,sources={};if(counter){const response=await fetch('/examples/ui-source-counter.ems-ui.json');if(!response.ok)throw new Error('Cannot load counter');source=await response.text();}else{app={schemaVersion:'ems-ui-app/1',id:'project.ui',version:'1.0.0',reactor:{schemaVersion:'ems-reactor/1',id:'project.ui',version:'1.0.0',state:[],handlers:[]},ui:{schemaVersion:'ems-ui/1',root:{id:'root',kind:'column',props:{},events:{},children:[]}}};source=new UIProjectEditor(app,undefined,{sources}).source;}}
 const record={id,name,kind,source,draft:null};manager.save(record);location.href=projectURL(record);
}
$('new-graph').onclick=action(()=>create('graph'));$('new-ui').onclick=action(()=>create('ui'));$('counter').onclick=action(()=>create('ui',true));
$('import-project').onclick=()=>$('file').click();$('file').onchange=action(async()=>{const file=$('file').files[0];try{if(file){if(file.size>8*1024*1024)throw new Error('File too large');const record=manager.import(await file.text(),identity());$('status').textContent='Импортирована копия: '+record.name;}}finally{$('file').value='';}});
try{render();}catch(error){report(error);}
