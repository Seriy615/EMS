import {createInstanceSession} from '../src/instances/runtime.mjs';
import {createCoreRegistry} from '../src/reference/registry.mjs';
let session,creating=false;
self.onmessage=async({data})=>{
 try{
  let value;
  if(data.action==='create'){if(session||creating)throw Object.assign(Error('Worker already owns an instance module'),{code:'INSTANCE_OWNER'});creating=true;try{session=await createInstanceSession(data.module,createCoreRegistry(),data.options);value=null;}finally{creating=false;}}
  else{if(!session)throw Object.assign(Error('Instance module is not ready'),{code:'INSTANCE_NOT_READY'});if(data.action==='dispatch')value=await session.dispatch(data.instance,data.transition,data.inputs);else throw Object.assign(Error('Unknown instance worker action'),{code:'INVALID_OPTION'});}
  self.postMessage({id:data.id,ok:true,value,snapshot:session.snapshot(),trace:session.trace()});
 }catch(error){self.postMessage({id:data.id,ok:false,error:{code:error.code??'HOST_ERROR',message:error.message,details:error.details??null},...(session?{snapshot:session.snapshot(),trace:session.trace()}:{})});}
};
