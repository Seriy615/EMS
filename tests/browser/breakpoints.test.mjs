import test from 'node:test';
import assert from 'node:assert/strict';
import {startStudioServer} from '../../tools/serve.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';

test('actual Studio run-to-breakpoint, live removal, text cursor loop stops and checked source reattachment',async()=>{
 const server=await startStudioServer({port:0});let browser;
 try{
  browser=await launchChromium();const page=await browser.page(server.origin);await page.viewport(1440,900);
  const graph=await page.evaluate(`(async()=>{
   await import('/web/studio.mjs');const click=id=>document.getElementById(id).click();async function wait(check){const end=Date.now()+5000;while(!check()){if(Date.now()>end)throw Error('Breakpoint timeout '+document.querySelector('#error').textContent);await new Promise(r=>setTimeout(r,10));}}
   const example=document.querySelector('#examples');example.value='sum';example.dispatchEvent(new Event('change'));document.querySelector('[data-card="sum"]').click();click('node-breakpoint');
   const count=document.querySelector('#breakpoint-count').textContent,marked=document.querySelector('[data-card="sum"]').classList.contains('breakpoint');document.querySelector('#debug-run-to-breakpoint').checked=true;click('debug');await wait(()=>!document.querySelector('#debug-continue').disabled);
   const pause=document.querySelector('#debug-location').textContent;click('clear-breakpoints');const cleared=document.querySelector('#breakpoint-count').textContent;click('debug-continue');await wait(()=>!document.querySelector('#run').disabled);const value=document.querySelector('#output').textContent;
   click('debug');await wait(()=>!document.querySelector('#run').disabled);return {count,marked,pause,cleared,value,again:document.querySelector('#output').textContent,error:document.querySelector('#error').textContent};
  })()`);
  assert.equal(graph.count,'1');assert.equal(graph.marked,true);assert.match(graph.pause,/sum → core.add/);assert.equal(graph.cleared,'0');assert.equal(graph.value,'5');assert.equal(graph.again,'5');assert.equal(graph.error,'');
  const text=await page.evaluate(`(async()=>{
   const click=id=>document.getElementById(id).click();async function wait(check){const end=Date.now()+5000;while(!check()){if(Date.now()>end)throw Error('Text breakpoint timeout '+document.querySelector('#error').textContent);await new Promise(r=>setTimeout(r,10));}}
   click('text-mode');const area=document.querySelector('#text-source');area.value='fn count()->Number {let mut x=0;while x<3 {x=x+1;}return x;}';document.querySelector('#text-entry').value='count';document.querySelector('#text-lowering').value='auto';document.querySelector('#text-inputs').value='{}';area.setSelectionRange(area.value.indexOf('x+1')+1,area.value.indexOf('x+1')+1);click('text-breakpoint');const count=document.querySelector('#breakpoint-count').textContent;
   click('debug');const ranges=[];for(let i=0;i<3;i++){await wait(()=>!document.querySelector('#debug-continue').disabled);ranges.push(area.value.slice(area.selectionStart,area.selectionEnd));click('debug-continue');}await wait(()=>!document.querySelector('#run').disabled);const value=document.querySelector('#output').textContent;
   document.querySelector('#text-inputs').value='{} ';document.querySelector('#text-inputs').dispatchEvent(new Event('input'));const afterInputs=document.querySelector('#breakpoint-count').textContent;area.value='// shift source\\n'+area.value;area.dispatchEvent(new Event('input'));return {count,ranges,value,afterInputs,stale:document.querySelector('#breakpoint-count').textContent,error:document.querySelector('#error').textContent};
  })()`);
  assert.deepEqual(text,{count:'1',ranges:['x+1','x+1','x+1'],value:'3',afterInputs:'1',stale:'1',error:''});
 }finally{await browser?.close();await server.close();}
});
