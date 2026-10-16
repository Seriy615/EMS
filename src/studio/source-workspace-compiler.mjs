import {compileWorkspaceModule,compileWorkspaceApplication} from './workspace-modules.mjs';
import {parseSourceProject} from './source-project.mjs';
import {parseEMSModule} from '../frontend/index.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
import {fail} from '../reference/errors.mjs';
/** Dispatch on explicit source declarations, never on a failed compilation fallback. */
export function compileSourceWorkspace(source,{mode='auto',entry='Main'}={},registry=createCoreRegistry()){
 if(!['auto','pure','native'].includes(mode)||typeof entry!=='string'||entry.length>200)fail('SOURCE_PROJECT_OPTIONS','Invalid source compilation options');
 const project=parseSourceProject(source);let ast;try{ast=parseEMSModule(project.sources.get(project.entry),{maxTokens:20000,maxDepth:128});}catch(error){error.details={...error.details,file:project.entry};throw error;}
 const native=mode==='native'||mode==='auto'&&ast.declarations.some(node=>['ContractInstanceDeclaration','ApplicationDeclaration','UINodeDeclaration'].includes(node.kind));
 return native?{kind:'native',bundle:compileWorkspaceApplication(source,undefined,registry)}:{kind:'pure',bundle:compileWorkspaceModule(source,undefined,entry,registry)};
}
