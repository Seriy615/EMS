import test from 'node:test';
import assert from 'node:assert/strict';
import {GraphStepper,validateBreakpoints,breakpointForEvent} from '../src/studio/debugger.mjs';
import {breakpointAtTextOffset,graphBreakpointIdentity} from '../src/studio/breakpoints.mjs';
import {newProject,ProjectEditor} from '../src/studio/project.mjs';
import {compileTextDraft,runTextDraft} from '../src/studio/text.mjs';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {executeGraph} from '../src/reference/runtime.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const graph={schemaVersion:'0.1',id:'test.Break',version:'1.0.0',inputs:{},output:{type:'Number'},nodes:[{id:'a',uses:'core.add',args:{a:{literal:2},b:{literal:3}}},{id:'b',uses:'core.mul',args:{a:{node:'a'},b:{literal:4}}}],returns:{node:'b'}};
const point=(node,graphId=graph.id)=>({profile:'graph',graph:graphId,node});
const event=node=>({phase:'enter',callPath:[{graph:graph.id,node,contract:'core.add'}],inputs:{},output:'Number',effects:[],capabilities:[]});

test('Continue reaches an exact leaf breakpoint while Step still enters the next actual operation',async()=>{
 const pauses=[],gate=new GraphStepper(p=>pauses.push(p),{start:'continue',breakpoints:[point('b')]}),calls=[];
 const run=executeGraph(graph,{},createCoreRegistry(),{onNodeEnter:async e=>{calls.push(e.callPath.at(-1).node);await gate.enter(e);}});
 await tick();assert.deepEqual(calls,['a','b']);assert.equal(pauses.length,1);assert.equal(pauses[0].callPath.at(-1).node,'b');
 assert.equal(gate.resume(pauses[0].token,'continue'),true);assert.equal(await run,20);
 const all=[],stepping=new GraphStepper(p=>all.push(p),{breakpoints:[point('b')]});const again=executeGraph(graph,{},createCoreRegistry(),{onNodeEnter:e=>stepping.enter(e)});
 await tick();assert.equal(all[0].callPath.at(-1).node,'a');stepping.resume(all[0].token,'step');await tick();assert.equal(all[1].callPath.at(-1).node,'b');stepping.resume(all[1].token,'continue');assert.equal(await again,20);
});
test('composite breakpoint matches its operation once; ancestor paths do not stop every leaf',async()=>{
 const registry=createCoreRegistry();registry.registerComposite({id:'user.Inner',version:'1.0.0',graph:{...graph,id:'user.Inner'}});
 const root={...graph,nodes:[{id:'wrapper',uses:'user.Inner',args:{}}],returns:{node:'wrapper'}},pauses=[];
 const gate=new GraphStepper(p=>pauses.push(p),{start:'continue',breakpoints:[point('wrapper'),point('b','user.Inner')]});
 const run=executeGraph(root,{},registry,{onNodeEnter:e=>gate.enter(e)});await tick();assert.equal(pauses[0].callPath.at(-1).node,'wrapper');gate.resume(pauses[0].token,'continue');await tick();assert.equal(pauses.length,2);assert.equal(pauses[1].callPath.at(-1).node,'b');gate.resume(pauses[1].token,'continue');assert.equal(await run,20);
});
test('fresh text cursor address stops each loop iteration and skips a lazy dead branch',async()=>{
 const source='fn count()->Number {let mut x=0;while x<3 {x=x+1;}if false {return core.div(1,0);}return x;}';
 const draft={source,entry:'count',lowering:'auto'},editor=new ProjectEditor(newProject('pBreak')),bundle=compileTextDraft(draft,editor);
 const loop=breakpointAtTextOffset(bundle,source.indexOf('x+1')+1),dead=breakpointAtTextOffset(bundle,source.indexOf('core.div'));
 assert.equal(loop.profile,'control');const serialized=JSON.stringify(bundle.ir),pauses=[];
 const gate=new GraphStepper(p=>pauses.push(p),{start:'continue',breakpoints:[loop,dead]});let settled=false;
 const run=runTextDraft(draft,editor,{}, {onControlEnter:e=>gate.enter(e)}).finally(()=>settled=true);
 for(let i=0;i<3;i++){await tick();assert.equal(settled,false);assert.deepEqual(breakpointForEvent(pauses[i]),loop);assert.ok(pauses[i].location);gate.resume(pauses[i].token,'continue');}
 assert.equal(await run,3);assert.equal(pauses.length,3);assert.equal(JSON.stringify(bundle.ir),serialized);
});
test('concurrent queued entries retain matching stops and release unrelated work on Continue',async()=>{
 const pauses=[],gate=new GraphStepper(p=>pauses.push(p),{breakpoints:[point('b')]});let a=false,b=false,c=false;
 const first=gate.enter(event('a')).then(()=>a=true),second=gate.enter(event('b')).then(()=>b=true),third=gate.enter(event('c')).then(()=>c=true);
 assert.equal(pauses.length,1);gate.resume(pauses[0].token,'continue');await tick();assert.equal(a,true);assert.equal(b,false);assert.equal(c,false);assert.equal(pauses.length,2);
 gate.resume(pauses[1].token,'continue');await Promise.all([first,second,third]);assert.equal(c,true);assert.equal(b,true);
});
test('editing breakpoint policy requires the current token, copies values and never releases a pause',async()=>{
 const pauses=[],gate=new GraphStepper(p=>pauses.push(p));let finished=false;
 const run=(async()=>{await gate.enter(event('a'));await gate.enter(event('b'));finished=true;})();
 assert.equal(gate.update(99,[point('b')]),false);const points=[point('b')];assert.equal(gate.update(pauses[0].token,points),true);points[0].node='c';assert.equal(finished,false);gate.resume(pauses[0].token,'continue');await tick();assert.equal(pauses[1].callPath.at(-1).node,'b');
 assert.throws(()=>gate.update(pauses[1].token,[{...point('b'),value:'secret'}]),{code:'INVALID_DEBUG_BREAKPOINT'});assert.equal(gate.update(pauses[1].token,[]),true);gate.resume(pauses[1].token,'continue');await run;
});
test('bounded debug metadata rejects malformed policies and source positions without semantic changes',()=>{
 for(const value of [null,{},Array(65).fill(point('a')),[{profile:'control',function:'x',node:'bad'}],[{...point('a'),value:1}],[{profile:'graph',graph:'',node:'x'}]])assert.throws(()=>validateBreakpoints(value),{code:'INVALID_DEBUG_BREAKPOINT'});
 assert.equal(validateBreakpoints([point('a'),point('a')]).length,1);
 for(const options of [null,{start:'run'},{extra:true},{breakpoints:null}])assert.throws(()=>new GraphStepper(()=>{},options));
 const project=newProject('pBreak'),before=graphBreakpointIdentity(project);project.name='Renamed';project.canvas.view.scale=1.2;project.inputs.x=9;assert.equal(graphBreakpointIdentity(project),before);project.graph.nodes.push(graph.nodes[0]);assert.notEqual(graphBreakpointIdentity(project),before);
 const editor=new ProjectEditor(newProject('pText')),draft={source:'// no operation\nfn n()->Number {return 1;}',entry:'n',lowering:'auto'},bundle=compileTextDraft(draft,editor);
 assert.throws(()=>breakpointAtTextOffset(bundle,0),{code:'NO_DEBUG_LOCATION'});assert.throws(()=>breakpointAtTextOffset(bundle,-1),{code:'INVALID_DEBUG_BREAKPOINT'});
});
test('call-IR cursor breakpoint uses graph provenance and skips unrelated operations',async()=>{
 const source='fn calc(x:Number)->Number {let added=core.add(x,1);return core.mul(added,2);}',draft={source,entry:'calc',lowering:'call'},editor=new ProjectEditor(newProject('pCall')),bundle=compileTextDraft(draft,editor);
 const selected=breakpointAtTextOffset(bundle,source.indexOf('core.mul'));assert.equal(selected.profile,'graph');const pauses=[];
 const gate=new GraphStepper(p=>pauses.push(p),{start:'continue',breakpoints:[selected]});const run=runTextDraft(draft,editor,{x:2},{onNodeEnter:e=>gate.enter(e)});
 await tick();assert.equal(pauses.length,1);assert.deepEqual(breakpointForEvent(pauses[0]),selected);assert.match(source.slice(pauses[0].location.start.offset,pauses[0].location.end.offset),/core.mul/);gate.resume(pauses[0].token,'continue');assert.equal(await run,6);
});
test('paused breakpoint respects cancellation and preflight capability rejection',async()=>{
 const controller=new AbortController(),pauses=[],gate=new GraphStepper(p=>pauses.push(p),{start:'continue',breakpoints:[point('b')]}),registry=createCoreRegistry();
 const run=executeGraph(graph,{},registry,{signal:controller.signal,onNodeEnter:e=>gate.enter(e)});await tick();assert.equal(pauses.length,1);controller.abort();await assert.rejects(run,{code:'CANCELLED'});
 let executed=0;registry.registerAtomic({id:'user.Restricted',inputs:{},output:'Number',effects:['network'],capabilities:['network'],execute:()=>{executed++;return 1;}});
 const restricted={...graph,nodes:[{id:'b',uses:'user.Restricted',args:{}}]},denied=new GraphStepper(p=>pauses.push(p),{start:'continue',breakpoints:[point('b')]});
 await assert.rejects(executeGraph(restricted,{},registry,{onNodeEnter:e=>denied.enter(e)}),e=>['EFFECT_NOT_ALLOWED','PERMISSION_DENIED'].includes(e.code));assert.equal(executed,0);assert.equal(pauses.length,1);
});
test('breakpoint execution agrees with independent compiled control output',async()=>{
 const {compileIRToJS}=await import('../src/ir/index.mjs');
 const source='fn count()->Number {let mut x=0;while x<3 {x=x+1;}return x;}',draft={source,entry:'count',lowering:'auto'},editor=new ProjectEditor(newProject('pParity')),bundle=compileTextDraft(draft,editor),selected=breakpointAtTextOffset(bundle,source.indexOf('x+1')+1),stops=[];
 const gate=new GraphStepper(p=>{stops.push(p);queueMicrotask(()=>gate.resume(p.token,'continue'));},{start:'continue',breakpoints:[selected]});const interpreted=await runTextDraft(draft,editor,{}, {onControlEnter:e=>gate.enter(e)});
 const compiled=await import('data:text/javascript,'+encodeURIComponent(compileIRToJS(bundle.ir,bundle.registry)));assert.equal(interpreted,await compiled.execute({}));assert.equal(interpreted,3);assert.equal(stops.length,3);
});
