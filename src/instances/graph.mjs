import {sourceContractFlow} from '../studio/source-flow.mjs';
import {parseFlowProject,flowProjectOptions} from '../studio/flow-project.mjs';
import {compileContractFlow} from '../compiler/contract-flow.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
import {validateInstanceModule} from './module.mjs';
import {fail} from '../reference/errors.mjs';
/** The existing ordinary graph model edits implementation; the instance linker always reapplies invariants. */
export function transitionFlow(module,instance,name,base=createCoreRegistry()){
 const checked=validateInstanceModule(module,base),action=checked.transitions.find(action=>action.instance===instance&&action.name===name);if(!action)fail('UNKNOWN_TRANSITION','Unknown instance transition');
 return {source:sourceContractFlow({...module.program,entry:action.entry},checked.registry,{allowState:true}),registry:checked.registry,options:{allowState:true}};
}
export function applyTransitionFlow(module,instance,name,source,base=createCoreRegistry()){
 const view=transitionFlow(module,instance,name,base),project=parseFlowProject(source,view.registry,view.options),action=validateInstanceModule(module,base).transitions.find(action=>action.instance===instance&&action.name===name);
 if(project.graph.id!==action.entry)fail('INSTANCE_ENTRY','Graph must preserve the transition entry');
 const functions=new Map(),options=flowProjectOptions(project,view.options);let program;for(const target of validateInstanceModule(module,base).transitions){const bundle=compileContractFlow(project.graph,view.registry,{...options,entry:target.entry});program??=bundle.ir;for(const fn of bundle.ir.functions){const before=functions.get(fn.id);if(before&&JSON.stringify(before)!==JSON.stringify(fn))fail('INSTANCE_FUNCTION_CONFLICT','Graph definitions disagree across transition entries');functions.set(fn.id,fn);}}const next=structuredClone(module);next.program={...program,profile:'ems-control-algebraic/1',entry:action.entry,functions:[...functions.values()]};validateInstanceModule(next,base);return next;
}
export function invariantFlow(module,contract,id,base=createCoreRegistry()){
 const def=validateInstanceModule(module,base).definitions.get(contract),invariant=def?.invariants.find(item=>item.id===id);if(!invariant)fail('UNKNOWN_INVARIANT','Unknown contract invariant');return {source:sourceContractFlow(invariant.program,base),registry:base,options:{}};
}
export function applyInvariantFlow(module,contract,id,source,base=createCoreRegistry()){
 const view=invariantFlow(module,contract,id,base),project=parseFlowProject(source,base),next=structuredClone(module),invariant=next.definitions.find(def=>def.id===contract).invariants.find(item=>item.id===id);if(project.graph.id!==invariant.program.entry)fail('INSTANCE_ENTRY','Graph must preserve the invariant entry');invariant.program=compileContractFlow(project.graph,base,flowProjectOptions(project)).ir;validateInstanceModule(next,base);return next;
}
