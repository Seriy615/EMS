import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectEditor} from '../src/studio/project.mjs';
import {compileTextDraft,runTextDraft,compileTextJS} from '../src/studio/text.mjs';
import {executeIR,serializeIR,parseIR} from '../src/ir/index.mjs';
import {GraphStepper} from '../src/studio/debugger.mjs';
const draft=source=>({source,entry:'test',lowering:'auto'});
const source='fn twice(x:Number)->Number {return x*2;}\nfn test(x:Number)->Number {let mut n=0;while n<2 {n=n+1;}if x>0 {return twice(n);}else {return core.div(1,0);}}';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('control debugger pauses the real evaluator and exact source sidecar survives semantic IR roundtrip',async()=>{
 const editor=new ProjectEditor(),text=draft(source),bundle=compileTextDraft(text,editor),pauses=[];
 assert.equal(bundle.ir.schemaVersion,'ems-ir/2');const serialized=serializeIR(bundle.ir,bundle.registry);
 assert.equal(serializeIR(parseIR(serialized,bundle.registry),bundle.registry),serialized);
 const shifted=compileTextDraft(draft('// offset only\n'+source),editor);assert.equal(serializeIR(shifted.ir,shifted.registry),serialized);
 let gate;gate=new GraphStepper(pause=>pauses.push(pause));let settled=false;
 const run=runTextDraft(text,editor,{x:1},{onControlEnter:e=>gate.enter(e)}).finally(()=>{settled=true;});
 await tick();assert.equal(settled,false);assert.equal(pauses[0].kind,'let');assert.equal(pauses[0].function,'test');assert.match(source.slice(pauses[0].location.start.offset,pauses[0].location.end.offset),/^let mut n=0/);
 const first=pauses[0];assert.equal(gate.resume(first.token,'step'),true);await tick();assert.equal(pauses[1].kind,'literal');assert.equal(settled,false);
 assert.equal(gate.resume(pauses[1].token,'continue'),true);assert.equal(await run,4);
 const compiled=await import('data:text/javascript,'+encodeURIComponent(compileTextJS(text,editor)));assert.equal(await compiled.execute({x:1}),4);
 const events=[];assert.equal(await runTextDraft(text,editor,{x:1},{onControlEnter:event=>events.push(event)}),4);
 assert.ok(events.some(e=>e.function==='twice'&&e.callStack.join('/')==='test/twice'));
 assert.ok(!events.some(e=>e.kind==='call'&&source.slice(e.location.start.offset,e.location.end.offset)==='core.div(1,0)'));
 assert.equal(events.filter(e=>e.node==='/body/1/condition'&&e.kind==='binary').length,3);
 for(const event of events){assert.ok(event.location);assert.deepEqual(Object.keys(event).sort(),['phase','profile','function','node','kind','type','callStack','step','location'].sort());assert.ok(event.location.end.offset<=source.length);}
});
test('observer mutation/rejection preserves user catches, finally and terminal budgets/cancellation',async()=>{
 const editor=new ProjectEditor(),text=draft('fn test()->Number {try {throw 1;} catch(e:Number){return e+2;} finally {let checked=4;}}');
 assert.equal(await runTextDraft(text,editor,{}, {onControlEnter:e=>{e.callStack.length=0;e.location.start.offset=999;throw new Error('observer');}}),3);
 const looping=compileTextDraft(draft('fn test()->Number {try {while true {}} finally {return 8;}}'),editor);
 await assert.rejects(executeIR(looping.ir,{},looping.registry,{maxSteps:20,onControlEnter:()=>Promise.reject('ignored')}),{code:'STEP_LIMIT'});
 const controller=new AbortController();let entered;const ready=new Promise(resolve=>{entered=resolve;});
 const run=executeIR(looping.ir,{},looping.registry,{signal:controller.signal,onControlEnter:()=>{entered();return new Promise(()=>{});}});
 await ready;controller.abort();await assert.rejects(run,{code:'CANCELLED'});
 await assert.rejects(executeIR(looping.ir,{},looping.registry,{onControlEnter:4}),{code:'INVALID_OPTION'});
});
test('concurrent local futures use queued pause tokens without losing tasks or payload-free locations',async()=>{
 const editor=new ProjectEditor(),text=draft('async fn child(x:Number)->Number {return x+1;} async fn test()->Number {let a=child(2);let b=child(3);return await a+await b;}');
 const pauses=[];let gate;gate=new GraphStepper(pause=>{pauses.push(pause);queueMicrotask(()=>gate.resume(pause.token,'step'));});
 assert.equal(await runTextDraft(text,editor,{}, {onControlEnter:e=>gate.enter(e)}),7);
 assert.ok(pauses.some(p=>p.function==='child'&&p.callStack.join('/')==='test/child'));
 assert.equal(new Set(pauses.map(p=>p.token)).size,pauses.length);
 const direct=[];const queue=new GraphStepper(p=>direct.push(p)),one=queue.enter({phase:'enter',kind:'one'}),two=queue.enter({phase:'enter',kind:'two'});
 assert.equal(direct.length,1);assert.equal(queue.resume(1,'step'),true);assert.equal(direct[1].kind,'two');assert.equal(queue.resume(1,'continue'),false);assert.equal(queue.resume(2,'continue'),true);await Promise.all([one,two]);
});
test('call-IR text debug uses its existing node provenance without changing semantic IR',async()=>{
 const events=[];assert.equal(await runTextDraft(draft('fn test()->Number {let value=core.add(2,3);return value;}'),new ProjectEditor(),{}, {onNodeEnter:e=>events.push(e)}),5);
 assert.equal(events.length,1);assert.ok(events[0].location);assert.equal(events[0].inputs.a,'Number');assert.equal(Object.hasOwn(events[0],'arguments'),false);
});
test('resource ownership cleanup survives cancellation while paused and step exhaustion with hooks enabled',async()=>{
 const editor=new ProjectEditor(),text=draft('fn test()->Number {using value=resource.cell(3);return resource.read(value);}'),closed=[];
 const controller=new AbortController();let entered;const ready=new Promise(resolve=>{entered=resolve;});
 const run=runTextDraft(text,editor,{}, {signal:controller.signal,onResourceCleanup:e=>closed.push(e.resource),onControlEnter:e=>{if(e.kind==='return'){entered();return new Promise(()=>{});}}});
 await ready;controller.abort();await assert.rejects(run,{code:'CANCELLED'});assert.deepEqual(closed,[0]);
 await assert.rejects(runTextDraft(text,editor,{}, {onControlEnter:2}),{code:'INVALID_OPTION'});
 const bundle=compileTextDraft(draft('fn test()->Number {using value=resource.cell(3);while true {}return 0;}'),editor),limited=[];
 await assert.rejects(executeIR(bundle.ir,{},bundle.registry,{maxSteps:20,onControlEnter:()=>{},onResourceCleanup:e=>limited.push(e.resource)}),{code:'STEP_LIMIT'});assert.deepEqual(limited,[0]);
});
