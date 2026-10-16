/** Bounded service-worker transitions. No project or draft storage is modified. */
export function bounded(work, milliseconds=15000) {
 let timer;
 return Promise.race([Promise.resolve(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('UPDATE_TIMEOUT')),milliseconds);})]).finally(()=>clearTimeout(timer));
}
export function installedWorker(registration,{timeout=15000}={}) {
 if(!registration)return Promise.reject(Error('UPDATE_UNAVAILABLE'));
 if(registration.waiting)return Promise.resolve(registration.waiting);
 const worker=registration.installing;
 if(!worker)return Promise.resolve(registration.active);
 return new Promise((resolve,reject)=>{
  const finish=(error)=>{clearTimeout(timer);worker.removeEventListener('statechange',changed);error?reject(error):resolve(registration.waiting??registration.active??worker);};
  const changed=()=>{if(worker.state==='redundant')finish(Error('UPDATE_INSTALL_FAILED'));else if(['installed','activated'].includes(worker.state))finish();};
  const timer=setTimeout(()=>finish(Error('UPDATE_TIMEOUT')),timeout);
  worker.addEventListener('statechange',changed);changed();
 });
}
export function activateWorker(worker,serviceWorker,{timeout=10000}={}) {
 return new Promise((resolve,reject)=>{
  const finish=error=>{clearTimeout(timer);serviceWorker.removeEventListener('controllerchange',changed);error?reject(error):resolve();};
  const changed=()=>{if(serviceWorker.controller===worker)finish();};
  const timer=setTimeout(()=>finish(Error('UPDATE_ACTIVATION_TIMEOUT')),timeout);
  serviceWorker.addEventListener('controllerchange',changed);
  try{worker.postMessage({type:'activate'});changed();}catch(error){finish(error);}
 });
}
export function workerVersion(worker,{timeout=3000}={}) {
 return new Promise((resolve,reject)=>{
  const channel=new MessageChannel();
  const finish=(error,value)=>{clearTimeout(timer);channel.port1.close();channel.port2.close();error?reject(error):resolve(value);};
  const timer=setTimeout(()=>finish(Error('UPDATE_VERSION_TIMEOUT')),timeout);
  channel.port1.onmessage=event=>event.data?.schemaVersion==='ems-shell/1'&&/^[a-f0-9]{24}$/.test(event.data.revision)?finish(null,event.data.revision):finish(Error('UPDATE_VERSION_INVALID'));
  try{worker.postMessage({type:'version'},[channel.port2]);}catch(error){finish(error);}
 });
}
