import {fail} from '../reference/errors.mjs';
const bindings=new WeakMap();
function stateContext(context){if(!context?.state)fail('STATE_CONTEXT','State contracts require an active event transaction');return context.state;}
/** Install kernel-owned state operations. Caller metadata cannot replace their implementation identity. */
export function installStateBindings(registry,slots){
 for(const [id,slot]of slots)for(const action of ['read','write']){
  const execute=action==='read'?(_,context)=>stateContext(context).read(id):({value},context)=>stateContext(context).write(id,value);
  const metadata={id:`state.${id}.${action}`,version:'1.0.0',inputs:action==='read'?{}:{value:slot.type},output:slot.type,effects:[`state.${action}`],capabilities:[`state.${action}`],...(slot.type.includes('<')?{valueProfile:'ems-algebraic/1'}:{})};
  registry.registerAtomic({...metadata,execute});
  bindings.set(execute,{metadata:JSON.stringify(metadata),slot:id,action,type:slot.type});
 }
 return registry;
}
/** Private kernel witness: exact callback, ID/version/signature/policy. This is not source-byte attestation. */
export function stateIntrinsic(contract){
 const binding=bindings.get(contract.execute);if(!binding||contract.kind!=='atomic'||contract.emitJS!==null||contract.interfaceBoundary!==null)return null;
 const metadata={id:contract.id,version:contract.version,inputs:contract.inputs,output:contract.output,effects:contract.effects,capabilities:contract.capabilities,...(contract.valueProfile===undefined?{}:{valueProfile:contract.valueProfile})};
 return JSON.stringify(metadata)===binding.metadata?{abi:contract.valueProfile?'ems-state-algebraic/1':'ems-state-finite/1',slot:binding.slot,action:binding.action,type:binding.type}:null;
}
