import {validateInstanceProject} from './instance-project.mjs';
import {fail} from '../reference/errors.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
import {parseWorkspaceFiles} from './manager.mjs';
import {compileEMSModules,modulePath} from '../frontend/modules.mjs';
import {compileInstanceModules} from '../instances/modules.mjs';
const limit=4*1024*1024;
function fields(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(','))fail('INVALID_SOURCE_PROJECT','Unexpected source project fields');}
/** A source project is compiler input, distinct from a compiled module or an editor canvas. */
export function parseSourceProject(source){
 if(typeof source!=='string'||source.length>limit)fail('MODULE_LIMIT','Source project exceeds 4 MiB');let data;try{data=JSON.parse(source);}catch{fail('INVALID_SOURCE_PROJECT','Malformed source project');}
 fields(data,['schemaVersion','entry','files']);if(data.schemaVersion!=='ems-source-project/1'||!Array.isArray(data.files)||!data.files.length||data.files.length>64)fail('INVALID_SOURCE_PROJECT','Unsupported source project');
 const sources=new Map();let bytes=0;for(const file of data.files){fields(file,['path','source']);const path=modulePath(file.path);if(path!==file.path||sources.has(path)||typeof file.source!=='string')fail('INVALID_SOURCE_PROJECT','Invalid source file identity');if(file.source.length>1048576||(bytes+=new TextEncoder().encode(file.source).length)>1048576)fail('MODULE_LIMIT','Source text exceeds 1 MiB');sources.set(path,file.source);}
 const entry=modulePath(data.entry);if(entry!==data.entry||!sources.has(entry))fail('MISSING_MODULE','Source project entry is absent',{file:entry});return {entry,sources};
}
/** Resolve only actual text documents in this supplied snapshot; archives are never current source. */
export function workspaceModuleSources(source,file){
 if(typeof source!=='string'||source.length>8*1024*1024)fail('MODULE_LIMIT','Project snapshot exceeds limit');let data;try{data=JSON.parse(source);}catch{fail('INVALID_SOURCE_PROJECT','Malformed project snapshot');}
 if(data.schemaVersion==='ems-source-project/1'){const parsed=parseSourceProject(source),entry=file??parsed.entry;if(!parsed.sources.has(entry))fail('MISSING_MODULE','Entry source file is absent',{file:entry});return {...parsed,entry};}
 if(data.schemaVersion==='ems-project-bundle/1'&&data.project?.kind==='workspace')return workspaceModuleSources(data.project.source,file);
 const documents=parseWorkspaceFiles(source).files,root=documents.find(document=>document.path===file);
 if(root?.record.kind!=='graph'||!root.record.draft)fail('MODULE_SOURCE_REQUIRED','Select a file with an actual EMS text draft; compiled documents and archives are not source modules',{file});
 return {entry:file,defaultEntry:root.record.draft.entry,sources:new Map(documents.filter(document=>document.record.kind==='graph'&&document.record.draft).map(document=>[document.path,document.record.draft.source]))};
}
export function compileWorkspaceModule(source,file,entry,registry=createCoreRegistry(),options={}){
 const context=workspaceModuleSources(source,file);return compileEMSModules(context.sources,context.entry,entry??context.defaultEntry??'Main',registry,options);
}
export function compileWorkspaceApplication(source,file,registry=createCoreRegistry(),options={}){
 const context=workspaceModuleSources(source,file),compiled=compileInstanceModules(context.sources,context.entry,registry,options);
 const project={schemaVersion:compiled.authoredGraphs?'ems-instance-project/3':compiled.ui?'ems-instance-project/2':'ems-instance-project/1',module:compiled.module,sourceArchive:null,bodyGraph:null,invariantGraphs:[],...(compiled.ui?{ui:compiled.ui}:{}),...(compiled.authoredGraphs?{authoredGraphs:compiled.authoredGraphs}:{})};
 validateInstanceProject(project,registry);return {...compiled,project};
}
