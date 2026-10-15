import test from 'node:test';
import assert from 'node:assert/strict';
import {startStudioServer} from '../../tools/serve.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';

test('real Worker and client keep private origin values closed while public explicit grants and normal result survive',async()=>{
 const server=await startStudioServer({port:0,recordModules:true});let browser;
 try{
  browser=await launchChromium();const page=await browser.page(server.origin+'/web/index.html',{httpDiagnostics:()=>server.moduleDiagnostics()});
  const result=await page.evaluate(`(async()=>{
   await import('/web/studio.mjs');const {ProjectEditor}=await import('/src/studio/project.mjs'),{startStudioExecution}=await import('/src/studio/execution-client.mjs'),draft={source:'fn main(open:Number,secret:String)->Number {let mut shown=open;let hidden=secret;return shown;}',entry:'main',lowering:'auto'},originPolicy={schemaVersion:'ems-origin-policy/1',sources:[{kind:'input',function:'main',path:'/inputs/0',classification:'public'},{kind:'input',function:'main',path:'/inputs/1',classification:'private'}]},pauses=[],project=new ProjectEditor().serialize();
   const job=startStudioExecution({action:'text',debug:true,project,draft,inputs:{open:13,secret:'WORKER_ORIGIN_PRIVATE_SENTINEL'},inspection:{schemaVersion:'ems-source-inspection/2',...draft,afterOperations:true,policy:{allow:[{function:'main',declarations:['/inputs/0','/inputs/1','/body/0','/body/1']}],originPolicy}}},{onPause:event=>{pauses.push(event);job.resume('step');}}),value=await job.promise,last=pauses.findLast(e=>e.kind==='return');
   return {value,pauses:pauses.length,publicValue:last.inspection.variables[2].value,status:last.inspection.variables[1].status,hidden:last.inspection.variables[3].status,privateClosed:pauses.every(e=>e.inspection.variables[1].type===null&&!Object.hasOwn(e.inspection.variables[1],'value')),leak:JSON.stringify(pauses).includes('WORKER_ORIGIN_PRIVATE_SENTINEL')};
  })()`);
  assert.equal(result.value,13);assert.ok(result.pauses>2);assert.equal(result.publicValue,13);assert.equal(result.status,'protected-origins');assert.equal(result.hidden,'protected-origins');assert.equal(result.privateClosed,true);assert.equal(result.leak,false);await page.close();
 }finally{await browser?.close();await server.close();}
});
