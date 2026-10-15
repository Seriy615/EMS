import {ASSETS,REVISION} from './offline-assets.mjs';
const CACHE='ems-shell-'+REVISION,allowed=new Set(ASSETS);
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(ASSETS.map(path=>new Request(path,{cache:'reload'})));})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('ems-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='activate')self.skipWaiting();});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!allowed.has(url.pathname))return;event.respondWith((async()=>{const cached=await (await caches.open(CACHE)).match(url.pathname);return cached??fetch(event.request);})());});
