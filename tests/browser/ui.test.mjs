import test from 'node:test';
import assert from 'node:assert/strict';
import {startStudioServer} from '../../tools/serve.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';
import {fixture,policy} from '../helpers/ui-fixture.mjs';

test('actual browser counter renders semantic UI and DOM buttons execute EMS state programs',async()=>{
 const server=await startStudioServer({port:0});let browser;
 try{
  browser=await launchChromium();const page=await browser.page(server.origin+'/web/ui-demo.html');
  async function check(){
   const demo=await import('/web/ui-demo.mjs'),value=()=>document.querySelector('[data-ems-ui="count"]').textContent;
   const initial=value();document.querySelector('[data-ems-ui="increment"]').click();document.querySelector('[data-ems-ui="increment"]').click();document.querySelector('[data-ems-ui="decrement"]').click();await demo.applicationController.idle();
   const committed=value();await demo.startDemo();const reset=value(),removed=document.querySelector('[data-ems-ui="increment"]');await demo.applicationController.close();removed.click();
   return {initial,committed,reset,count:demo.applicationController.runtime.snapshot().count,remaining:document.querySelector('#application').children.length,error:document.querySelector('#error').textContent};
  }
  assert.deepEqual(await page.evaluate('('+check.toString()+')()'),{initial:'0',committed:'1',reset:'0',count:0,remaining:0,error:''});
 }finally{await browser?.close();await server.close();}
});

test('DOM adapter preserves rollback, typed inputs, XSS boundaries and listener/session cleanup',async()=>{
 const {application}=fixture(),server=await startStudioServer({port:0});let browser;
 try{
  browser=await launchChromium();const page=await browser.page(server.origin);
  async function check(application,policy){
   const {mountDOMApplication}=await import('/src/ui/dom.mjs'),{createCoreRegistry}=await import('/src/reference/registry.mjs');
   const host=document.createElement('section');host.textContent='Previous';document.body.append(host);const errors=[];
   let denied;try{mountDOMApplication(host,application,createCoreRegistry());}catch(error){denied=error.code;}
   const preserved=host.textContent,controller=mountDOMApplication(host,application,createCoreRegistry(),{policy,onError:async error=>{errors.push(error.code);throw new Error('observer failed');}}),byId=id=>host.querySelector('[data-ems-ui="'+id+'"]');
   let busy;try{mountDOMApplication(host,application,createCoreRegistry(),{policy});}catch(error){busy=error.code;}
   byId('increment').click();await controller.idle();byId('fail').click();await controller.idle();const rolledBack=byId('count').textContent;
   const field=byId('name');field.focus();field.value='<img src=x onerror="globalThis.pwned=true">';field.dispatchEvent(new Event('input',{bubbles:true}));await controller.idle();
   field.value='reject';field.dispatchEvent(new Event('input'));await controller.idle();
   const focused=document.activeElement===field,value=field.value,htmlElements=host.querySelectorAll('img,script').length,label=field.getAttribute('aria-label'),checkbox=byId('locked');
   checkbox.checked=true;checkbox.dispatchEvent(new Event('change'));await controller.idle();const disabled=byId('increment').disabled;byId('increment').click();await controller.idle();const count=controller.runtime.snapshot().count;
   const detached=byId('name');await Promise.all([controller.close(),controller.close()]);detached.value='late';detached.dispatchEvent(new Event('input'));await controller.idle();
   let closed;try{await controller.dispatch('name','change','late');}catch(error){closed=error.code;}
   return {denied,busy,preserved,rolledBack,errors,focused,value,htmlElements,label,disabled,count,closed,remaining:host.children.length,pwned:globalThis.pwned??false};
  }
  const result=await page.evaluate('('+check.toString()+')('+JSON.stringify(application)+','+JSON.stringify(policy)+')');
  assert.deepEqual(result,{denied:'PERMISSION_DENIED',busy:'UI_HOST_BUSY',preserved:'Previous',rolledBack:'1',errors:['DIV_BY_ZERO','USER_THROW'],focused:true,value:'<img src=x onerror="globalThis.pwned=true">',htmlElements:0,label:'Name',disabled:true,count:1,closed:'SESSION_CLOSED',remaining:0,pwned:false});
 }finally{await browser?.close();await server.close();}
});
