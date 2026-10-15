import test from 'node:test';
import assert from 'node:assert/strict';
import {startStudioServer} from '../../tools/serve.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';
async function until(page,expression){const end=Date.now()+15000;while(Date.now()<end){if(await page.evaluate(expression))return;await new Promise(r=>setTimeout(r,30));}throw Error('Disabled property deadline: '+expression);}
for(const native of [false,true])test(`${native?'native':'legacy'} UI disabled accepts false and clearing, persists and restores real Worker events`,async()=>{
 const server=await startStudioServer({port:0});let browser;
 try{browser=await launchChromium();let page=await browser.page(server.origin+'/web/projects.html');if(native)await page.evaluate(`(async()=>{const {ProjectManager}=await import('/src/studio/manager.mjs');new ProjectManager(localStorage).import(await(await fetch('/examples/native-ui.ems')).text(),'disabled');})()`);await page.close();page=await browser.page(server.origin+'/web/ui-demo.html'+(native?'?project=disabled&native=1':''));await page.viewport(390,844);const id=native?'down':'decrement';
 await until(page,`!!document.querySelector('#application [data-ems-ui="${id}"]')`);
 async function select(name='disabled'){await page.evaluate(`(()=>{const $=id=>document.getElementById(id);$('widget-select').value=${JSON.stringify(id)};$('widget-select').dispatchEvent(new Event('change'));$('property-name').value=${JSON.stringify(name)};$('property-name').dispatchEvent(new Event('change'));})()`);}
 async function apply(value,disabled){await page.evaluate(`(()=>{document.querySelector('#property-value').value=${JSON.stringify(value)};document.querySelector('#set-property').click();})()`);await until(page,`document.querySelector('#application [data-ems-ui="${id}"]')?.disabled===${disabled}&&document.querySelector('#error').textContent===''&&document.querySelector('#property-value').value===${JSON.stringify(value.trim())}`);}
 await select();assert.equal(await page.evaluate(`document.querySelector('#property-value').value`),'');await apply('true',true);
 // A disabled DOM button cannot trigger its actual Worker handler.
 await page.evaluate(`document.querySelector('#application [data-ems-ui="${id}"]').click()`);assert.equal(await page.evaluate(`document.querySelector('#application [data-ems-ui="count"]').textContent`),native?'1':'0');
 const saved=await page.evaluate(`document.querySelector('#ui-source').value`);await page.evaluate(`(()=>{document.querySelector('#property-value').value='no';document.querySelector('#set-property').click();})()`);await until(page,`document.querySelector('#error').textContent.includes('UI_BINDING_TYPE')`);assert.equal(await page.evaluate(`document.querySelector('#ui-source').value`),saved);
 await apply('false',false);await apply('true',true);await apply('',false);
 assert.equal(await page.evaluate(`(()=>{const doc=JSON.parse(document.querySelector('#ui-source').value),root=(doc.ui??doc.application.ui).root;function find(node){return node.id===${JSON.stringify(id)}?node:node.children.map(find).find(Boolean);}return Object.hasOwn(find(root).props,'disabled');})()`),false);
 await page.reload();await until(page,`!!document.querySelector('#application [data-ems-ui="${id}"]')`);await select();assert.equal(await page.evaluate(`document.querySelector('#property-value').value`),'');assert.equal(await page.evaluate(`document.querySelector('#application [data-ems-ui="${id}"]').disabled`),false);
 await page.evaluate(`document.querySelector('#application [data-ems-ui="${id}"]').click()`);await until(page,`document.querySelector('#application [data-ems-ui="count"]').textContent===${JSON.stringify(native?'0':'-1')}`);
 await apply('true',true);await page.evaluate(`document.querySelector('#reset-property').click()`);await until(page,`document.querySelector('#application [data-ems-ui="${id}"]')?.disabled===false&&document.querySelector('#property-value').value===''`);await select('text');assert.equal(await page.evaluate(`document.querySelector('#reset-property').disabled`),true);
 assert.equal(await page.evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
 }finally{await browser?.close();await server.close();}
});
