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
   const demo=await import('/web/ui-demo.mjs'),value=()=>document.querySelector('[data-ems-ui="count"]')?.textContent;
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

test('actual UI workspace validates signed project edits, undo/save/download/import and reopens the saved program',async()=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),directory=await mkdtemp(join(tmpdir(),'ems-ui-project-browser-')),server=await startStudioServer({port:0});let browser;
 try{
  browser=await launchChromium();const page=await browser.page(server.origin+'/web/ui-demo.html');
  async function edit(){
   const demo=await import('/web/ui-demo.mjs'),field=document.querySelector('#ui-source'),original=field.value,data=JSON.parse(original);
   async function wait(predicate){const deadline=Date.now()+5000;while(!predicate()){if(Date.now()>deadline)throw new Error('UI apply timeout');await new Promise(resolve=>setTimeout(resolve,10));}}
   data.application.reactor.state[0].initial.value='-0';data.application.ui.root.children[2].children[0].events.press.inputs.delta.literal.value=2;field.value=JSON.stringify(data);document.querySelector('#apply-ui').click();await wait(()=>document.querySelector('#ui-status').textContent.includes('применён'));
   const signed=document.querySelector('[data-ems-ui="count"]')?.textContent;document.querySelector('#undo-ui').click();await wait(()=>document.querySelector('[data-ems-ui="count"]')?.textContent==='0');document.querySelector('#redo-ui').click();await wait(()=>document.querySelector('[data-ems-ui="count"]')?.textContent==='-0');
   const accepted=demo.editor.source;field.value='{';document.querySelector('#apply-ui').click();await wait(()=>document.querySelector('#error').textContent==='INVALID_UI_PROJECT');const preserved=demo.editor.source===accepted;
   document.querySelector('#save-ui').click();document.querySelector('[data-ems-ui="increment"]').click();await demo.applicationController.idle();return {signed,preserved,value:document.querySelector('[data-ems-ui="count"]')?.textContent,saved:localStorage.getItem('ems.studio.ui.v1')===accepted};
  }
  assert.deepEqual(await page.evaluate('('+edit.toString()+')()'),{signed:'-0',preserved:true,value:'2',saved:true});
  await page.downloads(directory);await page.evaluate("document.querySelector('#export-ui').click()");let saved;for(let retry=0;retry<100;retry++){try{saved=await readFile(join(directory,'ems-ui-project.json'),'utf8');break;}catch{await new Promise(resolve=>setTimeout(resolve,30));}}assert.ok(saved,'UI download missing');const imported=JSON.parse(saved);imported.application.reactor.state[0].initial.value=10;
  async function importFile(source){
   const transfer=new DataTransfer();transfer.items.add(new File([source],'project.json',{type:'application/json'}));const field=document.querySelector('#file-ui');field.files=transfer.files;field.dispatchEvent(new Event('change'));const deadline=Date.now()+5000;while(document.querySelector('[data-ems-ui="count"]')?.textContent!=='10'){if(Date.now()>deadline)throw new Error('UI import timeout');await new Promise(resolve=>setTimeout(resolve,10));}return document.querySelector('#error').textContent;
  }
  assert.equal(await page.evaluate('('+importFile.toString()+')('+JSON.stringify(JSON.stringify(imported))+')'),'');
  async function openSaved(){document.querySelector('#open-ui').click();const deadline=Date.now()+5000;while(document.querySelector('[data-ems-ui="count"]')?.textContent!=='-0'){if(Date.now()>deadline)throw new Error('Open saved timeout');await new Promise(resolve=>setTimeout(resolve,10));}return document.querySelector('#error').textContent;}
  assert.equal(await page.evaluate('('+openSaved.toString()+')()'),'');

  await page.close();const reopened=await browser.page(server.origin+'/web/ui-demo.html');assert.equal(await reopened.evaluate("(async()=>{await import('/web/ui-demo.mjs');return document.querySelector('[data-ems-ui=\"count\"]').textContent;})()"),'-0');
  await reopened.evaluate("localStorage.setItem('ems.studio.ui.v1','{')");await reopened.close();const corrupt=await browser.page(server.origin+'/web/ui-demo.html');
  async function inspectCorrupt(){await import('/web/ui-demo.mjs');return {error:document.querySelector('#error').textContent,value:document.querySelector('[data-ems-ui="count"]')?.textContent,saved:localStorage.getItem('ems.studio.ui.v1')};}
  assert.deepEqual(await corrupt.evaluate('('+inspectCorrupt.toString()+')()'),{error:'INVALID_UI_PROJECT',value:'0',saved:'{'});

 }finally{await browser?.close();await server.close();await rm(directory,{recursive:true,force:true});}
});

