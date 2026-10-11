import {fail} from '../reference/errors.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
import {compileUIHandler} from './source.mjs';
import {GraphStepper} from '../studio/debugger.mjs';
import {parseUIWorkspace} from './project.mjs';
import {UIRuntime} from './model.mjs';
const fields=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(','))fail('INVALID_UI_WORKER','Unexpected worker request fields');};
/** Transport endpoint only: all program/state/event semantics remain in UIRuntime/ReactorSession. */
export function createUIWorkerHost(send){
 let runtime=null,initialized=false,debug=false,workspace,maps=new Map();let last=-1;const gates=new Map(),nodes=new Map();
 return async request=>{
  let id=request?.id;
  if(request?.action==='resume'){
   if(!debug)return;
   try{fields(request,['action','id','token','mode']);gates.get(id)?.resume(request.token,request.mode);}catch{}return;
  }
  try{
   if(!Number.isSafeInteger(id)||id<0||id<=last)fail('INVALID_UI_WORKER','Invalid or duplicate request ID');
   if(request.action==='init'){
    fields(request,['action','id','project','policy','maxQueue','recordTrace',...(Object.hasOwn(request,'debug')?['debug']:[])]);if(Object.hasOwn(request,'debug')&&typeof request.debug!=='boolean')fail('INVALID_UI_WORKER','Invalid debug mode');debug=request.debug??false;if(initialized)fail('INVALID_UI_WORKER','Worker is already initialized');initialized=true;last=id;
    const base=createCoreRegistry();workspace=parseUIWorkspace(request.project,base);
    if(debug){for(const [event,draft]of Object.entries(workspace.sources))maps.set(event,compileUIHandler(draft.source,draft.entry,workspace.application,base).provenance);function visit(node){nodes.set(node.id,node);node.children.forEach(visit);}visit(workspace.application.ui.root);}
    runtime=new UIRuntime(workspace.application,base,{policy:request.policy,maxQueue:request.maxQueue,recordTrace:request.recordTrace});
    send({id,ok:true,value:null,snapshot:runtime.snapshot(),view:runtime.view(),trace:runtime.trace()});return;
   }
   fields(request,['action','id','node','event','value']);if(request.action!=='dispatch'||!runtime)fail('INVALID_UI_WORKER','Expected initialized UI dispatch');last=id;
   let observe;
   if(debug){
    const handler=nodes.get(request.node)?.events[request.event]?.handler;
    const gate=new GraphStepper(pause=>send({id,type:'paused',pause:{...pause,handler}}));gates.set(id,gate);
    observe=event=>{const call=event.callPath?.at(-1),fn=event.function??call?.graph,node=event.node??call?.node;return gate.enter({...event,location:structuredClone(maps.get(handler)?.functions[fn]?.nodes?.[node]??null)});};
   }
   const value=await runtime.dispatch(request.node,request.event,request.value,{onControlEnter:observe,onNodeEnter:observe});
   gates.delete(id);
   send({id,ok:true,value,snapshot:runtime.snapshot(),view:runtime.view(),trace:runtime.trace()});
  }catch(error){
   gates.delete(id);send({id,ok:false,error:{code:error.code??'HOST_ERROR',message:error.name==='EmsError'?error.message:'UI worker execution failed',details:error.name==='EmsError'?error.details:{}},...(runtime?{snapshot:runtime.snapshot(),view:runtime.view(),trace:runtime.trace()}:{})});
  }
 };
}
