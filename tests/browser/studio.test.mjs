import test from 'node:test';
import assert from 'node:assert/strict';
import {startStudioServer} from '../../tools/serve.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';
import {writeFile,mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('actual IDE create/connect/run/save/reload and invalid type rejection use real DOM controls',async()=>{
 const server=await startStudioServer({port:0}),downloads=await mkdtemp(join(tmpdir(),'ems-studio-download-'));let browser;
 try{
  browser=await launchChromium();const page=await browser.page(server.origin);await page.viewport(1440,900);
  const result=await page.evaluate(`(async()=>{
   await import('/web/studio.mjs');
   const click=selector=>{const element=document.querySelector(selector);if(!element)throw new Error('Missing '+selector);element.click();};
   function input(name,type,value){document.querySelector('#input-name').value=name;document.querySelector('#input-type').value=type;document.querySelector('#add-input').requestSubmit();document.querySelector('[data-input-value="'+name+'"]').value=value;[...document.querySelectorAll('#inspector button')].find(button=>button.textContent==='Применить значение').click();}
   input('x','Number','2');input('y','Number','3');click('[data-contract="core.add"]');
   click('[data-node="input:x"][data-port="out"]');click('[data-node="n1"][data-port="a"]');click('[data-node="input:y"][data-port="out"]');click('[data-node="n1"][data-port="b"]');click('[data-node="n1"][data-port="out"]');click('[data-node="output"][data-port="return"]');
   click('#run');await new Promise(resolve=>setTimeout(resolve,30));const output=document.querySelector('#output').textContent;
   input('text','String','"bad"');click('[data-node="input:text"][data-port="out"]');click('[data-node="n1"][data-port="a"]');const invalid=document.querySelector('#error').textContent;click('#save');
   return {output,invalid,saved:document.querySelector('#save-status').textContent,wires:document.querySelectorAll('.wire').length};
  })()`);
  assert.equal(result.output,'5');assert.match(result.invalid,/TYPE_MISMATCH/);assert.equal(result.saved,'Сохранено локально');assert.equal(result.wires,3);
  const start=await page.evaluate(`(()=>{const rect=document.querySelector('[data-card="n1"] header').getBoundingClientRect();return {x:rect.x+30,y:rect.y+15};})()`);
  await page.mouse('mousePressed',{...start,button:'left',buttons:1,clickCount:1});await page.mouse('mouseMoved',{x:start.x+60,y:start.y+40,button:'left',buttons:1});await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await page.mouse('mouseReleased',{x:start.x+60,y:start.y+40,button:'left',buttons:0,clickCount:1});
  const history=await page.evaluate(`(()=>{const card=()=>document.querySelector('[data-card="n1"]').style.left;const moved=card();document.querySelector('#undo').click();const undone=card();document.querySelector('#redo').click();document.querySelector('#zoom-in').click();return {moved,undone,redone:card(),zoom:document.querySelector('#zoom').textContent,id:document.querySelector('#projects').value};})()`);
  assert.equal(history.moved,'340px');assert.equal(history.undone,'280px');assert.equal(history.redone,'340px');assert.equal(history.zoom,'120%');
  await page.downloads(downloads);await page.evaluate(`document.querySelector('#export').click()`);
  let exported;for(let retry=0;retry<100;retry++){try{exported=await readFile(join(downloads,history.id+'.ems.json'),'utf8');break;}catch{await new Promise(resolve=>setTimeout(resolve,30));}}
  assert.ok(exported,'Project download did not complete');const data=JSON.parse(exported);assert.equal(data.canvas.positions.n1.x,340);assert.equal(data.canvas.view.scale,1.2);data.inputs.x=8;
  const imported=await page.evaluate(`(async()=>{const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(JSON.stringify(data))}],'import.ems.json',{type:'application/json'}));const field=document.querySelector('#file');field.files=transfer.files;field.dispatchEvent(new Event('change'));await new Promise(resolve=>setTimeout(resolve,60));document.querySelector('#run').click();await new Promise(resolve=>setTimeout(resolve,30));return {output:document.querySelector('#output').textContent,id:document.querySelector('#projects').value};})()`);
  assert.equal(imported.output,'11');assert.notEqual(imported.id,history.id);
  await page.evaluate(`(()=>{const select=document.querySelector('#projects');select.value=${JSON.stringify(history.id)};select.dispatchEvent(new Event('change'));})()`);
  await writeFile('/tmp/ems-studio.png',Buffer.from(await page.screenshot(),'base64'));
  await page.close();const reopened=await browser.page(server.origin);const again=await reopened.evaluate(`(async()=>{await import('/web/studio.mjs');document.querySelector('#run').click();await new Promise(resolve=>setTimeout(resolve,30));return {output:document.querySelector('#output').textContent,inputs:document.querySelectorAll('.input-card').length};})()`);assert.equal(again.output,'5');assert.equal(again.inputs,3);
 }finally{await browser?.close();await server.close();await rm(downloads,{recursive:true,force:true});}
});

test('actual IDE creates, expands, edits and persists recursively nested composite contracts',async()=>{
 const server=await startStudioServer({port:0});let browser;
 try{
  browser=await launchChromium();const page=await browser.page(server.origin);await page.viewport(1440,900);
  const actual=await page.evaluate(`(async()=>{
   await import('/web/studio.mjs');const click=selector=>{const node=document.querySelector(selector);if(!node)throw new Error('Missing '+selector);node.click();};
   const examples=document.querySelector('#examples');examples.value='sum';examples.dispatchEvent(new Event('change'));
   function create(id){document.querySelector('#composite-id').value=id;click('#create-composite');}
   function call(id,node){click('[data-contract="'+id+'"]');for(const port of ['a','b']){click('[data-node="input:'+port+'"][data-port="out"]');click('[data-node="'+node+'"][data-port="'+port+'"]');}click('[data-node="'+node+'"][data-port="out"]');click('[data-node="output"][data-port="return"]');}
   create('user.Sum');call('user.Sum','n1');click('[data-card="n1"]');click('#expand');const expanded=document.querySelector('#scope').textContent;
   click('[data-card="sum"]');const sections=[...document.querySelectorAll('.argument')];sections.find(section=>section.querySelector('label').textContent.startsWith('b ')).querySelector('button').click();
   const field=document.querySelector('[data-literal="b"]');field.value='10';field.closest('.argument').querySelector('button').click();click('#collapse');
   create('user.Outer');call('user.Outer','n2');click('[data-card="n2"]');click('#expand');const outer=document.querySelector('#scope').textContent;click('[data-card="n1"]');click('#expand');const inner=document.querySelector('#scope').textContent;click('#collapse');const back=document.querySelector('#scope').textContent;click('#collapse');click('#run');await new Promise(resolve=>setTimeout(resolve,40));
   return {expanded,outer,inner,back,output:document.querySelector('#output').textContent,saved:document.querySelector('#save-status').textContent,error:document.querySelector('#error').textContent};
  })()`);
  assert.deepEqual(actual,{expanded:'user.Sum',outer:'user.Outer',inner:'user.Sum',back:'user.Outer',output:'12',saved:'Сохранено локально',error:''});
  await page.close();const reopened=await browser.page(server.origin);const restored=await reopened.evaluate(`(async()=>{await import('/web/studio.mjs');document.querySelector('#run').click();await new Promise(resolve=>setTimeout(resolve,40));return {output:document.querySelector('#output').textContent,contracts:[...document.querySelectorAll('[data-open-contract]')].map(node=>node.dataset.openContract)};})()`);
  assert.equal(restored.output,'12');assert.deepEqual(restored.contracts.sort(),['user.Outer','user.Sum']);
 }finally{await browser?.close();await server.close();}
});
