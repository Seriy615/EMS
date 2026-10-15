import {controlBudgetOptions} from '../semantics/control-values.mjs';
import {assertSignal} from '../runtime/cancellation.mjs';
import {fail} from '../reference/errors.mjs';
export function instanceOptions({maxSteps=100000,maxDepth=64,maxQueue=64,recordTrace=false,signal}={}){
 const limits=controlBudgetOptions({maxSteps,maxDepth});assertSignal(signal);
 if(!Number.isSafeInteger(maxQueue)||maxQueue<1||maxQueue>64||typeof recordTrace!=='boolean')fail('INVALID_OPTION','Instance queue must be1..64 and recordTrace Boolean');
 return {...limits,maxQueue,recordTrace};
}
