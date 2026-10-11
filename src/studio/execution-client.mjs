import {EmsError} from '../reference/errors.mjs';

/** A worker transports an ordinary EMS execution; terminating it bounds CPU and pending async tasks. */
export function startStudioExecution(request,{timeout=5000}={}){
 const worker=new Worker('/web/studio-worker.mjs',{type:'module'});let settled=false,resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 function finish(error,value){if(settled)return;settled=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(value);}
 const timer=setTimeout(()=>finish(new EmsError('EXECUTION_TIMEOUT','Выполнение превысило лимит времени')),timeout);
 worker.onmessage=event=>{const result=event.data;if(result.ok)finish(null,result.value);else{const error=new EmsError(result.error.code,result.error.message,result.error.details);finish(error);}};
 worker.onerror=()=>finish(new EmsError('EXECUTION_WORKER','Ошибка рабочего процесса исполнения'));
 try{worker.postMessage(request);}catch{finish(new EmsError('INVALID_EXECUTION','Запрос исполнения не может быть передан'));}
 return {promise,cancel:()=>finish(new EmsError('CANCELLED','Выполнение остановлено'))};
}
