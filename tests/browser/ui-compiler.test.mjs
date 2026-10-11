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

test('IDE downloads the edited program as a real archive which runs independently',async()=>{
 const {readFile,mkdir,readdir}=await import('node:fs/promises');const {execFileSync}=await import('node:child_process');
 const directory=await mkdtemp(join(tmpdir(),'ems-ide-ui-download-')),downloads=join(directory,'downloads'),output=join(directory,'app'),server=await startStudioServer({port:0});let browser,staticServer,closed=false;
 try{await mkdir(downloads);await mkdir(output);browser=await launchChromium();const page=await browser.page(server.origin+'/web/ui-demo.html');await page.downloads(downloads);
  const edited='fn changed(delta:Number)->Number {return state.count.write(state.count.read()+delta*3);}';
  const saved=await page.evaluate(`(async()=>{const demo=await import('/web/ui-demo.mjs');document.querySelector('#handler-event').value='change';document.querySelector('#handler-entry').value='changed';document.querySelector('#handler-source').value=${JSON.stringify(edited)};document.querySelector('#apply-handler').click();const end=Date.now()+5000;while(demo.editor.sources.change?.source!==${JSON.stringify(edited)}){if(Date.now()>end)throw new Error('Apply did not settle');await new Promise(r=>setTimeout(r,10));}await demo.startDemo();document.querySelector('[data-ems-ui="increment"]').click();await demo.applicationController.idle();if(demo.applicationController.runtime.snapshot().count!==3)throw new Error('Edited preview wrong');document.querySelector('#export-app-ui').click();while(document.querySelector('#export-app-ui').disabled){if(Date.now()>end)throw new Error('Export did not settle');await new Promise(r=>setTimeout(r,10));}return demo.editor.source;})()`);
  let archive;for(let i=0;i<100;i++){try{archive=await readFile(join(downloads,'ems-ui-app.tar'));break;}catch{await new Promise(r=>setTimeout(r,30));}}assert.ok(archive,'Application download missing');
  execFileSync('tar',['-xf',join(downloads,'ems-ui-app.tar'),'-C',output]);
  const {buildUIProjectPackage}=await import('../../src/compiler/ui-package.mjs');const expected=await buildUIProjectPackage(saved,{policy});for(const [name,source]of Object.entries(expected))assert.equal(await readFile(join(output,name),'utf8'),source);
  const rejection=await page.evaluate(`(async()=>{const demo=await import('/web/ui-demo.mjs');document.querySelector('#ui-source').value=await (await fetch('/examples/ui-counter.ems-ui.json')).text();document.querySelector('#apply-ui').click();const end=Date.now()+5000;while(JSON.parse(demo.editor.source).schemaVersion!=='ems-ui-project/1'){if(Date.now()>end)throw new Error('Legacy apply did not settle');await new Promise(r=>setTimeout(r,10));}await demo.startDemo();document.querySelector('[data-ems-ui="increment"]').click();await demo.applicationController.idle();const source=demo.editor.source;document.querySelector('#export-app-ui').click();while(document.querySelector('#export-app-ui').disabled){if(Date.now()>end)throw new Error('Rejected export did not settle');await new Promise(r=>setTimeout(r,10));}return {error:document.querySelector('#error').textContent,preserved:demo.editor.source===source,count:demo.applicationController.runtime.snapshot().count};})()`);
  assert.deepEqual(rejection,{error:'UNSUPPORTED_TARGET',preserved:true,count:1});assert.deepEqual((await readdir(downloads)).filter(name=>name.endsWith('.tar')),['ems-ui-app.tar']);
  await page.close();await server.close();closed=true;staticServer=await serveQA(output);const independent=await browser.page(staticServer.origin+'/index.html');
  const result=await independent.evaluate(`(async()=>{const {controller}=await import('./bootstrap.mjs');const initial=controller.runtime.snapshot().count;document.querySelector('[data-ems-ui="increment"]').click();await controller.idle();const result={initial,count:controller.runtime.snapshot().count,error:document.querySelector('#error').textContent};await controller.close();return result;})()`);
  assert.deepEqual(result,{initial:0,count:3,error:''});assert.equal(staticServer.requests.some(path=>path.startsWith('/src/')||path.startsWith('/web/')),false);
 }finally{await browser?.close();if(!closed)await server.close();await staticServer?.close();await rm(directory,{recursive:true,force:true});}
});
