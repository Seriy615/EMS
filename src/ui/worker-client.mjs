import {EmsError,fail} from '../reference/errors.mjs';
import {assertSignal} from '../runtime/cancellation.mjs';
const copy=value=>structuredClone(value);
/** Persistent worker preview. Deadline/Stop terminates the session; only acknowledged snapshots remain visible. */
export async function createUIWorkerRuntime(project,{policy={},timeout=5000,initTimeout=5000,maxQueue=64,recordTrace=false,debug=false,onPause=()=>{},onDebugEnd=()=>{},workerFactory=()=>new Worker('/web/ui-worker.mjs',{type:'module'})}={}){
 if(!Number.isSafeInteger(timeout)||timeout<1||timeout>60000||!Number.isSafeInteger(initTimeout)||initTimeout<1||initTimeout>60000||!Number.isSafeInteger(maxQueue)||maxQueue<1||maxQueue>64||typeof recordTrace!=='boolean'||typeof debug!=='boolean'||typeof onPause!=='function'||typeof onDebugEnd!=='function'||typeof workerFactory!=='function')fail('INVALID_UI_WORKER','Invalid bounded worker options');
 let worker;try{worker=workerFactory();}catch{fail('EXECUTION_WORKER','Cannot create UI worker');}
 if(!worker||typeof worker.postMessage!=='function'||typeof worker.terminate!=='function')fail('EXECUTION_WORKER','Invalid UI worker transport');
 const pending=new Map();let next=0,closed=false,closing,snapshot,view,trace=[],pause=null;
 function stop(error){
  if(closed)return closing;closed=true;pause=null;worker.onmessage=null;worker.onerror=null;
  for(const [id,item] of pending){clearTimeout(item.timer);item.signal?.removeEventListener('abort',item.abort);if(debug&&item.action==='dispatch')try{onDebugEnd({eventId:id,ok:false,code:error.code});}catch{}item.reject(error);}pending.clear();
  try{closing=Promise.resolve(worker.terminate());}catch{closing=Promise.resolve();}return closing;
 }
 function request(payload,signal,duration=timeout){
  assertSignal(signal);if(closed)return Promise.reject(new EmsError('SESSION_CLOSED','UI worker session is closed'));if(signal?.aborted)return Promise.reject(new EmsError('CANCELLED','UI event cancelled before dispatch'));
  if(pending.size>=maxQueue+1)return Promise.reject(new EmsError('QUEUE_FULL','UI worker request queue is full'));
  const id=next++;
  return new Promise((resolve,reject)=>{
   const abort=()=>stop(new EmsError('CANCELLED','UI preview stopped'));
   const timer=setTimeout(()=>stop(new EmsError('EXECUTION_TIMEOUT','UI preview exceeded its execution deadline')),duration);
   pending.set(id,{resolve,reject,timer,signal,abort,action:payload.action});signal?.addEventListener('abort',abort,{once:true});
   try{worker.postMessage({id,...payload});}catch{stop(new EmsError('INVALID_EXECUTION','UI request cannot be transferred'));}
  });
 }
 worker.onmessage=event=>{
  if(closed)return;const data=event.data,item=pending.get(data?.id);if(!item)return;
  if(data.type==='paused'){
   const control=data.pause?.profile==='control',keys=control?['phase','profile','function','node','kind','type','callStack','frames','step','location','token','handler']:['phase','callPath','frames','inputs','output','effects','capabilities','location','token','handler'];
   if(!debug||Object.keys(data).sort().join(',')!=='id,pause,type'||!data.pause||Reflect.ownKeys(data.pause).length!==keys.length||keys.some(key=>!Object.hasOwn(data.pause,key))||(!Array.isArray(data.pause.frames)||!data.pause.frames.length||data.pause.frames.length>64||data.pause.frames.some(frame=>!Number.isSafeInteger(frame)||frame<1)||new Set(data.pause.frames).size!==data.pause.frames.length)||data.pause.phase!=='enter'||!Number.isSafeInteger(data.pause.token)||data.pause.token<1||typeof data.pause.handler!=='string'){stop(new EmsError('EXECUTION_WORKER','Malformed UI debug pause'));return;}
   pause={id:data.id,token:data.pause.token};try{onPause(copy({...data.pause,eventId:data.id}));}catch{}return;
  }
  if(pause?.id===data.id)pause=null;
  if(typeof data.ok!=='boolean'||data.ok&&(!Object.hasOwn(data,'value')||data.snapshot===undefined||data.view===undefined)||!data.ok&&typeof data.error?.code!=='string'){stop(new EmsError('EXECUTION_WORKER','Malformed UI worker reply'));return;}
  if(data.snapshot!==undefined&&data.view!==undefined){snapshot=copy(data.snapshot);view=copy(data.view);}
  if(Array.isArray(data.trace))trace=copy(data.trace);
  pending.delete(data.id);clearTimeout(item.timer);item.signal?.removeEventListener('abort',item.abort);
  if(debug&&item.action==='dispatch')try{onDebugEnd({eventId:data.id,ok:data.ok,...(!data.ok?{code:data.error.code}:{})});}catch{}
  data.ok?item.resolve(data.value):item.reject(new EmsError(data.error.code,data.error.message,data.error.details));
 };
 worker.onerror=()=>stop(new EmsError('EXECUTION_WORKER','UI worker failed'));
 try{await request({action:'init',project,policy,maxQueue,recordTrace,...(debug?{debug:true}:{})},undefined,initTimeout);if(snapshot===undefined||view===undefined)throw new EmsError('EXECUTION_WORKER','Missing UI worker initialization snapshot');}catch(error){await stop(error);throw error;}
 return Object.freeze({snapshot:()=>copy(snapshot),view:()=>copy(view),trace:()=>copy(trace),resume:(mode='step')=>{if(closed||!pause||!['step','continue','over','out'].includes(mode))return false;const current=pause;pause=null;try{worker.postMessage({action:'resume',id:current.id,token:current.token,mode});}catch{stop(new EmsError('INVALID_EXECUTION','UI debug command cannot be transferred'));return false;}return true;},dispatch:async(node,event,value,{signal}={})=>request({action:'dispatch',node,event,value},signal),close:()=>stop(new EmsError('CANCELLED','UI preview closed')),get closed(){return closed;}});
}
