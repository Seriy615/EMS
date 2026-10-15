import test from 'node:test';
import assert from 'node:assert/strict';
import {startStudioServer} from '../../tools/serve.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';
async function until(page,expression){const end=Date.now()+15000;let last;while(Date.now()<end){try{last=await page.evaluate(expression);if(last)return last;}catch(error){last=error.message;}await new Promise(resolve=>setTimeout(resolve,30));}throw Error('Browser condition deadline: '+String(last));}
const source='@app::Main(limit:Number)->Number {let mut total=0;let mut i=0;while i<limit {i=i+1;if i==2 {continue;}if i>4 {break;}total=total+i;}return total;}';
async function seed(page,nested){return page.evaluate(`(async()=>{const {ProjectManager,workspaceSource}=await import('/src/studio/manager.mjs'),{newProject,serializeProject}=await import('/src/studio/project.mjs');const record={id:'main',name:'Моя программа',kind:'graph',source:serializeProject(newProject('main','Моя программа')),draft:{schemaVersion:'ems-studio-text/1',source:${JSON.stringify(source)},entry:'app.Main',lowering:'auto',inputs:'{"limit":6}'}};new ProjectManager(localStorage).save(${nested?"{id:'app',name:'Проект',kind:'workspace',source:workspaceSource([{path:'logic/source.ems.json',record}]),draft:null}":'record'});return JSON.stringify(record);})()`);}
async function run(page,expected){await page.evaluate(`document.getElementById('run').click()`);await until(page,`!document.getElementById('run').disabled`);assert.deepEqual(await page.evaluate(`({value:document.getElementById('output').textContent,error:document.getElementById('error').textContent})`),{value:String(expected),error:''});}
for(const nested of [false,true])test('saved '+(nested?'workspace':'standalone')+' source opens and edits ordinary contracts, preserves source and saves a runnable graph',async()=>{
 const server=await startStudioServer({port:0});let browser;
 try{
  browser=await launchChromium();let page=await browser.page(server.origin+'/web/projects.html');const original=await seed(page,nested);await page.close();
  const query=nested?'?project=app&file=main':'?project=main';page=await browser.page(server.origin+'/'+query);await page.viewport(390,844);
  await until(page,`location.pathname==='/web/flow.html'&&!!document.querySelector('#return-source')&&!!document.querySelector('[data-contract-id="std.control.If"]')`);
  assert.equal(await page.evaluate(`new URLSearchParams(location.search).get('source')`),'1');
  assert.equal(await page.evaluate(`document.querySelectorAll('.block-card').length`),0);
  const textPage=await browser.page(await page.evaluate(`document.querySelector('#return-source').href`));await until(textPage,`document.querySelector('#text-source')?.value===${JSON.stringify(source)}&&!document.querySelector('#text-panel').hidden`);await textPage.close();
  await run(page,8);
  const edited=await page.evaluate(`(async()=>{const {editor}=await import('/web/flow.mjs'),node=editor.project.graph.nodes.find(n=>n.uses==='core.add'&&n.args.b.literal===1),field=document.querySelector('[data-flow-literal="'+node.id+':b"]');field.value='2';field.form.requestSubmit();return {id:node.id,error:document.querySelector('#error').textContent};})()`);assert.equal(edited.error,'');await run(page,4);
  await page.reload();await until(page,`!!document.querySelector('[data-flow-literal="'+${JSON.stringify(edited.id)}+':b"]')`);
  assert.equal(await page.evaluate(`document.querySelector('[data-flow-literal="'+${JSON.stringify(edited.id)}+':b"]').value`),'2');
  await page.evaluate(`document.querySelector('#save').click()`);
  await until(page,`location.pathname==='/web/flow.html'&&!new URLSearchParams(location.search).has('source')&&new URLSearchParams(location.search).get('file')==='main_flow'&&!!document.querySelector('[data-contract-id="std.control.If"]')`);
  await run(page,4);
  const saved=await page.evaluate(`(async()=>{const {ProjectManager,parseWorkspaceFiles}=await import('/src/studio/manager.mjs'),manager=new ProjectManager(localStorage),files=parseWorkspaceFiles(manager.load(${JSON.stringify(nested?'app':'main')}).source).files;return {source:JSON.stringify(files.find(f=>f.record.id==='main').record),graph:files.find(f=>f.record.id==='main_flow').record.kind,errors:document.querySelector('#error').textContent};})()`);assert.deepEqual(saved,{source:original,graph:'flow',errors:''});
  await page.close();page=await browser.page(server.origin+'/web/index.html?project='+(nested?'app':'main')+'&file=main&text=1');
  await until(page,`(async()=>{await import('/web/studio.mjs');return document.querySelector('#text-source')?.value===${JSON.stringify(source)};})()`);
  assert.equal(await page.evaluate(`location.pathname`),'/web/index.html');
 }finally{await browser?.close();await server.close();}
});
