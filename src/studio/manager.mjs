import {parseEMSModule} from '../frontend/index.mjs';
import {flowProjectFromSource} from './flow-source.mjs';
import {parseInstanceProject,serializeInstanceProject,importInstanceProject} from './instance-project.mjs';
import {parseFlowProject,serializeFlowProject} from './flow-project.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
import {fail} from '../reference/errors.mjs';
import {parseProject} from './project.mjs';
import {parseUIWorkspace} from '../ui/project.mjs';
import {validateStoredDraft} from './text.mjs';
const key='ems.studio.manager.v1',limit=8*1024*1024;
function fields(value,names){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==names.sort().join(','))fail('INVALID_PROJECT_RECORD','Unexpected project record fields');}
function validate(record){
 fields(record,['id','name','kind','source','draft']);
 if(typeof record.id!=='string'||!/^[_A-Za-z][_A-Za-z0-9]*$/.test(record.id)||typeof record.name!=='string'||!record.name.trim()||record.name.length>200)fail('INVALID_PROJECT_RECORD','Invalid project identity');
 if(record.kind==='graph'){const project=parseProject(record.source);if(project.id!==record.id||project.name!==record.name)fail('INVALID_PROJECT_RECORD','Graph identity differs from catalog');if(record.draft!==null)validateStoredDraft(record.draft);}
 else if(record.kind==='ui'){parseUIWorkspace(record.source,createCoreRegistry());if(record.draft!==null)fail('INVALID_PROJECT_RECORD','UI sources belong to the typed UI project');}
 else if(record.kind==='flow'){const project=parseFlowProject(record.source);if(project.id!==record.id||project.name!==record.name||record.draft!==null)fail('INVALID_PROJECT_RECORD','Contract graph identity differs from catalog');}
 else if(record.kind==='contract'){parseInstanceProject(record.source);if(record.draft!==null)fail('INVALID_PROJECT_RECORD','Contract drafts belong to graph scopes');}
 else if(record.kind==='workspace'){parseWorkspaceFiles(record.source);if(record.draft!==null)fail('INVALID_PROJECT_RECORD','Workspace drafts belong to files');}
 else fail('PROJECT_VERSION','Unsupported project kind');
 return record;
}
/** One validated local catalog. Storage commits are atomic; no program executes on import/list/save. */
export class ProjectManager{
 constructor(storage){this.storage=storage;}
 read(){const source=this.storage.getItem(key);if(source===null)return {schemaVersion:'ems-project-catalog/1',projects:[]};if(source.length>limit)fail('STORAGE_LIMIT','Catalog too large');let data;try{data=JSON.parse(source);}catch{fail('INVALID_STORAGE','Malformed catalog');}fields(data,['schemaVersion','projects']);if(data.schemaVersion!=='ems-project-catalog/1'||!Array.isArray(data.projects)||data.projects.length>50)fail('INVALID_STORAGE','Invalid catalog');const seen=new Set();for(const record of data.projects){validate(record);if(seen.has(record.id))fail('INVALID_STORAGE','Duplicate project identity');seen.add(record.id);}return data;}
 list(){return this.read().projects.map(({id,name,kind})=>({id,name,kind}));}
 load(id){return this.read().projects.find(record=>record.id===id)??null;}
 write(data){const source=JSON.stringify(data);if(data.projects.length>50||source.length>limit)fail('STORAGE_LIMIT','Catalog limit exceeded');this.storage.setItem(key,source);}
 save(record){validate(record);const data=this.read(),index=data.projects.findIndex(item=>item.id===record.id);if(index<0)data.projects.push(record);else data.projects[index]=record;this.write(data);}
 remove(id){const data=this.read();if(!data.projects.some(record=>record.id===id))fail('UNKNOWN_PROJECT','Unknown project');data.projects=data.projects.filter(record=>record.id!==id);this.write(data);}
 copy(id,newId,name){const original=this.load(id);if(!original)fail('UNKNOWN_PROJECT','Unknown project');if(this.load(newId))fail('DUPLICATE_PROJECT','Project already exists');const record={...original,id:newId,name};if(['graph','flow'].includes(record.kind)){const data=JSON.parse(record.source);data.id=newId;data.name=name;record.source=record.kind==='flow'?serializeFlowProject(data):JSON.stringify(data);}this.save(record);return record;}
 rename(id,name){const record=this.load(id);if(!record)fail('UNKNOWN_PROJECT','Unknown project');record.name=name;if(['graph','flow'].includes(record.kind)){const data=JSON.parse(record.source);data.name=name;record.source=record.kind==='flow'?serializeFlowProject(data):JSON.stringify(data);}this.save(record);}
 export(id){const project=this.load(id);if(!project)fail('UNKNOWN_PROJECT','Unknown project');return JSON.stringify({schemaVersion:'ems-project-bundle/1',project},null,2)+'\n';}
 import(source,id){if(typeof source!=='string'||source.length>limit)fail('PROJECT_LIMIT','Bundle too large');let data;try{data=JSON.parse(source);}catch{const ast=parseEMSModule(source),graph=ast.declarations.some(node=>node.body?.kind==='ContractGraph')&&!ast.declarations.some(node=>['StatefulContractDeclaration','ContractInstanceDeclaration','UINodeDeclaration','ApplicationDeclaration'].includes(node.kind));if(graph){const project=flowProjectFromSource(source,createCoreRegistry());data={schemaVersion:'ems-project-bundle/1',project:{id:'imported',name:project.name,kind:'flow',source:serializeFlowProject(project),draft:null}};}else{const project=importInstanceProject(source);data={schemaVersion:'ems-project-bundle/1',project:{id:'imported',name:project.module.id,kind:'contract',source:serializeInstanceProject(project),draft:null}};}}if(['ems-instance-project/1','ems-instance-project/2','ems-instance-module/1'].includes(data?.schemaVersion)){const project=importInstanceProject(source);data={schemaVersion:'ems-project-bundle/1',project:{id:'imported',name:project.module.id,kind:'contract',source:serializeInstanceProject(project),draft:null}};}if(typeof data?.schemaVersion==='string'&&data.schemaVersion.startsWith('ems-studio-project/')){const project=parseProject(source);data={schemaVersion:'ems-project-bundle/1',project:{id:project.id,name:project.name,kind:'graph',source,draft:null}};}else if(['ems-flow-project/1','ems-flow-project/2','ems-flow-project/3'].includes(data?.schemaVersion)){const project=parseFlowProject(source);data={schemaVersion:'ems-project-bundle/1',project:{id:project.id,name:project.name,kind:'flow',source,draft:null}};}else if(['ems-ui-project/1','ems-ui-project/2','ems-ui-project/3','ems-ui-project/4'].includes(data?.schemaVersion)){const workspace=parseUIWorkspace(source,createCoreRegistry());data={schemaVersion:'ems-project-bundle/1',project:{id:'imported',name:workspace.application.id,kind:'ui',source,draft:null}};}fields(data,['schemaVersion','project']);if(data.schemaVersion!=='ems-project-bundle/1')fail('PROJECT_VERSION','Unsupported bundle');validate(data.project);if(this.load(id))fail('DUPLICATE_PROJECT','Import requires a new identity');const record={...data.project,id};if(['graph','flow'].includes(record.kind)){const graph=JSON.parse(record.source);graph.id=id;record.source=record.kind==='flow'?serializeFlowProject(graph):JSON.stringify(graph);}this.save(record);return record;}
}
export const projectURL=record=>(record.kind==='workspace'?'/web/workspace.html':record.kind==='contract'?'/web/contracts.html':record.kind==='flow'?'/web/flow.html':record.kind==='ui'?'/web/ui-demo.html':'/')+'?project='+encodeURIComponent(record.id);

