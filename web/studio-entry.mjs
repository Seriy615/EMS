import {studioEntryRoute} from '../src/studio/entry-route.mjs';
try{
 const route=studioEntryRoute(localStorage,location.pathname,location.search);
 if(route)location.replace(route);
 else{document.body.hidden=false;await import('./studio.mjs');}
}catch(error){document.body.hidden=false;document.getElementById('error').textContent=(error.code??'ERROR')+': '+error.message;}