test('actual forms create a counter from empty UI, edit EMS handler and restore source after reopen',async()=>{
 const server=await startStudioServer({port:0});let browser;
 try{
  browser=await launchChromium();const page=await browser.page(server.origin+'/web/ui-demo.html');
  async function create(){
   const demo=await import('/web/ui-demo.mjs'),set=(id,value)=>{document.getElementById(id).value=value;};
   async function change(id){const before=demo.editor.source;document.getElementById(id).click();const deadline=Date.now()+5000;while(demo.editor.source===before){if(document.getElementById('error').textContent)throw new Error(document.getElementById('error').textContent);if(Date.now()>deadline)throw new Error('Author change timeout: '+id);await new Promise(resolve=>setTimeout(resolve,10));}await demo.startDemo();}
   await change('new-ui');set('state-id','count');set('state-type','Number');set('state-initial','0');await change('add-state-ui');
   const initial='fn update(delta:Number)->Number {return state.count.write(state.count.read()+delta);}';set('handler-event','increment');set('handler-entry','update');set('handler-source',initial);await change('apply-handler');
   set('widget-id','display');set('widget-kind','text');set('widget-parent','root');await change('add-widget');set('widget-select','display');document.getElementById('widget-select').dispatchEvent(new Event('change'));set('property-name','text');set('property-mode','number');set('property-value','count');await change('set-property');
   set('widget-id','plus');set('widget-kind','button');set('widget-parent','root');await change('add-widget');set('widget-select','plus');document.getElementById('widget-select').dispatchEvent(new Event('change'));set('event-handler','increment');document.getElementById('event-handler').dispatchEvent(new Event('change'));document.querySelector('[data-event-value="delta"]').value='1';await change('set-event');
   document.querySelector('[data-ems-ui="plus"]').click();await demo.applicationController.idle();const first=document.querySelector('[data-ems-ui="display"]').textContent;
   const updated='fn update(delta:Number)->Number {return state.count.write(state.count.read()+delta*2);}';set('handler-event','increment');set('handler-entry','update');set('handler-source',updated);await change('apply-handler');document.querySelector('[data-ems-ui="plus"]').click();await demo.applicationController.idle();const second=document.querySelector('[data-ems-ui="display"]').textContent;
   const accepted=demo.editor.source;set('handler-source','fn update(');document.getElementById('apply-handler').click();const failureDeadline=Date.now()+5000;while(!document.getElementById('error').textContent){if(Date.now()>failureDeadline)throw new Error('Invalid handler did not fail');await new Promise(resolve=>setTimeout(resolve,10));}const preserved=demo.editor.source===accepted&&document.querySelector('[data-ems-ui="display"]').textContent==='2';

   document.getElementById('undo-ui').click();await demo.startDemo();document.querySelector('[data-ems-ui="plus"]').click();await demo.applicationController.idle();const undone=document.querySelector('[data-ems-ui="display"]').textContent;
   document.getElementById('redo-ui').click();await demo.startDemo();document.getElementById('save-ui').click();set('handler-select','increment');document.getElementById('load-handler').click();return {first,second,undone,preserved,source:document.getElementById('handler-source').value,schema:JSON.parse(demo.editor.source).schemaVersion,inspect:document.getElementById('handler-inspect').textContent.includes('ems-ir/2'),error:document.getElementById('error').textContent};
  }
  const updated='fn update(delta:Number)->Number {return state.count.write(state.count.read()+delta*2);}';assert.deepEqual(await page.evaluate('('+create.toString()+')()'),{first:'1',second:'2',undone:'1',preserved:true,source:updated,schema:'ems-ui-project/2',inspect:true,error:''});
  await page.close();const reopened=await browser.page(server.origin+'/web/ui-demo.html');
  async function restore(){const demo=await import('/web/ui-demo.mjs');document.getElementById('handler-select').value='increment';document.getElementById('load-handler').click();document.querySelector('[data-ems-ui="plus"]').click();await demo.applicationController.idle();return {source:document.getElementById('handler-source').value,value:document.querySelector('[data-ems-ui="display"]').textContent};}
  assert.deepEqual(await reopened.evaluate('('+restore.toString()+')()'),{source:updated,value:'2'});
 }finally{await browser?.close();await server.close();}
});

test('actual browser worker deadline and Stop leave editor responsive and a fresh session recovers',async()=>{
 const {UIProjectEditor}=await import('../../src/studio/ui-project.mjs'),{application,base}=fixture(),editor=new UIProjectEditor(application,base);editor.applyHandler('increment','fn bounded(delta:Number)->Number {state.count.write(99);while true {} return delta;}','bounded');const source=editor.source,healthy=serializeHealthy();
 function serializeHealthy(){return new UIProjectEditor(application,base).source;}
 const server=await startStudioServer({port:0});let browser;
 try{
  browser=await launchChromium();const page=await browser.page(server.origin+'/web/ui-demo.html');
  async function check(source,healthy,policy){
   await import('/web/ui-demo.mjs');const {createUIWorkerRuntime}=await import('/src/ui/worker-client.mjs');
   const worker=await createUIWorkerRuntime(source,{policy,timeout:1});let responsive=false;setTimeout(()=>{document.querySelector('#state-id').value='responsive';responsive=true;},0);
   let failure;try{await worker.dispatch('increment','press');}catch(error){failure=error.code;}await new Promise(resolve=>setTimeout(resolve,10));
   const frozen=worker.snapshot().count,closed=worker.closed,recovered=await createUIWorkerRuntime(healthy,{policy});const result=await recovered.dispatch('increment','press');const pending=recovered.dispatch('increment','press'),outcome=Promise.allSettled([pending]);await recovered.close();return {failure,responsive,field:document.querySelector('#state-id').value,frozen,closed,result,stopped:(await outcome)[0].reason.code,confirmed:recovered.snapshot().count};
  }
  assert.deepEqual(await page.evaluate('('+check.toString()+')('+JSON.stringify(source)+','+JSON.stringify(healthy)+','+JSON.stringify(policy)+')'),{failure:'EXECUTION_TIMEOUT',responsive:true,field:'responsive',frozen:0,closed:true,result:1,stopped:'CANCELLED',confirmed:1});
 }finally{await browser?.close();await server.close();}
});
