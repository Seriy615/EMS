import {validateInstanceProject} from './instance-project.mjs';
import {fail} from '../reference/errors.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
import {parseWorkspaceFiles} from './manager.mjs';
import {compileEMSModules,modulePath} from '../frontend/modules.mjs';
import {compileInstanceModules} from '../instances/modules.mjs';
import {parseSourceProject} from './source-project.mjs';
export {parseSourceProject} from './source-project.mjs';
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
