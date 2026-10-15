import test from 'node:test';
import assert from 'node:assert/strict';
import {startStudioServer} from '../../tools/serve.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';

test('actual Studio selects one repeated declaration and refuses values from its sibling branch',async()=>{
 const server=await startStudioServer({port:0});let browser;
 try{browser=await launchChromium();const page=await browser.page(server.origin+'/web/index.html');const result=await page.evaluate(`(async()=>{
 await import('/web/studio.mjs');const $=id=>document.getElementById(id),click=id=>$(id).click();async function wait(check){const end=Date.now()+5000;while(!check()){if(Date.now()>end)throw Error('Declaration pause timeout '+$('error').textContent);await new Promise(r=>setTimeout(r,10));}}
 click('text-mode');$('text-source').value='fn main(choose:Boolean)->Number {let mut answer=0;if choose {let x=7;answer=x;}else{let x="BROWSER_DECL_PRIVATE_SENTINEL";answer=99;}return answer;}';$('text-entry').value='main';$('text-lowering').value='auto';$('text-inputs').value='{"choose":false}';$('text-source').dispatchEvent(new Event('input'));click('inspection-choose');const choices=[...document.querySelectorAll('[data-inspection-name="x"]')];const enabled=choices.every(c=>!c.disabled),ids=choices.map(c=>c.dataset.inspectionDeclaration),selected=choices.find(c=>c.dataset.inspectionDeclaration.includes('/then/'));selected.click();
 async function run(){click('debug');const snapshots=[];for(let i=0;i<50;i++){await wait(()=>!$('debug-step').disabled||!$('run').disabled);if(!$('run').disabled)break;snapshots.push($('inspection-values').textContent);click('debug-step');}await wait(()=>!$('run').disabled);return {snapshots,value:$('output').textContent,error:$('error').textContent};}
 const inactive=await run();$('text-inputs').value='{"choose":true}';$('text-inputs').dispatchEvent(new Event('input'));const active=await run();return {enabled,ids,selected:selected.dataset.inspectionDeclaration,inactive,active,cleared:$('inspection-values').textContent};
 })()`);assert.equal(result.enabled,true);assert.equal(result.ids.length,2);assert.notEqual(result.ids[0],result.ids[1]);assert.equal(result.inactive.value,'99');assert.equal(result.active.value,'7');assert.equal(JSON.stringify(result.inactive.snapshots).includes('BROWSER_DECL_PRIVATE_SENTINEL'),false,'Inactive declaration must not disclose sibling value');assert.equal(result.inactive.snapshots.every(s=>s.includes('ещё не в области видимости')),true,JSON.stringify(result.inactive));assert.equal(result.active.snapshots.some(s=>s.includes('Number = 7')),true,JSON.stringify(result.active));assert.equal(result.active.snapshots.some(s=>s.includes('[строка ')),true,'Show selected declaration source position');assert.equal(result.inactive.error,'');assert.equal(result.active.error,'');assert.equal(result.cleared,'');await page.close();
 }finally{await browser?.close();await server.close();}
});
