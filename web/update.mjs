import {bounded,installedWorker,activateWorker,workerVersion} from './pwa-update.mjs?recovery=1';
const button=document.getElementById('recover-update'),status=document.getElementById('update-status');
button.onclick=async()=>{
 button.disabled=true;
 try{
  if(!('serviceWorker' in navigator))throw Error('UPDATE_UNAVAILABLE');
  status.textContent='Проверяем сервер и загружаем новую версию…';
  const response=await fetch('/api/release',{cache:'no-store',signal:AbortSignal.timeout(10000)}),release=await response.json();
  if(!response.ok||release.schemaVersion!=='ems-release/1'||!/^[a-f0-9]{24}$/.test(release.assets))throw Error('UPDATE_RELEASE_INVALID');
  const registration=await bounded(navigator.serviceWorker.register('/web/service-worker.mjs',{scope:'/',type:'module',updateViaCache:'none'}));
  await bounded(registration.update());
  const worker=await installedWorker(registration);
  if(!worker||await workerVersion(worker)!==release.assets)throw Error('UPDATE_VERSION_MISMATCH');
  if(registration.waiting===worker)await activateWorker(worker,navigator.serviceWorker);
  status.textContent='Версия '+release.assets.slice(0,8)+' готова. Открываем проекты…';
  location.replace('/web/projects.html');
 }catch(error){status.textContent='Обновление не завершилось ('+error.message+'). Проекты и черновики сохранены. Проверьте сеть и повторите попытку.';}
 finally{button.disabled=false;}
};
