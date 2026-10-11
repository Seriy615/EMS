import test from 'node:test';
import assert from 'node:assert/strict';
import {startStudioServer} from '../../tools/serve.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';

test('actual visual IDE shows only granted memoized output, preserves inputs and clears/protects graph values',async()=>{
 const server=await startStudioServer({port:0,recordModules:true});let browser;
 try{browser=await launchChromium();const page=await browser.page(server.origin,{httpDiagnostics:()=>server.moduleDiagnostics()});const result=await page.evaluate(`(async()=>{
 await import('/web/studio.mjs');const $=id=>document.getElementById(id),click=s=>{const el=document.querySelector(s);if(!el)throw Error('Missing '+s+' '+$('error').textContent);el.click();};async function wait(check){const end=Date.now()+5000;while(!check()){if(Date.now()>end)throw Error('Graph panel deadline '+$('error').textContent);await new Promise(r=>setTimeout(r,10));}}
 $('examples').value='sum';$('examples').dispatchEvent(new Event('change'));click('[data-contract="core.mul"]');for(const port of ['a','b']){click('[data-node="sum"][data-port="out"]');click('[data-node="n1"][data-port="'+port+'"]');}click('[data-node="n1"][data-port="out"]');click('[data-node="output"][data-port="return"]');click('#inspection-choose');click('[data-inspection-name="sum"]');click('#debug');await wait(()=>!$('debug-step').disabled);const initial=$('inspection-values').textContent;click('#debug-step');await wait(()=>!$('debug-step').disabled);const computed=$('inspection-values').textContent;click('#debug-continue');const cleared=$('inspection-values').textContent;await wait(()=>!$('run').disabled);const value=$('output').textContent;
 $('inspection-protected').checked=true;click('#debug');await wait(()=>!$('debug-step').disabled);const protectedValue=$('inspection-values').textContent;click('#stop');await wait(()=>!$('run').disabled);$('inspection-protected').checked=false;click('[data-card="sum"]');document.querySelector('[data-literal="b"]')?.focus();click('[data-contract="core.add"]');const revoked=document.querySelectorAll('[data-inspection-name]').length;return {initial,computed,cleared,value,protectedValue,revoked,error:$('error').textContent};
 })()`);assert.match(result.initial,/ещё не вычислено/);assert.equal(result.computed,'sum · Number = 5');assert.equal(result.cleared,'');assert.equal(result.value,'25');assert.match(result.protectedValue,/защищённая программа/);assert.equal(result.revoked,0);assert.equal(result.error,'');await page.close();
 }finally{await browser?.close();await server.close();}
});
test('actual text call-IR Worker transports bounded values with exact source pauses',async()=>{
 const server=await startStudioServer({port:0,recordModules:true});let browser;
 try{browser=await launchChromium();const page=await browser.page(server.origin,{httpDiagnostics:()=>server.moduleDiagnostics()});const result=await page.evaluate(`(async()=>{
 await import('/web/studio.mjs');const $=id=>document.getElementById(id),click=id=>$(id).click();async function wait(check){const end=Date.now()+5000;while(!check()){if(Date.now()>end)throw Error('Call panel deadline '+$('error').textContent);await new Promise(r=>setTimeout(r,10));}}
 click('text-mode');$('text-source').value='fn main(x:Number)->Number {let sum=core.add(x,2);return core.mul(sum,sum);}';$('text-entry').value='main';$('text-lowering').value='call';$('text-inputs').value='{"x":3}';$('text-source').dispatchEvent(new Event('input'));click('inspection-choose');document.querySelector('[data-inspection-name="x"]').click();click('debug');await wait(()=>!$('debug-step').disabled);const value=$('inspection-values').textContent,area=$('text-source'),selection=area.value.slice(area.selectionStart,area.selectionEnd);click('debug-continue');await wait(()=>!$('run').disabled);return {value,selection,result:$('output').textContent,cleared:$('inspection-values').textContent,error:$('error').textContent};
 })()`);assert.equal(result.value,'x · Number = 3');assert.ok(result.selection.length>0);assert.equal(result.result,'25');assert.equal(result.cleared,'');assert.equal(result.error,'');await page.close();
 }finally{await browser?.close();await server.close();}
});
