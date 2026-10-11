import test from 'node:test';
import assert from 'node:assert/strict';
import {startStudioServer} from '../../tools/serve.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';

test('Studio onboarding leads to a running example; file actions and narrow workspaces remain accessible',async()=>{
 const server=await startStudioServer({port:0});let browser;
 try{
  browser=await launchChromium();const page=await browser.page(server.origin);await page.viewport(1440,900);
  const initial=await page.evaluate(`(async()=>{await import('/web/studio.mjs');return {guide:!document.querySelector('#canvas-guide').hidden,advanced:document.querySelector('.advanced').open};})()`);
  assert.deepEqual(initial,{guide:true,advanced:false});
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
  await click('#start-example');await click('#run');
  assert.equal(await page.evaluate(`(async()=>{const end=Date.now()+5000;while(document.querySelector('#run').disabled){if(Date.now()>end)throw Error('Example execution timeout');await new Promise(r=>setTimeout(r,10));}return document.querySelector('#output').textContent;})()`),'5');
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
  await click('#start-example');await click('.library-section summary');
  assert.equal(await page.evaluate(`document.querySelector('.library-section').open&&document.querySelector('[data-contract="core.add"]').getBoundingClientRect().height>0`),true);
  await page.close();
 }finally{await browser?.close();await server.close();}
});
