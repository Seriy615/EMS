import test from 'node:test';
import assert from 'node:assert/strict';
import {GraphStepper} from '../src/studio/debugger.mjs';
import {ProjectEditor,newProject} from '../src/studio/project.mjs';
import {compileTextDraft,runTextDraft,compileTextJS} from '../src/studio/text.mjs';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {executeGraph} from '../src/reference/runtime.mjs';
import {executeIR,serializeIR} from '../src/ir/index.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
const draft=source=>({source,entry:'test',lowering:'auto'});
function debuggerFor(options={}){
 const pauses=[],entered=[],exits=[],gate=new GraphStepper(e=>pauses.push(e),options);
 const hooks={onControlEnter:e=>{entered.push(structuredClone(e));return gate.enter(e);},onNodeEnter:e=>{entered.push(structuredClone(e));return gate.enter(e);},onFrameExit:e=>{exits.push(structuredClone(e));gate.leave(e);}};
 return {pauses,entered,exits,gate,hooks};
}
const inner={schemaVersion:'0.1',id:'user.Inner',version:'1.0.0',inputs:{},output:{type:'Number'},nodes:[{id:'add',uses:'core.add',args:{a:{literal:2},b:{literal:3}}}],returns:{node:'add'}};
function graphs(){const registry=createCoreRegistry();registry.registerComposite({id:inner.id,version:'1.0.0',graph:inner});const root={...inner,id:'test.Root',nodes:[{id:'wrapper',uses:inner.id,args:{}},{id:'last',uses:'core.add',args:{a:{node:'wrapper'},b:{literal:3}}}],returns:{node:'last'}};return {registry,root};}

