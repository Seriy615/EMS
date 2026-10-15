import test from 'node:test';
import assert from 'node:assert/strict';
import {startStudioServer} from '../../tools/serve.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {serveQA} from '../../tools/lib/qa-server.mjs';
import {ProjectEditor,parseProject} from '../../src/studio/project.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';

test('actual IDE creates typed visual Map/Filter, edits composite predicate and persists v3 across reopen',async()=>{
 const server=await startStudioServer({port:0});let browser,staticServer,closed=false;const directory=await mkdtemp(join(tmpdir(),'ems-visual-collections-browser-'));
 try{
  browser=await launchChromium();const page=await browser.page(server.origin+'/web/index.html');
  const result=await page.evaluate(`(async()=>{
   await import('/web/studio.mjs');const click=selector=>{const element=document.querySelector(selector);if(!element)throw new Error('Missing '+selector);element.click();};
   function input(name,type,value){document.querySelector('#input-name').value=name;document.querySelector('#input-type').value=type;document.querySelector('#add-input').requestSubmit();const field=document.querySelector('[data-input-value="'+name+'"]');field.value=value;[...document.querySelectorAll('#inspector button')].find(button=>button.textContent==='Применить значение').click();}
   function wire(from,to,port){click('[data-node="'+from+'"][data-port="out"]');click('[data-node="'+to+'"][data-port="'+port+'"]');}
   function collection(id,operation,callback){document.querySelector('#collection-id').value=id;const field=document.querySelector('#collection-operation');field.value=operation;field.dispatchEvent(new Event('change'));document.querySelector('#collection-callback').value=callback;click('#create-collection');}
   async function run(){click('#run');const deadline=Date.now()+5000;while(document.querySelector('#run').disabled){if(Date.now()>deadline)throw new Error('Run did not settle');await new Promise(resolve=>setTimeout(resolve,10));}return document.querySelector('#output').textContent;}
   input('value','Number','1');click('[data-contract="std.number.greater"]');wire('input:value','n1','a');wire('n1','output','return');document.querySelector('#composite-id').value='user.Positive';click('#create-composite');
   collection('user.Abs','map','std.number.abs');collection('user.Filter','filter','user.Positive');input('values','NumberArray','[-2,-0,3]');click('[data-contract="user.Abs"]');wire('input:values','n2','values');click('[data-contract="user.Filter"]');wire('n2','n3','values');wire('n3','output','return');const initial=await run();
   click('[data-card="n3"]');click('[data-open-collection-callback="user.Filter"]');const scope=document.querySelector('#scope').textContent;click('[data-card="n1"]');const literal=document.querySelector('[data-literal="b"]');literal.value='2';literal.closest('.argument').querySelector('button').click();click('#collapse');const edited=await run();click('#undo');const undone=await run();click('#redo');click('#save');
   const storage=JSON.parse(localStorage.getItem('ems.studio.projects.v1')),saved=JSON.parse(storage.projects[storage.active]);click('#text-mode');click('#text-from-graph');const text=await run();return {initial,scope,edited,undone,text,schema:saved.schemaVersion,collections:saved.collections.map(item=>item.id),error:document.querySelector('#error').textContent};
  })()`);
  assert.deepEqual(result,{initial:'[2,3]',scope:'user.Positive',edited:'[3]',undone:'[2,3]',text:'[3]',schema:'ems-studio-project/3',collections:['user.Abs','user.Filter'],error:''});
  await page.close();const reopened=await browser.page(server.origin+'/web/index.html');const restored=await reopened.evaluate(`(async()=>{await import('/web/studio.mjs');document.querySelector('#run').click();const deadline=Date.now()+5000;while(document.querySelector('#run').disabled){if(Date.now()>deadline)throw new Error('Run timeout');await new Promise(resolve=>setTimeout(resolve,10));}return {output:document.querySelector('#output').textContent,bindings:[...document.querySelectorAll('[data-delete-collection]')].map(node=>node.dataset.deleteCollection)};})()`);assert.equal(restored.output,'[3]');assert.deepEqual(restored.bindings.sort(),['user.Abs','user.Filter']);
  const saved=await reopened.evaluate(`(()=>{const data=JSON.parse(localStorage.getItem('ems.studio.projects.v1'));return data.projects[data.active];})()`);await writeFile(join(directory,'program.mjs'),new ProjectEditor(parseProject(saved)).compile());await writeFile(join(directory,'index.html'),'<!doctype html><title>Independent visual EMS program</title>');staticServer=await serveQA(directory);await reopened.close();await server.close();closed=true;const independent=await browser.page(staticServer.origin+'/index.html');assert.deepEqual(await independent.evaluate(`(async()=>{const {execute}=await import('./program.mjs');return execute({value:1,values:[-2,-0,3]});})()`),[3]);assert.equal(staticServer.requests.some(path=>path.startsWith('/src/')),false);
 }finally{await browser?.close();if(!closed)await server.close();await staticServer?.close();await rm(directory,{recursive:true,force:true});}
});
