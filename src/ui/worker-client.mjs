import {prepareUIDebugTransport,validateUIDebugPause} from './debug-transport.mjs';
import {normalizeUIDebugOptions} from './debug-policy.mjs';
import {EmsError,fail} from '../reference/errors.mjs';
import {assertSignal} from '../runtime/cancellation.mjs';
import {UI_WORKER_PROTOCOL} from './worker-protocol.mjs';
const copy=value=>structuredClone(value);
const browserWorkerFactory=()=>new Worker('/web/ui-worker.mjs',{type:'module'});
/** Persistent worker preview. Deadline/Stop terminates the session; only acknowledged snapshots remain visible. */
export async function createUIWorkerRuntime(project,{policy={},timeout=5000,initTimeout=5000,maxQueue=64,recordTrace=false,debug=false,debugOptions,onPause=()=>{},onDebugEnd=()=>{},workerFactory=browserWorkerFactory,waitForReady=workerFactory===browserWorkerFactory,loadTimeout=5000,signal}={}){
 assertSignal(signal);
 if(!Number.isSafeInteger(loadTimeout)||loadTimeout<1||loadTimeout>60000||typeof waitForReady!=='boolean')fail('INVALID_UI_WORKER','Invalid bounded worker loading options');
 if(!Number.isSafeInteger(timeout)||timeout<1||timeout>60000||!Number.isSafeInteger(initTimeout)||initTimeout<1||initTimeout>60000||!Number.isSafeInteger(maxQueue)||maxQueue<1||maxQueue>64||typeof recordTrace!=='boolean'||typeof debug!=='boolean'||typeof onPause!=='function'||typeof onDebugEnd!=='function'||typeof workerFactory!=='function')fail('INVALID_UI_WORKER','Invalid bounded worker options');
 if(debugOptions!==undefined&&!debug)fail('INVALID_DEBUG_OPTION','UI policy requires debug mode');
 const checkedDebugOptions=debugOptions===undefined?undefined:normalizeUIDebugOptions(debugOptions);
 const preparedDebug=debug?prepareUIDebugTransport(project,checkedDebugOptions):null;
 if(signal?.aborted)fail('CANCELLED','UI preview cancelled before loading');
 let worker;try{worker=workerFactory();}catch{fail('EXECUTION_WORKER','Cannot create UI worker');}
 if(!worker||typeof worker.postMessage!=='function'||typeof worker.terminate!=='function')fail('EXECUTION_WORKER','Invalid UI worker transport');
 let loading=waitForReady,loadTimer,resolveReady,rejectReady;
 const ready=waitForReady?new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;}):Promise.resolve();
 const pending=new Map();let next=0,closed=false,closing,terminalError,snapshot,view,trace=[],pause=null;
 function stop(error){
  if(closed)return closing;terminalError=error;closed=true;pause=null;worker.onmessage=null;worker.onerror=null;
  clearTimeout(loadTimer);signal?.removeEventListener('abort',abortPreview);if(loading){loading=false;rejectReady(error);}
  for(const [id,item] of pending){clearTimeout(item.timer);item.signal?.removeEventListener('abort',item.abort);if(debug&&item.action==='dispatch')try{onDebugEnd({eventId:id,ok:false,code:error.code});}catch{}item.reject(error);}pending.clear();
  try{closing=Promise.resolve(worker.terminate());}catch{closing=Promise.resolve();}return closing;
 }
 function request(payload,signal,duration=timeout){
  assertSignal(signal);if(closed)return Promise.reject(new EmsError('SESSION_CLOSED','UI worker session is closed'));if(signal?.aborted)return Promise.reject(new EmsError('CANCELLED','UI event cancelled before dispatch'));
  if(pending.size>=maxQueue+1)return Promise.reject(new EmsError('QUEUE_FULL','UI worker request queue is full'));
  const id=next++;
  return new Promise((resolve,reject)=>{
   const abort=()=>stop(new EmsError('CANCELLED','UI preview stopped'));
   const timer=setTimeout(()=>stop(new EmsError('EXECUTION_TIMEOUT','UI preview exceeded its execution deadline',{phase:payload.action==='init'?'initialization':'execution'})),duration);
   pending.set(id,{resolve,reject,timer,signal,abort,action:payload.action,handler:preparedDebug?.nodes.get(payload.node)?.events[payload.event]?.handler,lastPauseToken:0});signal?.addEventListener('abort',abort,{once:true});
   try{worker.postMessage({id,...payload});}catch{stop(new EmsError('INVALID_EXECUTION','UI request cannot be transferred'));}
  });
 }
 worker.onmessage=event=>{
  if(closed)return;const data=event.data;
  if(loading){
   const keys=data&&typeof data==='object'?Reflect.ownKeys(data):[];
   if(keys.length!==2||!keys.includes('type')||!keys.includes('protocol')||keys.some(key=>!Object.hasOwn(Object.getOwnPropertyDescriptor(data,key),'value'))||data.type!=='ready'||data.protocol!==UI_WORKER_PROTOCOL){stop(new EmsError('EXECUTION_WORKER','Invalid UI worker readiness protocol',{phase:'loading'}));return;}
   loading=false;clearTimeout(loadTimer);resolveReady();return;
  }
  if(waitForReady&&data?.type==='ready'){stop(new EmsError('EXECUTION_WORKER','Duplicate UI worker readiness message'));return;}
  const item=pending.get(data?.id);if(!item)return;
  if(data.type==='paused'){
   let checked;
   try{if(!debug||item.action!=='dispatch'||Object.keys(data).sort().join(',')!=='id,pause,type'||Reflect.ownKeys(data).length!==3||Reflect.ownKeys(data).some(key=>!Object.hasOwn(Object.getOwnPropertyDescriptor(data,key),'value'))||pause!==null)throw Error();checked=validateUIDebugPause(data.pause,preparedDebug,item.handler);if(checked.token<=item.lastPauseToken)throw Error();}catch{stop(new EmsError('EXECUTION_WORKER','Malformed UI debug pause'));return;}
   item.lastPauseToken=checked.token;pause={id:data.id,token:checked.token};try{onPause(copy({...checked,eventId:data.id}));}catch{}return;
  }
  if(pause?.id===data.id)pause=null;
  if(typeof data.ok!=='boolean'||data.ok&&(!Object.hasOwn(data,'value')||data.snapshot===undefined||data.view===undefined)||!data.ok&&typeof data.error?.code!=='string'){stop(new EmsError('EXECUTION_WORKER','Malformed UI worker reply'));return;}
  if(data.snapshot!==undefined&&data.view!==undefined){snapshot=copy(data.snapshot);view=copy(data.view);}
  if(Array.isArray(data.trace))trace=copy(data.trace);
  pending.delete(data.id);clearTimeout(item.timer);item.signal?.removeEventListener('abort',item.abort);
  if(debug&&item.action==='dispatch')try{onDebugEnd({eventId:data.id,ok:data.ok,...(!data.ok?{code:data.error.code}:{})});}catch{}
  data.ok?item.resolve(data.value):item.reject(new EmsError(data.error.code,data.error.message,data.error.details));
 };
 worker.onerror=()=>stop(new EmsError('EXECUTION_WORKER','UI worker failed',{phase:loading?'loading':snapshot===undefined?'initialization':'execution'}));
 function abortPreview(){stop(new EmsError('CANCELLED','UI preview stopped'));}
 if(waitForReady)loadTimer=setTimeout(()=>stop(new EmsError('UI_WORKER_LOAD_TIMEOUT','Не удалось загрузить среду выполнения интерфейса вовремя. Попробуйте запустить её снова.',{phase:'loading'})),loadTimeout);
 signal?.addEventListener('abort',abortPreview,{once:true});if(signal?.aborted)abortPreview();
 try{if(waitForReady)await ready;if(closed)throw terminalError;if(signal?.aborted)throw new EmsError('CANCELLED','UI preview stopped');await request({action:'init',project,policy,maxQueue,recordTrace,...(debug?{debug:true,...(checkedDebugOptions?{debugOptions:checkedDebugOptions}:{})}:{})},undefined,initTimeout);if(closed)throw terminalError;if(snapshot===undefined||view===undefined)throw new EmsError('EXECUTION_WORKER','Missing UI worker initialization snapshot');}catch(error){await stop(error);throw error;}
 return Object.freeze({setDebugOptions:options=>{if(closed||!debug||!pause)return false;const checked=normalizeUIDebugOptions(options);if((checked.afterOperations===true)!==(preparedDebug.options.afterOperations===true))return false;try{worker.postMessage({action:'debug-policy',id:pause.id,token:pause.token,options:checked});}catch{stop(new EmsError('INVALID_EXECUTION','UI debug policy cannot be transferred'));return false;}return true;},snapshot:()=>copy(snapshot),view:()=>copy(view),trace:()=>copy(trace),resume:(mode='step')=>{if(closed||!pause||!['step','continue','over','out'].includes(mode))return false;const current=pause;pause=null;try{worker.postMessage({action:'resume',id:current.id,token:current.token,mode});}catch{stop(new EmsError('INVALID_EXECUTION','UI debug command cannot be transferred'));return false;}return true;},dispatch:async(node,event,value,{signal}={})=>request({action:'dispatch',node,event,value},signal),close:()=>stop(new EmsError('CANCELLED','UI preview closed')),get closed(){return closed;}});
}
