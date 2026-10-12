import {fail} from '../reference/errors.mjs';

/** Execution-owned cumulative work ledger. Trusted same-realm protocol, not a sandbox. */
export function createWorkBudget(maxWork=100000,parent=null){
 if(!Number.isSafeInteger(maxWork)||maxWork<1)fail('INVALID_BUDGET','Expected positive safe integer work limit');
 if(parent!==null)assertWorkBudget(parent);
 let remaining=maxWork,exhausted=false;
 const budget=Object.freeze({schemaVersion:'ems-work-budget/1',charge(count=1){
  if(!Number.isSafeInteger(count)||count<1)fail('INVALID_BUDGET','Expected positive safe integer work charge');
  if(exhausted||count>remaining){remaining=0;exhausted=true;fail('STEP_LIMIT','Shared execution work exhausted',{maxWork});}
  if(parent!==null)try{parent.charge(count);}catch(error){if(error?.code==='STEP_LIMIT'){remaining=0;exhausted=true;}throw error;}
  remaining-=count;
 },fork(limit){return createWorkBudget(limit,budget);},snapshot(){return Object.freeze({maxWork,remaining,exhausted});}});
 return budget;
}

/** Validate protocol structure before use; host authenticity is outside this boundary. */
export function assertWorkBudget(value){
 if(!value||typeof value!=='object'||!Object.isFrozen(value)||Reflect.ownKeys(value).length!==4)fail('INVALID_BUDGET','Invalid work budget protocol');
 const schema=Object.getOwnPropertyDescriptor(value,'schemaVersion'),charge=Object.getOwnPropertyDescriptor(value,'charge'),snapshot=Object.getOwnPropertyDescriptor(value,'snapshot'),fork=Object.getOwnPropertyDescriptor(value,'fork');
 if(schema?.value!=='ems-work-budget/1'||typeof charge?.value!=='function'||typeof snapshot?.value!=='function'||typeof fork?.value!=='function')fail('INVALID_BUDGET','Invalid work budget protocol');
 return value;
}
