import test from 'node:test';
import assert from 'node:assert/strict';
import {startStudioServer} from '../../tools/serve.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';
test('Russian catalog and canvas preserve technical search, typed ports and saved contract IDs',async()=>{
 const server=await startStudioServer({port:0});let browser;
 try{
  browser=await launchChromium();const page=await browser.page(server.origin+'/web/flow.html');
  const result=await page.evaluate(`(async()=>{
   const {editor}=await import('/web/flow.mjs'),$=id=>document.getElementById(id);
   const labels=Object.fromEntries([...document.querySelectorAll('[data-contract]')].map(b=>[b.dataset.contract,b.textContent]));
   const signatures=[...document.querySelectorAll('#catalog small')].map(n=>n.textContent);
   const search=q=>{$('catalog-search').value=q;$('catalog-search').dispatchEvent(new Event('input'));return [...document.querySelectorAll('[data-contract]')].map(b=>b.dataset.contract);};
   const russian=search('округлить вниз'),technical=search('std.text.concat');
   document.querySelector('[data-contract="std.text.concat"]').click();
   const node=editor.workspace.graph.nodes.find(n=>n.uses==='std.text.concat');
   const card=document.querySelector('[data-flow-node="'+node.id+'"]');
   const title=card.querySelector('header').textContent,ports=[...card.querySelectorAll('.structured-port-row')].map(n=>n.textContent);
   const stored=JSON.parse(localStorage.getItem('ems.studio.flow.v1')).graph.nodes.find(n=>n.id===node.id).uses;
   return {labels,signatures,russian,technical,title,ports,stored,error:$('error').textContent};
  })()`);
  assert.equal(result.labels['std.number.floor'],'Округлить вниз');
  assert.equal(result.labels['std.number.ceil'],'Округлить вверх');
  assert.equal(result.labels['std.text.length'],'Длина текста');
  assert.equal(result.labels['std.text.contains'],'Текст содержит');
  assert.ok(Object.values(result.labels).every(label=>!/^std\.|^core\./.test(label)));
  assert.ok(result.signatures.every(label=>! /Number|String|Boolean/.test(label)));
  assert.deepEqual(result.russian,['std.number.floor']);assert.deepEqual(result.technical,['std.text.concat']);
  assert.match(result.title,/Объединить текст/);assert.ok(result.ports.some(label=>label.includes('Текст')));
  assert.ok(result.ports.every(label=>!label.includes('String')));assert.equal(result.stored,'std.text.concat');assert.equal(result.error,'');
 }finally{await browser?.close();await server.close();}
});
