import {checkCancellation} from '../runtime/cancellation.mjs';
import {assertStateValue} from '../runtime/state-values.mjs';
import {instanceOptions} from './options.mjs';
import {ReactorKernel} from '../runtime/reactor-kernel.mjs';
import {executeIR} from '../ir/index.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
import {createWorkBudget} from '../semantics/work-budget.mjs';
import {checkControlPolicy} from '../runtime/control.mjs';
import {validateInstanceModule,linkInstanceBoundary} from './module.mjs';
import {instanceSlot,instanceEvent} from './names.mjs';
/** Public identity/lifetime adapter. Computation and transaction ownership stay in IR/ReactorKernel. */
export class InstanceSession{
 #session;#layout;
 constructor(session,layout){this.#session=session;this.#layout=structuredClone(layout);}
 snapshot(){const values=this.#session.snapshot();return Object.fromEntries(this.#layout.map(instance=>[instance.id,Object.fromEntries(instance.fields.map(field=>[field,values[instanceSlot(instance.id,field)]]))]));}
 dispatch(instance,transition,inputs={},options={}){const owner=this.#layout.find(item=>item.id===instance);if(!owner?.transitions.includes(transition))return Promise.reject(Object.assign(Error('Unknown instance transition'),{code:'UNKNOWN_TRANSITION'}));return this.#session.dispatch(instanceEvent(instance,transition),inputs,options);}
 trace(){return this.#session.trace();}
 close(){return this.#session.close();}
}
export function instanceLayout(module){return module.instances.map(instance=>{const def=module.definitions.find(def=>def.id===instance.contract);return {id:instance.id,fields:def.fields.map(field=>field.name),transitions:def.transitions.map(action=>action.name)};});}
/** Initializers and creation invariants share one bounded work ledger, before an instance becomes observable. */
export async function createInstanceSession(module,base=createCoreRegistry(),{policy={},maxSteps=100000,maxDepth=64,maxQueue=64,recordTrace=false,signal}={}){
 validateInstanceModule(module,base);module=structuredClone(module);const checked=validateInstanceModule(module,base),limits=instanceOptions({maxSteps,maxDepth,maxQueue,recordTrace,signal}),initial=linkInstanceBoundary(module,null,base,{initial:true}),workBudget=createWorkBudget(limits.maxSteps),values={};
 const linked=checked.transitions.map(action=>({action,bundle:linkInstanceBoundary(module,action,base)}));
 for(const {bundle}of linked)checkControlPolicy(bundle.ir.functions.find(fn=>fn.id===bundle.ir.entry).policy,policy);
 await Promise.resolve();checkCancellation(signal);
 for(const item of checked.initials){values[item.slot]=await executeIR(item.program,{},base,{...limits,workBudget,signal,capabilities:[],allowedEffects:[]});assertStateValue(values[item.slot],item.type,'state.'+item.slot,'ems-reactor/2');}
 await executeIR(initial.ir,values,initial.registry,{...limits,workBudget,signal,capabilities:[],allowedEffects:[]});
 const state=checked.slots.map(slot=>({...slot,initial:values[slot.id]}));
 // executeIR owns the body+invariant ledger because both are linked into each handler's single program.
 const handlers=linked.map(({action,bundle})=>({event:instanceEvent(action.instance,action.name),inputs:bundle.ir.functions.find(fn=>fn.id===bundle.ir.entry).inputs,checkPolicy:grants=>checkControlPolicy(bundle.ir.functions.find(fn=>fn.id===bundle.ir.entry).policy,grants),execute:(inputs,options)=>executeIR(bundle.ir,inputs,bundle.registry,{...options,...limits})}));
 const session=new ReactorKernel(state,handlers,{policy,maxQueue,recordTrace,stateVersion:'ems-reactor/2'});
 return new InstanceSession(session,instanceLayout(module));
}
