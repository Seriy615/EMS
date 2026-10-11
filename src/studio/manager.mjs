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
 copy(id,newId,name){const original=this.load(id);if(!original)fail('UNKNOWN_PROJECT','Unknown project');if(this.load(newId))fail('DUPLICATE_PROJECT','Project already exists');const record={...original,id:newId,name};if(record.kind==='graph'){const data=JSON.parse(record.source);data.id=newId;data.name=name;record.source=JSON.stringify(data);}this.save(record);return record;}
 rename(id,name){const record=this.load(id);if(!record)fail('UNKNOWN_PROJECT','Unknown project');record.name=name;if(record.kind==='graph'){const data=JSON.parse(record.source);data.name=name;record.source=JSON.stringify(data);}this.save(record);}
 export(id){const project=this.load(id);if(!project)fail('UNKNOWN_PROJECT','Unknown project');return JSON.stringify({schemaVersion:'ems-project-bundle/1',project},null,2)+'\n';}
 import(source,id){if(typeof source!=='string'||source.length>limit)fail('PROJECT_LIMIT','Bundle too large');let data;try{data=JSON.parse(source);}catch{fail('INVALID_PROJECT_RECORD','Malformed bundle');}if(typeof data?.schemaVersion==='string'&&data.schemaVersion.startsWith('ems-studio-project/')){const project=parseProject(source);data={schemaVersion:'ems-project-bundle/1',project:{id:project.id,name:project.name,kind:'graph',source,draft:null}};}else if(['ems-ui-project/1','ems-ui-project/2'].includes(data?.schemaVersion)){const workspace=parseUIWorkspace(source,createCoreRegistry());data={schemaVersion:'ems-project-bundle/1',project:{id:'imported',name:workspace.application.id,kind:'ui',source,draft:null}};}fields(data,['schemaVersion','project']);if(data.schemaVersion!=='ems-project-bundle/1')fail('PROJECT_VERSION','Unsupported bundle');validate(data.project);if(this.load(id))fail('DUPLICATE_PROJECT','Import requires a new identity');const record={...data.project,id};if(record.kind==='graph'){const graph=JSON.parse(record.source);graph.id=id;record.source=JSON.stringify(graph);}this.save(record);return record;}
}
export const projectURL=record=>(record.kind==='ui'?'/web/ui-demo.html':'/')+'?project='+encodeURIComponent(record.id);
