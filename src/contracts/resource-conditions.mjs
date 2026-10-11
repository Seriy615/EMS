import { assertControlValueType } from '../semantics/control-algebraic.mjs';
import { checkContractConditions,checkContractFailure } from './conditions.mjs';

/** Enter outer-to-inner boundaries; actual native completion is never cancelled inside these wrappers. */
export async function runResourcePhase(binding,phase,params,operation) {
  const boundaries=binding.resourceBoundaries??[];
  async function invoke(index) {
    if(index===boundaries.length)return operation();
    const spec=boundaries[index].interface,definition=phase==='acquire'?spec:spec.lifecycle[phase];
    const conditions=definition.conditions??{pre:[],post:[]};
    if(phase==='acquire')for(const input of spec.inputs)assertControlValueType(params[input.name],input.type,'resource acquire input');
    checkContractConditions(conditions.pre,params,undefined,'pre',spec.id+'.'+phase);
    try{
      const result=await invoke(index+1);
      if(phase==='read'||phase==='write'){
        assertControlValueType(result,binding.valueType,'resource result');
        checkContractConditions(conditions.post,params,result,'post',spec.id+'.'+phase);
      }
      return result;
    }catch(error){checkContractFailure(error,definition.errors,spec.id+'.'+phase);}
  }
  return invoke(0);
}

/** Factory postconditions run only after the runtime records native ownership, ensuring cleanup on failure. */
export function checkResourceAcquired(binding,params) {
  for(const boundary of [...(binding.resourceBoundaries??[])].reverse()){
    const spec=boundary.interface;
    for(const input of spec.inputs)assertControlValueType(params[input.name],input.type,'resource acquire input');
    checkContractConditions(spec.conditions.post,params,undefined,'post',spec.id+'.acquire');
  }
}
