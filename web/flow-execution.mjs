/** Worker isolation wraps the existing IR runtime, with bounded work and host-side cancellation. */
export function runFlow(graph,inputs,{timeout=5000}={}){
 const worker=new Worker('/web/flow-worker.mjs',{type:'module'});let settled=false,resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;}),finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(value);},timer=setTimeout(()=>finish(Object.assign(Error('Выполнение превысило лимит времени'),{code:'EXECUTION_TIMEOUT'})),timeout);
 worker.onmessage=event=>event.data.ok?finish(null,event.data):finish(Object.assign(Error(event.data.error.message),event.data.error));worker.onerror=()=>finish(Object.assign(Error('Ошибка процесса исполнения'),{code:'EXECUTION_WORKER'}));
 try{worker.postMessage({graph,inputs});}catch(error){finish(error);}
 return {promise,cancel:()=>finish(Object.assign(Error('Выполнение остановлено'),{code:'CANCELLED'}))};
}
