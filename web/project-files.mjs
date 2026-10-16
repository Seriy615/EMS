import {ProjectManager,workspaceSource,parseWorkspaceFiles} from '../src/studio/manager.mjs';
/** Persistent project navigation; documents remain owned by their original checked editor. */
export function installProjectFiles(){
 const params=new URLSearchParams(location.search),id=params.get('project');if(!id)return;
 const manager=new ProjectManager(localStorage),record=manager.load(id);if(!record)return;
 const link=document.createElement('a');link.id='project-files';link.textContent='Файлы проекта';link.href=(record.kind==='source'?'/web/source-project.html?project=':'/web/workspace.html?project=')+encodeURIComponent(id);
 if(record.kind!=='workspace'&&record.kind!=='source')link.onclick=event=>{event.preventDefault();manager.save({id:record.id,name:record.name,kind:'workspace',draft:null,source:workspaceSource([{path:record.kind==='ui'?'interface.ui.json':record.kind==='contract'?'main.contract.json':'main.graph.json',record}])});location.href=link.href;};
 document.querySelector('.app-header, .ui-header, body>header')?.append(link);
 if(record.kind==='workspace'){const program=parseWorkspaceFiles(record.source).files.find(file=>file.record.kind==='flow'),programLink=document.querySelector('nav a[href="/web/flow.html"]');if(programLink)programLink.href=program?'/web/flow.html?project='+encodeURIComponent(id)+'&file='+encodeURIComponent(program.record.id):link.href;const file=parseWorkspaceFiles(record.source).files.find(file=>file.record.id===params.get('file'));if(file)link.textContent='Файлы · '+file.path;}
}
