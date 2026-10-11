import {createCoreRegistry} from '../src/reference/registry.mjs';
import {mountDOMApplication} from '../src/ui/dom.mjs';
const host=document.querySelector('#application'),error=document.querySelector('#error');
const policy={capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']};
let application,restarting=Promise.resolve();export let applicationController;
function report(failure){error.textContent=failure.code??'HOST_ERROR';}
export function startDemo(){const task=restarting.then(async()=>{await applicationController?.close();error.textContent='';applicationController=mountDOMApplication(host,application,createCoreRegistry(),{policy,onError:report});});restarting=task.catch(()=>{});return task;}
const response=await fetch('/examples/ui-counter.json');if(!response.ok)throw new Error('Cannot load EMS UI application');application=await response.json();await startDemo();
document.querySelector('#restart').onclick=()=>{startDemo().catch(report);};document.querySelector('#close').onclick=()=>{applicationController.close().catch(report);};
