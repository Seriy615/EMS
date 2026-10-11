/** QA metadata only. Module identifiers omit credentials, queries, fragments and external origins. */
export function diagnosticModule(value,origin){
 if(typeof value!=='string')return '[opaque-module]';
 try{const url=new URL(value,origin);if(url.origin!==new URL(origin).origin)return '[external-module]';return /^\/(?:web|src)\/[A-Za-z0-9_./-]+\.(?:mjs|js)$/.test(url.pathname)&&url.pathname.length<=256?url.pathname:'[other-module]';}catch{return '[invalid-module]';}
}

/** Injected only by trusted browser QA. No runtime payloads, arbitrary error strings or automatic retries. */
export function workerProbeSource(){
 return `(${installWorkerProbe.toString()})(${diagnosticModule.toString()})`;
}
function installWorkerProbe(moduleName){
 const NativeWorker=globalThis.Worker,records=[],errors=[],limit=64,owners=new WeakMap();let sequence=0;
 globalThis.__emsQAWorkers=records;globalThis.__emsQAWorkerErrors=errors;
 globalThis.Worker=class extends NativeWorker{
  constructor(...args){
   const record={id:++sequence,module:moduleName(args[0],location.href),state:'created',posted:0,replies:0,createdAt:performance.now(),lastAt:performance.now()};
   records.push(record);if(records.length>limit)records.shift();
   try{super(...args);}catch(error){record.state='constructor-failed';record.lastAt=performance.now();throw error;}
   owners.set(this,record);
   const post=NativeWorker.prototype.postMessage,terminate=NativeWorker.prototype.terminate;
   this.postMessage=function(...message){const owner=owners.get(this);if(owner){owner.posted=Math.min(owner.posted+1,65535);owner.lastAt=performance.now();}return post.apply(this,message);};
   this.terminate=function(){const owner=owners.get(this);if(owner){owner.state='terminated';owner.lastAt=performance.now();}return terminate.call(this);};
   this.addEventListener('message',()=>{record.replies=Math.min(record.replies+1,65535);record.lastAt=performance.now();if(record.state!=='terminated')record.state='responding';});
   this.addEventListener('error',event=>{
    const afterTermination=record.state==='terminated';if(!afterTermination)record.state='error';record.lastAt=performance.now();
    const safe={id:record.id,module:record.module,afterTermination,messagePresent:typeof event.message==='string'&&event.message.length>0,filename:moduleName(event.filename,location.href),line:Number.isSafeInteger(event.lineno)?event.lineno:null,column:Number.isSafeInteger(event.colno)?event.colno:null,posted:record.posted,replies:record.replies};
    errors.push(safe);if(errors.length>16)errors.shift();
   });
  }
 };
}

/** Bounded CDP module loading evidence, separate from application messages and request headers. */
export function createModuleDiagnostics(origin){
 const requests=new Map(),events=[],limit=128;
 const emit=value=>{events.push(value);if(events.length>limit)events.shift();};
 const errorCode=value=>typeof value==='string'&&/^net::ERR_[A-Z0-9_]{1,80}$/.test(value)?value:'[unspecified-network-error]';
 return {
  accept(message){
   const params=message.params??{},key=message.sessionId+':'+params.requestId;
   if(message.method==='Network.requestWillBeSent'){
    const module=diagnosticModule(params.request?.url,origin);if(!module.startsWith('/'))return;
    requests.set(key,module);if(requests.size>256)requests.delete(requests.keys().next().value);
   }else if(message.method==='Network.responseReceived'){
    const module=requests.get(key);if(module)emit({event:'response',module,status:Number.isSafeInteger(params.response?.status)?params.response.status:null});
   }else if(message.method==='Network.loadingFailed'){
    const module=requests.get(key);requests.delete(key);if(module)emit({event:'loading-failed',module,error:errorCode(params.errorText),canceled:params.canceled===true});
   }else if(message.method==='Network.loadingFinished')requests.delete(key);
   else if(message.method==='Target.attachedToTarget'&&params.targetInfo?.type==='worker')emit({event:'worker-attached',module:diagnosticModule(params.targetInfo.url,origin)});
   else if(message.method==='Target.detachedFromTarget')emit({event:'worker-detached'});
  },
  snapshot:()=>events.map(event=>({...event})),
 };
}

/** Server-side completion evidence covers module requests that precede CDP attachment. */
export function createHTTPModuleDiagnostics(origin){
 const records=[],failures=[];let sequence=0;
 return {
  observe(request,response){
   const module=diagnosticModule(request.url,origin);if(!module.startsWith('/'))return;
   const id=++sequence;let finished=false;
   const append=event=>{const record={id,event,module,status:response.statusCode,method:['GET','HEAD'].includes(request.method)?request.method:'[other-method]'};records.push(record);if(records.length>128)records.shift();if(event==='response-incomplete'||response.statusCode>=400){failures.push(record);if(failures.length>16)failures.shift();}};
   response.once('finish',()=>{finished=true;append('response-complete');});response.once('close',()=>{if(!finished)append('response-incomplete');});
  },
  snapshot:()=>({recent:records.map(r=>({...r})),failures:failures.map(r=>({...r}))}),
 };
}
