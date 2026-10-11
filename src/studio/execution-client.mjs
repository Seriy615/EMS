import {EmsError} from '../reference/errors.mjs';
import {validateBreakpoints} from './debugger.mjs';

/** A worker transports an ordinary EMS execution; terminating it bounds CPU and pending async tasks. */
export function startStudioExecution(request,{timeout=5000,onLog=()=>{},onPause=()=>{}}={}){
 const worker=new Worker('/web/studio-worker.mjs',{type:'module'});let settled=false,resolve,reject,pauseToken=null;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 function log(record){try{onLog(record);}catch{/* Observers cannot change execution results. */}}
 function finish(error,value){if(settled)return;pauseToken=null;log(error?{type:'failed',code:error.code}:{type:'finished'});settled=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(value);}
 const timer=setTimeout(()=>finish(new EmsError('EXECUTION_TIMEOUT','Выполнение превысило лимит времени')),timeout);
 worker.onmessage=event=>{const result=event.data;if(settled)return;if(result.type==='paused'){pauseToken=result.pause.token;try{onPause(result.pause);}catch{}return;}if(result.type==='validated'){log({type:'validated',id:result.id});return;}if(result.ok)finish(null,result.value);else{const error=new EmsError(result.error.code,result.error.message,result.error.details);error.failurePath=result.error.failurePath??null;finish(error);}};
 worker.onerror=()=>finish(new EmsError('EXECUTION_WORKER','Ошибка рабочего процесса исполнения'));
 try{worker.postMessage(request);log({type:'started',action:request.action});}catch{finish(new EmsError('INVALID_EXECUTION','Запрос исполнения не может быть передан'));}
 return {promise,setBreakpoints:points=>{if(settled||pauseToken===null)return false;worker.postMessage({type:'debug-breakpoints',token:pauseToken,breakpoints:validateBreakpoints(points)});return true;},resume:(mode='step')=>{if(settled||pauseToken===null||!['step','continue'].includes(mode))return false;worker.postMessage({type:'debug-resume',token:pauseToken,mode});pauseToken=null;return true;},cancel:()=>finish(new EmsError('CANCELLED','Выполнение остановлено'))};
}
