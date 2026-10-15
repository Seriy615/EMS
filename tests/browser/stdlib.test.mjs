import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {serveQA} from '../../tools/lib/qa-server.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';
import {startStudioServer} from '../../tools/serve.mjs';
import {createCoreRegistry} from '../../src/reference/registry.mjs';
import {lowerGraphToIR,serializeIR,compileIRToJS} from '../../src/ir/index.mjs';
import {encodeValue} from '../../src/conformance/index.mjs';
import {vectors} from '../fixtures/stdlib-vectors.mjs';

test('all 37 standard contracts match signed-zero oracles in actual Chromium runtime and independent standalone',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ems-browser-stdlib-'));let browser,runtime,staticServer;
 try{
  const registry=createCoreRegistry(),programs=[];
  for(const [id,args,expected] of vectors){const ir=lowerGraphToIR({schemaVersion:'0.1',id:'test.library',version:'1.0.0',inputs:{},output:{type:registry.resolve(id).output},nodes:[{id:'value',uses:id,args:Object.fromEntries(Object.entries(args).map(([key,value])=>[key,{literal:value}]))}],returns:{node:'value'}},registry);const module='vector_'+programs.length;programs.push({id,module,ir:serializeIR(ir,registry),expected:encodeValue(expected)});await writeFile(join(dir,module+'.mjs'),compileIRToJS(ir,registry));}
  await writeFile(join(dir,'index.html'),'<!doctype html><title>EMS standalone standard library QA</title>');await writeFile(join(dir,'codec.mjs'),await readFile(new URL('../../src/conformance/index.mjs',import.meta.url),'utf8'));
  browser=await launchChromium();runtime=await serveQA(resolve(import.meta.dirname,'../..'),{runtime:true});staticServer=await serveQA(dir);const page=await browser.page(runtime.origin+'/index.html');
  const values=await page.evaluate(`(async()=>{const {createCoreRegistry}=await import('/src/reference/registry.mjs'),{parseIR,executeIR}=await import('/src/ir/index.mjs'),{encodeValue}=await import('/src/conformance/index.mjs');const registry=createCoreRegistry(),result=[];for(const vector of ${JSON.stringify(programs)})result.push(encodeValue(await executeIR(parseIR(vector.ir,registry),{},registry)));return result;})()`);
  assert.deepEqual(values,programs.map(item=>item.expected));await page.close();await runtime.close();runtime=null;
  const independent=await browser.page(staticServer.origin+'/index.html');const exported=await independent.evaluate(`(async()=>{const {encodeValue}=await import('./codec.mjs'),result=[];for(const id of ${JSON.stringify(programs.map(item=>item.module))})result.push(encodeValue((await import('./'+id+'.mjs')).execute({})));return result;})()`);assert.deepEqual(exported,programs.map(item=>item.expected));assert.equal(staticServer.requests.some(path=>path.startsWith('/src/')),false);
 }finally{await browser?.close();await runtime?.close();await staticServer?.close();await rm(dir,{recursive:true,force:true});}
});

test('actual Studio catalog filtering builds text comparison selection and array graphs and persists them',async()=>{
 const server=await startStudioServer({port:0,recordModules:true});let browser;
 try{
  browser=await launchChromium();const page=await browser.page(server.origin+'/web/index.html',{httpDiagnostics:()=>server.moduleDiagnostics()});
  const actual=await page.evaluate(`(async()=>{
   await import('/web/studio.mjs');const click=selector=>document.querySelector(selector).click();
   function filter(category,query=''){const field=document.querySelector('#catalog-category');field.value=category;field.dispatchEvent(new Event('change'));const search=document.querySelector('#catalog-search');search.value=query;search.dispatchEvent(new Event('input'));}
   function literal(port,value){const field=document.querySelector('[data-literal="'+port+'"]');field.value=value;field.closest('.argument').querySelector('button').click();}
   function output(node){click('[data-node="'+node+'"][data-port="out"]');click('[data-node="output"][data-port="return"]');}
   async function run(){click('#run');const deadline=Date.now()+5000;while(document.querySelector('#run').disabled){if(Date.now()>deadline)throw new Error('Run timeout');await new Promise(resolve=>setTimeout(resolve,10));}const failure=document.querySelector('#error').textContent;if(failure)throw new Error('Studio run failed: '+failure+'; '+document.querySelector('#execution-log').textContent);return document.querySelector('#output').textContent;}
   filter('text','String');const ids=[...document.querySelectorAll('[data-contract]')].map(item=>item.dataset.contract);click('[data-contract="std.text.concat"]');literal('a','"Hello"');literal('b','" EMS"');output('n1');const text=await run();
   click('#new');filter('comparison');click('[data-contract="std.number.greater"]');literal('a','3');literal('b','1');output('n1');const comparison=await run();filter('selection');click('[data-contract="std.select.Number"]');literal('whenTrue','10');literal('whenFalse','20');click('[data-node="n1"][data-port="out"]');click('[data-node="n2"][data-port="condition"]');output('n2');const selection=await run();
   const example=document.querySelector('#examples');example.value='library';example.dispatchEvent(new Event('change'));const deadline=Date.now()+5000;while(example.value){if(Date.now()>deadline)throw new Error('Example load timeout');await new Promise(resolve=>setTimeout(resolve,10));}const report=await run();
   click('#new');filter('array');click('[data-contract="std.array.sort"]');literal('values','[3,1,-0,0]');output('n1');const array=await run();click('#save');filter('text','no such contract');const empty=document.querySelector('#catalog').textContent;return {report,ids,text,comparison,selection,array,empty,error:document.querySelector('#error').textContent};
  })()`);
  assert.ok(actual.ids.includes('std.text.concat'));assert.ok(actual.ids.every(id=>id.startsWith('std.text.')));assert.equal(actual.report,'"sum=6"');assert.equal(actual.text,'"Hello EMS"');assert.equal(actual.comparison,'true');assert.equal(actual.selection,'10');assert.equal(actual.array,'[-0,0,1,3]');assert.match(actual.empty,/не найдены/);assert.equal(actual.error,'');
  await page.close();const reopened=await browser.page(server.origin+'/web/index.html',{httpDiagnostics:()=>server.moduleDiagnostics()});const loaded=await reopened.evaluate(`(async()=>{await import('/web/studio.mjs');document.querySelector('#run').click();const deadline=Date.now()+5000;while(document.querySelector('#run').disabled){if(Date.now()>deadline)throw new Error('Run timeout');await new Promise(resolve=>setTimeout(resolve,10));}return document.querySelector('#output').textContent;})()`);assert.equal(loaded,'[-0,0,1,3]');
 }finally{await browser?.close();await server.close();}
});
