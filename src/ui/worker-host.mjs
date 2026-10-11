import {fail} from '../reference/errors.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
import {parseUIProject} from './project.mjs';
import {UIRuntime} from './model.mjs';
const fields=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(','))fail('INVALID_UI_WORKER','Unexpected worker request fields');};
/** Transport endpoint only: all program/state/event semantics remain in UIRuntime/ReactorSession. */
export function createUIWorkerHost(send){
 let runtime=null,initialized=false;let last=-1;
 return async request=>{
  let id=request?.id;
  try{
   if(!Number.isSafeInteger(id)||id<0||id<=last)fail('INVALID_UI_WORKER','Invalid or duplicate request ID');
   if(request.action==='init'){
    fields(request,['action','id','project','policy','maxQueue','recordTrace']);if(initialized)fail('INVALID_UI_WORKER','Worker is already initialized');initialized=true;last=id;
    runtime=new UIRuntime(parseUIProject(request.project,createCoreRegistry()),createCoreRegistry(),{policy:request.policy,maxQueue:request.maxQueue,recordTrace:request.recordTrace});
    send({id,ok:true,value:null,snapshot:runtime.snapshot(),view:runtime.view(),trace:runtime.trace()});return;
   }
   fields(request,['action','id','node','event','value']);if(request.action!=='dispatch'||!runtime)fail('INVALID_UI_WORKER','Expected initialized UI dispatch');last=id;
   const value=await runtime.dispatch(request.node,request.event,request.value);
   send({id,ok:true,value,snapshot:runtime.snapshot(),view:runtime.view(),trace:runtime.trace()});
  }catch(error){
   send({id,ok:false,error:{code:error.code??'HOST_ERROR',message:error.name==='EmsError'?error.message:'UI worker execution failed',details:error.name==='EmsError'?error.details:{}},...(runtime?{snapshot:runtime.snapshot(),view:runtime.view(),trace:runtime.trace()}:{})});
  }
 };
}
