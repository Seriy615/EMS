import test from 'node:test';
import assert from 'node:assert/strict';
import {startStudioServer} from '../../tools/serve.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';
test('actual Chromium call-IR observes already-computed values without exposing ungranted input',async()=>{
 const server=await startStudioServer({port:0});let browser;
 try{browser=await launchChromium();const page=await browser.page(server.origin+'/web/index.html');const result=await page.evaluate(`(async()=>{
 const {createCoreRegistry}=await import('/src/reference/registry.mjs'),{executeIR,lowerGraphToIR}=await import('/src/ir/index.mjs'),registry=createCoreRegistry(),graph={schemaVersion:'0.1',id:'test.Graph',version:'1.0.0',inputs:{x:{type:'Number'},secret:{type:'String'}},output:{type:'Number'},nodes:[{id:'sum',uses:'core.add',args:{a:{input:'x'},b:{literal:2}}},{id:'twice',uses:'core.mul',args:{a:{node:'sum'},b:{node:'sum'}}}],returns:{node:'twice'}},events=[],plain=[];
 const ir=lowerGraphToIR(graph,registry),input={x:3,secret:'BROWSER_GRAPH_PRIVATE_SENTINEL'},value=await executeIR(ir,input,registry,{graphInspection:{allow:[{function:graph.id,declarations:['/graph/inputs/x','/graph/nodes/sum']}]},onNodeEnter:e=>events.push(e)});await executeIR(ir,input,registry,{onNodeEnter:e=>plain.push(e)});return {value,first:events[0].inspection.variables.map(v=>v.status),computed:events[1].inspection.variables[1].value,leak:JSON.stringify(events).includes(input.secret),defaultValues:plain.some(e=>Object.hasOwn(e,'inspection')),calls:events.length};
 })()`);assert.deepEqual(result,{value:25,first:['value','not-evaluated'],computed:5,leak:false,defaultValues:false,calls:2});await page.close();
 }finally{await browser?.close();await server.close();}
});
