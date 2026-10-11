import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture,policy} from '../helpers/ui-fixture.mjs';
import {serializeUIProject} from '../../src/ui/project.mjs';
import {exportUIProject} from '../../tools/export-ui.mjs';
import {startStudioServer} from '../../tools/serve.mjs';
import {serveQA} from '../../tools/lib/qa-server.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';

test('actual standalone UI runs the same DOM/state events after EMS origin shutdown',async()=>{
 const {application,base}=fixture({profile:'control'});
 application.ui.root.children.push({id:'message',kind:'text',props:{text:{state:'name'}},events:{},children:[]});
 const dir=await mkdtemp(join(tmpdir(),'ems-ui-browser-export-')),runtime=await startStudioServer({port:0});let browser,staticServer,closed=false;
 try{
  await exportUIProject(serializeUIProject(application,base),join(dir,'nested'),{policy});staticServer=await serveQA(dir);browser=await launchChromium();
  async function exercise(controller){
   const query=id=>document.querySelector('[data-ems-ui="'+id+'"]');const initial=query('count').textContent;
   query('increment').click();query('increment').click();await controller.idle();const committed=query('count').textContent;
   query('fail').click();await controller.idle();const rolledBack=query('count').textContent,error=document.querySelector('#error').textContent;
   const input=query('name');input.focus();input.value='<img src=x onerror=alert(1)>';input.dispatchEvent(new Event('input',{bubbles:true}));await controller.idle();
   const safe={text:query('message').textContent,images:document.querySelectorAll('img').length,focused:document.activeElement===input,label:input.getAttribute('aria-label')};
   const lock=query('locked');lock.checked=true;lock.dispatchEvent(new Event('change',{bubbles:true}));await controller.idle();query('increment').click();await controller.idle();
   const disabled=query('increment').disabled,snapshot=controller.runtime.snapshot(),view=controller.runtime.view(),removed=query('increment');
   await controller.close();removed.click();let code;try{await controller.dispatch('increment','press');}catch(error){code=error.code;}
   return {initial,committed,rolledBack,error,safe,disabled,snapshot,view,closed:code,remaining:document.querySelector('#application').children.length};
  }
  const page=await browser.page(runtime.origin);
  const expected=await page.evaluate(`(async()=>{const {mountDOMApplication}=await import('/src/ui/dom.mjs');const {createCoreRegistry}=await import('/src/reference/registry.mjs');document.body.replaceChildren();const host=document.createElement('main');host.id='application';const error=document.createElement('p');error.id='error';document.body.append(host,error);const controller=mountDOMApplication(host,${JSON.stringify(application)},createCoreRegistry(),{policy:${JSON.stringify(policy)},onError:e=>{error.textContent=e.code;}});return (${exercise.toString()})(controller);})()`);
  await page.close();await runtime.close();closed=true;
  const independent=await browser.page(staticServer.origin+'/nested/index.html');
  const actual=await independent.evaluate(`(async()=>{const {controller}=await import('./bootstrap.mjs');return (${exercise.toString()})(controller);})()`);
  assert.deepEqual(actual,expected);assert.equal(actual.committed,'2');assert.equal(actual.rolledBack,'2');assert.equal(actual.error,'DIV_BY_ZERO');assert.deepEqual(actual.safe,{text:'<img src=x onerror=alert(1)>',images:0,focused:true,label:'Name'});assert.equal(actual.disabled,true);assert.equal(actual.closed,'SESSION_CLOSED');assert.equal(actual.remaining,0);
  assert.equal(staticServer.requests.some(path=>path.startsWith('/src/')||path.startsWith('/web/')),false);for(const name of ['application.mjs','bootstrap.mjs','style.css'])assert.ok(staticServer.requests.includes('/nested/'+name));
 }finally{await browser?.close();if(!closed)await runtime.close();await staticServer?.close();await rm(dir,{recursive:true,force:true});}
});
