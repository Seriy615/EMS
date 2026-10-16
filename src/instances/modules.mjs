import {linkEMSModules,withModuleDiagnostics} from '../frontend/modules.mjs';
import {compileInstanceSourceAST} from './ui-source.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
/** Link source libraries into a native application; never run initializers during compilation. */
export function compileInstanceModules(sources,entryPath,base=createCoreRegistry(),options={}){
 const linked=linkEMSModules(sources,entryPath,options),sourceBindings=[];
 return withModuleDiagnostics(linked,()=>({...compileInstanceSourceAST(linked.ast,base,{...options,sourceBindings}),modules:linked.modules,sourceBindings,source:linked.source}));
}
