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
