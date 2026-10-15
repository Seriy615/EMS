import {validateInstanceModule} from './module.mjs';
import {createInstanceSession} from './runtime.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
import {defaultFlowValue} from '../contracts/flow-values.mjs';
import {validateUITree} from '../ui/model.mjs';
import {UIKernel,checkUIPolicy,createUIRuntimeLink} from '../ui/kernel.mjs';
import {fail} from '../reference/errors.mjs';
/** Logical field paths are typed UI bindings; private storage names never become user identities. */
export function instanceUIBindings(module){
 const fields=module.instances.flatMap(instance=>module.definitions.find(def=>def.id===instance.contract).fields.map(field=>({instance:instance.id,field:field.name,id:instance.id+'.'+field.name,type:field.type}))),actions=module.instances.flatMap(instance=>{const def=module.definitions.find(def=>def.id===instance.contract);return def.transitions.map(action=>({instance:instance.id,name:action.name,id:instance.id+'::'+action.name,signature:{inputs:Object.fromEntries(action.inputs.map(port=>[port.name,{type:port.type}])),output:action.output}}));});return {fields,actions};
}
export function validateInstanceUI(module,ui,base=createCoreRegistry()){
 validateInstanceModule(module,base);const bindings=instanceUIBindings(module),slots=new Map(bindings.fields.map(field=>[field.id,{id:field.id,type:field.type,initial:defaultFlowValue(field.type)}])),handlers=new Map(bindings.actions.map(action=>[action.id,action.signature]));validateUITree(ui,slots,handlers,{rich:true,stateVersion:'ems-reactor/2'});return {bindings,slots,handlers};
}
/** Lifecycle adapter only. Transactions, state, computation and guards belong to the native instance owner. */
export function instanceUILink(module,ui,owner,bindings){
 const state=bindings.fields.map(field=>({id:field.id,type:field.type})),actions=new Map(bindings.actions.map(action=>[action.id,action]));
 const session={snapshot(){const values=owner.snapshot();return Object.fromEntries(bindings.fields.map(field=>[field.id,values[field.instance][field.field]]));},trace:()=>owner.trace(),close:()=>owner.close(),dispatch(event,inputs,options){const action=actions.get(event);if(!action)fail('UNKNOWN_TRANSITION','Unknown UI instance operation');return owner.dispatch(action.instance,action.name,inputs,options);}};
 return createUIRuntimeLink({ui,reactor:{schemaVersion:'ems-reactor/2',state}},session);
}
export async function createInstanceUIRuntime(module,ui,base=createCoreRegistry(),options={}){
 checkUIPolicy(options.policy??{});const {bindings}=validateInstanceUI(module,ui,base),saved=structuredClone({module,ui});const owner=await createInstanceSession(saved.module,base,options);try{return new UIKernel(instanceUILink(saved.module,saved.ui,owner,bindings));}catch(error){await owner.close();throw error;}
}
