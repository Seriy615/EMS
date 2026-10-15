import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startStudioServer} from '../../tools/serve.mjs';
import {serveQA} from '../../tools/lib/qa-server.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';
import {ProjectEditor} from '../../src/studio/project.mjs';
import {compileTextJS} from '../../src/studio/text.mjs';

test('actual Studio text Map/Filter runs shared kernel and independent compiled application survives runtime shutdown',async()=>{
 const source=await readFile('examples/collection-pipeline.ems','utf8'),dir=await mkdtemp(join(tmpdir(),'ems-collections-browser-'));const server=await startStudioServer({port:0});let browser,staticServer,closed=false;
 try{
  await writeFile(join(dir,'program.mjs'),compileTextJS({source,entry:'analyze',lowering:'auto'},new ProjectEditor()));await writeFile(join(dir,'index.html'),'<!doctype html><title>Independent EMS collection application</title>');staticServer=await serveQA(dir);
  browser=await launchChromium();const page=await browser.page(server.origin+'/web/index.html');
  const result=await page.evaluate(`(async()=>{
   await import('/web/studio.mjs');document.querySelector('#text-mode').click();for(const [id,value] of Object.entries({'text-source':${JSON.stringify(source)},'text-entry':'analyze','text-lowering':'auto','text-inputs':'{"values":[-3,0,2]}'})){const field=document.querySelector('#'+id);field.value=value;field.dispatchEvent(new Event('input'));}
   document.querySelector('#run').click();const deadline=Date.now()+5000;while(document.querySelector('#run').disabled){if(Date.now()>deadline)throw new Error('Run did not settle');await new Promise(resolve=>setTimeout(resolve,10));}const output=document.querySelector('#output').textContent;document.querySelector('#text-ir').click();const ir=JSON.parse(document.querySelector('#output').textContent).ir;document.querySelector('#text-to-graph').click();return {output,version:ir.schemaVersion,error:document.querySelector('#error').textContent,functions:ir.functions.map(fn=>fn.id)};
  })()`);
  assert.equal(result.output,'[9,4]');assert.equal(result.version,'ems-ir/2');assert.match(result.error,/UNSUPPORTED_VISUAL_PROFILE/);assert.ok(result.functions.includes('square'));assert.ok(result.functions.includes('keep'));await page.close();await server.close();closed=true;
  const exported=await browser.page(staticServer.origin+'/index.html');const independent=await exported.evaluate(`(async()=>{const {execute}=await import('./program.mjs');return execute({values:[-3,0,2]});})()`);assert.deepEqual(independent,[9,4]);assert.equal(staticServer.requests.some(path=>path.startsWith('/src/')),false);
 }finally{await browser?.close();if(!closed)await server.close();await staticServer?.close();await rm(dir,{recursive:true,force:true});}
});