/** A bounded project directory contains real validated documents; nested workspaces are prohibited. */
export function parseWorkspaceFiles(source){
 if(typeof source!=='string'||source.length>limit)fail('PROJECT_LIMIT','Workspace exceeds limit');
 let data;try{data=JSON.parse(source);}catch{fail('INVALID_PROJECT_RECORD','Malformed workspace');}
 fields(data,['schemaVersion','files']);if(data.schemaVersion!=='ems-workspace/1'||!Array.isArray(data.files)||data.files.length>64)fail('PROJECT_VERSION','Unsupported workspace');
 const ids=new Set(),paths=new Set();
 for(const file of data.files){fields(file,['path','record']);if(typeof file.path!=='string'||file.path.length>240||!/^[_A-Za-z0-9][ _A-Za-z0-9./-]*$/.test(file.path)||file.path.split('/').some(part=>!part||part==='.'||part==='..')||paths.has(file.path)||ids.has(file.record?.id)||!['ui','graph','flow','contract'].includes(file.record?.kind))fail('INVALID_PROJECT_FILE','Invalid or duplicate document');validate(file.record);paths.add(file.path);ids.add(file.record.id);}
 return data;
}
export function workspaceSource(files){const source=JSON.stringify({schemaVersion:'ems-workspace/1',files},null,2)+'\n';parseWorkspaceFiles(source);return source;}
/** Editors access a file through the same API while each save preserves current sibling files. */
export class ProjectFileManager{
 constructor(storage,projectId,fileId){this.manager=new ProjectManager(storage);this.projectId=projectId;this.fileId=fileId;this.fileMode=true;}
 files(){const project=this.manager.load(this.projectId);if(project?.kind!=='workspace')fail('UNKNOWN_PROJECT','Workspace not found');return parseWorkspaceFiles(project.source).files;}
 load(id=this.fileId){return this.files().find(file=>file.record.id===id)?.record??null;}
 list(){return this.files().map(file=>({id:file.record.id,name:file.path,kind:file.record.kind}));}
 save(record){validate(record);const project=this.manager.load(this.projectId),files=this.files(),at=files.findIndex(file=>file.record.id===record.id);if(at<0)files.push({path:record.id+(record.kind==='ui'?'.ui.json':record.kind==='contract'?'.contract.json':'.graph.json'),record});else files[at]={...files[at],record};this.manager.save({...project,source:workspaceSource(files)});}
 url(id=this.fileId,route){return (route??(this.load(id)?.kind==='contract'?'/web/contracts.html':this.load(id)?.kind==='ui'?'/web/ui-demo.html':this.load(id)?.kind==='flow'?'/web/flow.html':'/'))+'?project='+encodeURIComponent(this.projectId)+'&file='+encodeURIComponent(id);}
}
export function projectManagerForLocation(storage,search){const params=new URLSearchParams(search),id=params.get('project'),file=params.get('file');return file?new ProjectFileManager(storage,id,file):new ProjectManager(storage);}
