import test from 'node:test';
import assert from 'node:assert/strict';
import {startStudioServer} from '../../tools/serve.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';

test('Studio onboarding leads to a running example; file actions and narrow workspaces remain accessible',async()=>{
 const server=await startStudioServer({port:0});let browser;
 try{
  browser=await launchChromium();const page=await browser.page(server.origin);await page.viewport(1440,900);
  const initial=await page.evaluate(`(async()=>{await import('/web/studio.mjs');return {guide:!document.querySelector('#canvas-guide').hidden,advanced:document.querySelector('.advanced').open};})()`);
  assert.deepEqual(initial,{guide:false,advanced:false});
  const at=await page.evaluate(`(()=>{const r=document.querySelector('.file-actions summary').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await page.mouse('mousePressed',{...at,button:'left',buttons:1,clickCount:1});await page.mouse('mouseReleased',{...at,button:'left',buttons:0,clickCount:1});
  assert.equal(await page.evaluate(`document.querySelector('#export').getBoundingClientRect().height>0`),true);
  const result=await page.evaluate(`(async()=>{const examples=document.querySelector('#examples');examples.value='sum';examples.dispatchEvent(new Event('change'));document.querySelector('#run').click();const deadline=Date.now()+5000;while(document.querySelector('#run').disabled){if(Date.now()>deadline)throw Error('Example deadline');await new Promise(r=>setTimeout(r,20));}return {guide:document.querySelector('#canvas-guide').hidden,output:document.querySelector('#output').textContent};})()`);
  assert.deepEqual(result,{guide:true,output:'5'});
  await page.viewport(390,844);
  assert.equal(await page.evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
  await page.close();
  for(const path of ['/web/projects.html','/web/ui-demo.html']){
   const next=await browser.page(server.origin+path);await next.viewport(390,844);
   if(path.includes('ui-demo')){
    assert.equal(await next.evaluate(`(async()=>{await import('/web/ui-demo.mjs');return document.querySelector('#handler-source').value.includes('fn ');})()`),true);
   }
   assert.equal(await next.evaluate(`document.documentElement.scrollWidth<=innerWidth`),true,path+' overflows');await next.close();
  }
 }finally{await browser?.close();await server.close();}
});

test('Studio exposes distinct stable views, a real first-run button and compact mobile library',async()=>{
 const server=await startStudioServer({port:0});let browser;
 try{
  browser=await launchChromium();const page=await browser.page(server.origin);await page.viewport(1440,900);
  await page.evaluate(`import('/web/studio.mjs')`);
  async function click(selector){await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);const at=await page.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)}),r=el.getBoundingClientRect();if(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)!==el)throw Error('Control covered: '+${JSON.stringify(selector)});return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await page.mouse('mousePressed',{...at,button:'left',buttons:1,clickCount:1});await page.mouse('mouseReleased',{...at,button:'left',buttons:0,clickCount:1});}
  assert.equal(await page.evaluate(`document.querySelector('.debug-tools').open`),false);
  await click('#show-guide');await click('#start-example');await click('#run');
  assert.equal(await page.evaluate(`(async()=>{const end=Date.now()+5000;while(document.querySelector('#run').disabled){if(Date.now()>end)throw Error('Example execution timeout');await new Promise(r=>setTimeout(r,10));}return document.querySelector('#output').textContent;})()`),'5');
  assert.equal(await page.evaluate(`document.querySelector('[data-card="output"] header strong').textContent`),'Ответ программы');
  assert.equal(await page.evaluate(`document.querySelector('[data-card="sum"] .operation-hint').textContent`),'Складывает два числа');
  assert.equal(await page.evaluate(`document.querySelector('.run-input-row .input-type').textContent`),'Число');
  await click('.canvas-help summary');
  assert.equal(await page.evaluate(`document.querySelector('.canvas-help').open&&document.querySelector('.canvas-help-content').textContent.includes('кружок справа')`),true);
  await click('.canvas-help summary');
  await click('#text-mode');await click('#text-mode');
  assert.equal(await page.evaluate(`document.body.classList.contains('text-mode')&&document.querySelector('#text-mode').getAttribute('aria-pressed')==='true'`),true);
  await click('#graph-view');await click('#graph-view');
  assert.equal(await page.evaluate(`!document.body.classList.contains('text-mode')&&document.querySelector('#graph-view').getAttribute('aria-pressed')==='true'`),true);
  await click('.debug-tools summary');await click('#debug');
  assert.equal(await page.evaluate(`(async()=>{const end=Date.now()+5000;while(document.querySelector('#debug-step').disabled){if(Date.now()>end)throw Error('Debug pause timeout');await new Promise(r=>setTimeout(r,10));}return document.querySelector('.debug-tools').open;})()`),true);
  await click('#stop');await page.evaluate(`(async()=>{while(document.querySelector('#run').disabled)await new Promise(r=>setTimeout(r,10));document.querySelector('.debug-tools').open=false;})()`);
  await click('#new');await page.viewport(390,844);
  await page.evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  assert.equal(await page.evaluate(`document.querySelector('.library-section').open`),false);
  assert.equal(await page.evaluate(`['undo','redo'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.width>0&&r.height>0;})`),true);
  assert.equal(await page.evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
  await click('#show-guide');await click('#start-example');await click('[data-panel="library"]');
  assert.equal(await page.evaluate(`document.querySelector('.library-section').open&&document.querySelector('[data-contract="core.add"]').getBoundingClientRect().height>0`),true);
  await page.close();
 }finally{await browser?.close();await server.close();}
});

test('visible run inputs validate and persist; fit shows complete graph at desktop and mobile widths',async()=>{
 const server=await startStudioServer({port:0,recordModules:true});let browser;
 try{
  browser=await launchChromium();const page=await browser.page(server.origin,{httpDiagnostics:()=>server.moduleDiagnostics()});await page.viewport(1440,900);
  await page.evaluate(`(async()=>{await import('/web/studio.mjs');document.querySelector('#start-example').click();})()`);
  async function click(selector){const at=await page.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();if(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)!==el)throw Error('Covered '+${JSON.stringify(selector)});return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await page.mouse('mousePressed',{...at,button:'left',buttons:1,clickCount:1});await page.mouse('mouseReleased',{...at,button:'left',buttons:0,clickCount:1});}
  const fits=()=>page.evaluate(`(()=>{const area=document.querySelector('#viewport').getBoundingClientRect();return [...document.querySelectorAll('.card')].every(el=>{const r=el.getBoundingClientRect();return r.left>=area.left&&r.right<=area.right&&r.top>=area.top&&r.bottom<=area.bottom;});})()`);
  assert.equal(await fits(),true);
  await page.evaluate(`document.querySelector('[data-run-input="a"]').value='"bad"'`);
  await click('.run-input-row button');
  assert.match(await page.evaluate(`document.querySelector('#error').textContent`),/TYPE_MISMATCH/);
  assert.equal(await page.evaluate(`document.querySelector('[data-card="input:a"] .input-preview').textContent`),'2');
  await page.evaluate(`document.querySelector('[data-run-input="a"]').value='8'`);
  await click('.run-input-row button');await click('#run');
  assert.equal(await page.evaluate(`(async()=>{const end=Date.now()+5000;while(document.querySelector('#run').disabled){if(Date.now()>end)throw Error('Input run timeout');await new Promise(r=>setTimeout(r,10));}return document.querySelector('#output').textContent;})()`),'11');
  await page.close();const restored=await browser.page(server.origin);await restored.viewport(1440,900);
  assert.equal(await restored.evaluate(`(async()=>{await import('/web/studio.mjs');return document.querySelector('[data-run-input="a"]').value;})()`),'8');await restored.close();
  const mobile=await browser.page(server.origin);await mobile.viewport(390,844);await mobile.evaluate(`import('/web/studio.mjs')`);
  await mobile.evaluate(`document.querySelector('#fit-graph').click()`);
  assert.equal(await mobile.evaluate(`(()=>{const area=document.querySelector('#viewport').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.card')].every(el=>{const r=el.getBoundingClientRect();return r.left>=area.left&&r.right<=area.right&&r.top>=area.top&&r.bottom<=area.bottom;});})()`),true);
  await mobile.close();
 }finally{await browser?.close();await server.close();}
});

test('run input forms edit text and booleans directly and validate number lists',async()=>{
 const server=await startStudioServer({port:0});let browser;
 try{
  browser=await launchChromium();const page=await browser.page(server.origin);
  const actual=await page.evaluate(`(async()=>{await import('/web/studio.mjs');document.querySelector('#new').click();
   for(const [name,type] of [['title','String'],['enabled','Boolean'],['values','NumberArray']]){document.querySelector('#input-name').value=name;document.querySelector('#input-type').value=type;document.querySelector('#add-input').requestSubmit();}
   function apply(name,value){const field=document.querySelector('[data-run-input="'+name+'"]');field.value=value;field.closest('form').requestSubmit();}
   apply('title','Привет, EMS');apply('enabled','true');apply('values','[1,"bad"]');const invalid=document.querySelector('#error').textContent;apply('values','[1,2,3]');
   return {text:document.querySelector('[data-run-input="title"]').value,bool:document.querySelector('[data-run-input="enabled"]').value,array:document.querySelector('[data-run-input="values"]').value,invalid,error:document.querySelector('#error').textContent};})()`);
  assert.equal(actual.text,'Привет, EMS');assert.equal(actual.bool,'true');assert.equal(actual.array,'[1,2,3]');assert.match(actual.invalid,/TYPE_MISMATCH/);assert.equal(actual.error,'');await page.close();
 }finally{await browser?.close();await server.close();}
});
