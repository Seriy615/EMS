import {createCoreRegistry} from '../reference/registry.mjs';
import {createStateRegistry} from '../runtime/reactor.mjs';
import {parseUIWorkspace} from './project.mjs';
import {compileUIHandler} from './source.mjs';
import {normalizeUIDebugOptions,checkUIDebugOptions} from './debug-policy.mjs';
import {controlNodeEntries} from '../ir/control-addresses.mjs';
import {graphFromIR} from '../ir/index.mjs';
import {validateDiagnosticPause} from '../studio/inspection-transport.mjs';
import {fail} from '../reference/errors.mjs';

/** Reconstruct handler semantics locally. Debug transport never grants speculative state or values. */
export function prepareUIDebugTransport(project,options){
 const base=createCoreRegistry(),workspace=parseUIWorkspace(project,base),registry=createStateRegistry(base,workspace.application.reactor.state,workspace.application.reactor.schemaVersion),bundles=new Map(),handlers=new Map(),nodes=new Map();
 for(const [event,draft]of Object.entries(workspace.sources))bundles.set(event,compileUIHandler(draft.source,draft.entry,workspace.application,base));
 const checked=checkUIDebugOptions(options,workspace,bundles);
 for(const handler of workspace.application.reactor.handlers){
  const bundle=bundles.get(handler.event)??{ir:handler.program,registry,provenance:{functions:{}}},prepared={bundle,registry:bundle.registry,afterOperations:checked.afterOperations===true};
  if(bundle.ir.schemaVersion==='ems-ir/2')prepared.functions=new Map(bundle.ir.functions.map(fn=>[fn.id,{fn,nodes:new Map(controlNodeEntries(fn))}]));
  else{prepared.root=graphFromIR(bundle.ir,bundle.registry);prepared.graphs=new Map();function visit(graph){if(prepared.graphs.has(graph.id))return;prepared.graphs.set(graph.id,{graph});for(const node of graph.nodes){const target=bundle.registry.resolve(node.uses);if(target.kind==='composite')visit(target.graph);}}visit(prepared.root);}
  handlers.set(handler.event,prepared);
 }
 function visit(node){nodes.set(node.id,node);node.children.forEach(visit);}visit(workspace.application.ui.root);
 return {handlers,nodes,options:checked};
}
export function validateUIDebugPause(pause,prepared,handler){
 if(!pause||typeof pause!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(pause))||!Object.hasOwn(pause,'handler')||Reflect.ownKeys(pause).some(key=>!Object.hasOwn(Object.getOwnPropertyDescriptor(pause,key),'value'))||pause.handler!==handler||!prepared.handlers.has(handler))fail('INVALID_UI_DEBUG_PAUSE','Invalid UI operation pause');
 const {handler:ignored,...metadata}=pause;const result=validateDiagnosticPause(metadata,prepared.handlers.get(handler));
 if(result.profile==='control'){const owner=prepared.handlers.get(handler);if(result.callStack[0]!==owner.bundle.ir.entry||result.callStack.length!==result.frames.length)fail('INVALID_UI_DEBUG_PAUSE','Wrong handler root/frame depth');for(let i=1;i<result.callStack.length;i++)if(![...owner.functions.get(result.callStack[i-1]).nodes.values()].some(node=>node.kind==='call'&&node.target.kind==='function'&&node.target.id===result.callStack[i]))fail('INVALID_UI_DEBUG_PAUSE','Wrong handler call edge');}
 return {...result,handler};
}