test('Step Over completes a control statement and nested call, Step Out of root finishes, compiled output agrees',async()=>{
 const text=draft('fn child(x:Number)->Number {return x*2;} fn test()->Number {let mut a=child(3);let b=a+1;return b;}'),editor=new ProjectEditor(),bundle=compileTextDraft(text,editor),before=serializeIR(bundle.ir,bundle.registry),dbg=debuggerFor();
 const run=runTextDraft(text,editor,{},dbg.hooks);await tick();const first=dbg.pauses[0];assert.equal(first.node,'/body/0');assert.equal(first.frames.length,1);
 assert.equal(dbg.gate.resume(first.token,'over'),true);await tick();assert.equal(dbg.pauses.length,2);assert.equal(dbg.pauses[1].node,'/body/1');assert.deepEqual(dbg.pauses[1].frames,first.frames);assert.ok(dbg.entered.some(e=>e.function==='child'));assert.ok(dbg.exits.some(e=>e.frames.length===2));
 assert.equal(dbg.gate.resume(dbg.pauses[1].token,'out'),true);assert.equal(await run,7);assert.equal(dbg.pauses.length,2);assert.equal(serializeIR(bundle.ir,bundle.registry),before);
 const compiled=await import('data:text/javascript,'+encodeURIComponent(compileTextJS(text,editor)));assert.equal(await compiled.execute({}),7);
});
test('recursive function activations have distinct IDs and Step Out waits for actual selected frame completion',async()=>{
 const text=draft('fn recur(n:Number)->Number {if n>0 {return recur(n-1)+1;}return 0;} fn test()->Number {let a=recur(3);return a;}'),dbg=debuggerFor({start:'continue',breakpoints:[{profile:'control',function:'recur',node:'/body/0'}]});
 const run=runTextDraft(text,new ProjectEditor(),{},dbg.hooks);await tick();const first=dbg.pauses[0];assert.equal(first.function,'recur');assert.equal(first.frames.length,2);
 dbg.gate.update(first.token,[]);dbg.gate.resume(first.token,'out');await tick();const caller=dbg.pauses[1];assert.equal(caller.function,'test');assert.equal(caller.node,'/body/1');assert.ok(dbg.exits.some(e=>e.frames.at(-1)===first.frames.at(-1)));assert.equal(caller.frames.length,1);
 const recursion=dbg.entered.filter(e=>e.function==='recur');assert.equal(new Set(recursion.map(e=>e.frames.at(-1))).size,4);assert.ok(recursion.some(e=>e.frames.length===5));dbg.gate.resume(caller.token,'continue');assert.equal(await run,3);
});
test('graph Step Over skips composite internals and graph Step Out returns to its actual caller',async()=>{
 const {root,registry}=graphs();const over=debuggerFor(),run=executeGraph(root,{},registry,over.hooks);await tick();assert.equal(over.pauses[0].callPath.at(-1).node,'wrapper');over.gate.resume(over.pauses[0].token,'over');await tick();assert.equal(over.pauses[1].callPath.at(-1).node,'last');assert.equal(over.pauses.length,2);over.gate.resume(over.pauses[1].token,'out');assert.equal(await run,8);
 const out=debuggerFor(),again=executeGraph(root,{},registry,out.hooks);await tick();out.gate.resume(out.pauses[0].token,'step');await tick();const leaf=out.pauses[1];assert.equal(leaf.frames.length,2);assert.equal(leaf.callPath.at(-1).node,'add');out.gate.resume(leaf.token,'out');await tick();assert.equal(out.pauses[2].callPath.at(-1).node,'last');assert.equal(out.pauses[2].frames.length,1);assert.ok(out.exits.some(e=>e.frames.at(-1)===leaf.frames.at(-1)));out.gate.resume(out.pauses[2].token,'continue');assert.equal(await again,8);
});
test('mixed control-to-composite graph Step Out shares activation ancestry across evaluators',async()=>{
 const {registry}=graphs(),editor=new ProjectEditor(newProject('pMixed'),registry),text=draft('fn test()->Number {let mut a=user.Inner();return a+1;}'),dbg=debuggerFor({start:'continue',breakpoints:[{profile:'graph',graph:inner.id,node:'add'}]});
 const run=runTextDraft(text,editor,{},dbg.hooks);await tick();const leaf=dbg.pauses[0];assert.equal(leaf.profile,undefined);assert.equal(leaf.frames.length,2);dbg.gate.update(leaf.token,[]);dbg.gate.resume(leaf.token,'out');await tick();const parent=dbg.pauses[1];assert.equal(parent.profile,'control');assert.equal(parent.function,'test');assert.equal(parent.node,'/body/1');assert.deepEqual(parent.frames,leaf.frames.slice(0,1));dbg.gate.resume(parent.token,'continue');assert.equal(await run,6);
});
test('async siblings with the same function name stay distinct and Out does not block their original progress',async()=>{
 const text=draft('async fn child(x:Number)->Number {return x+1;} async fn test()->Number {let a=child(2);let b=child(3);return await a+await b;}'),dbg=debuggerFor();let done=false;
 const run=runTextDraft(text,new ProjectEditor(),{},dbg.hooks).finally(()=>done=true);await tick();
 while(dbg.pauses.at(-1).function!=='child'){const last=dbg.pauses.at(-1);dbg.gate.resume(last.token,'step');await tick();}
 const child=dbg.pauses.at(-1),at=dbg.pauses.length;assert.equal(child.frames.length,2);dbg.gate.resume(child.token,'out');await tick();
 if(!done){const next=dbg.pauses.at(-1);assert.equal(dbg.pauses.length,at+1);assert.equal(next.function,'test');assert.ok(dbg.exits.some(e=>e.frames.at(-1)===child.frames.at(-1)));dbg.gate.resume(next.token,'continue');}
 assert.equal(await run,7);assert.equal(new Set(dbg.entered.filter(e=>e.function==='child').map(e=>e.frames.at(-1))).size,2);
 const compiled=await import('data:text/javascript,'+encodeURIComponent(compileTextJS(text,new ProjectEditor())));assert.equal(await compiled.execute({}),7);
});
test('breakpoints interrupt Over, old tokens and missing activation metadata cannot invent a frame step',async()=>{
 const text=draft('fn child()->Number {return 3;} fn test()->Number {let mut a=child();return a;}'),dbg=debuggerFor({breakpoints:[{profile:'control',function:'child',node:'/body/0'}]});const run=runTextDraft(text,new ProjectEditor(),{},dbg.hooks);await tick();const first=dbg.pauses[0];assert.equal(dbg.gate.resume(999,'over'),false);dbg.gate.resume(first.token,'over');await tick();assert.equal(dbg.pauses[1].function,'child');dbg.gate.update(dbg.pauses[1].token,[]);dbg.gate.resume(dbg.pauses[1].token,'out');await tick();assert.equal(dbg.pauses[2].function,'test');dbg.gate.resume(dbg.pauses[2].token,'continue');assert.equal(await run,3);
 const pauses=[],gate=new GraphStepper(e=>pauses.push(e)),pending=gate.enter({phase:'enter',kind:'legacy'});assert.equal(gate.resume(pauses[0].token,'over'),false);assert.equal(gate.resume(pauses[0].token,'out'),false);gate.resume(pauses[0].token,'continue');await pending;
});
test('frame exit payloads are detached, rejection cannot replace errors, cleanup and step budgets are preserved',async()=>{
 const text=draft('fn child()->Number {using cell=resource.cell(3);return core.div(1,0);} fn test()->Number {return child();}'),editor=new ProjectEditor(),closed=[],exits=[];
 await assert.rejects(runTextDraft(text,editor,{}, {onFrameExit:e=>{exits.push(structuredClone(e));e.frames.length=0;return Promise.reject(Error('observer'));},onResourceCleanup:e=>closed.push(e.resource),onControlEnter:e=>{e.frames.length=0;}}),{code:'DIV_BY_ZERO'});assert.deepEqual(closed,[0]);assert.deepEqual(exits.map(e=>e.frames.length),[2,1]);assert.ok(exits.every(e=>Object.keys(e).join(',')==='frames'));
 const bundle=compileTextDraft(draft('fn test()->Number {using cell=resource.cell(3);while true {}return 0;}'),editor),limited=[];await assert.rejects(executeIR(bundle.ir,{},bundle.registry,{maxSteps:20,onFrameExit:()=>{throw Error('observer');},onResourceCleanup:e=>limited.push(e.resource)}),{code:'STEP_LIMIT'});assert.deepEqual(limited,[0]);
 assert.equal(await runTextDraft(draft('fn test()->Number {return 1;}'),editor,{}, {onFrameExit:()=>new Promise(()=>{})}),1);
 await assert.rejects(runTextDraft(draft('fn test()->Number {return 1;}'),editor,{}, {onFrameExit:1}),{code:'INVALID_OPTION'});
});
test('cancellation while frame stepping closes resources and exits the selected activation',async()=>{
 const text=draft('fn test()->Number {using cell=resource.cell(3);return resource.read(cell);}'),dbg=debuggerFor(),controller=new AbortController(),closed=[];
 const run=runTextDraft(text,new ProjectEditor(),{}, {...dbg.hooks,signal:controller.signal,onResourceCleanup:e=>closed.push(e.resource)});await tick();dbg.gate.resume(dbg.pauses[0].token,'over');await tick();assert.equal(dbg.pauses[1].kind,'return');controller.abort();await assert.rejects(run,{code:'CANCELLED'});assert.deepEqual(closed,[0]);assert.equal(dbg.exits.length,1);
});
