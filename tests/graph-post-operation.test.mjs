import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {executeGraph} from '../src/reference/runtime.mjs';
import {lowerGraphToIR,compileIRToJS} from '../src/ir/index.mjs';
import {ProjectEditor} from '../src/studio/project.mjs';
import {prepareStudioInspection,graphInspectionWitness,validateInspectionPause} from '../src/studio/inspection-transport.mjs';
import {GraphStepper} from '../src/studio/debugger.mjs';
const graph={schemaVersion:'0.1',id:'test.Post',version:'1.0.0',inputs:{x:{type:'Number'}},output:{type:'Number'},nodes:[{id:'sum',uses:'core.add',args:{a:{input:'x'},b:{literal:2}}},{id:'square',uses:'core.mul',args:{a:{node:'sum'},b:{node:'sum'}}}],returns:{node:'square'}};
const policy={allow:[{function:graph.id,declarations:['/graph/nodes/sum','/graph/nodes/square']}]};
function fixture(){const editor=new ProjectEditor();editor.edit(p=>{p.graph=structuredClone(graph);p.inputs={x:3};});const request={action:'graph',debug:true,project:editor.serialize(),inspection:graphInspectionWitness(editor,policy,{afterOperations:true})};return {editor,request,prepared:prepareStudioInspection(request)};}

test('post-operation observer uses once-only memoized validated results with unchanged standalone behavior',async()=>{
 const registry=createCoreRegistry(),events=[],before=JSON.stringify(graph);
 assert.equal(await executeGraph(graph,{x:3},registry,{graphInspection:policy,onNodeEnter:e=>events.push(e),onNodeExit:e=>events.push(e)}),25);
 assert.deepEqual(events.map(e=>[e.phase,e.callPath.at(-1).node]),[['enter','sum'],['exit','sum'],['enter','square'],['exit','square']]);assert.equal(events[1].inspection.variables[0].value,5);assert.equal(events[3].inspection.variables[1].value,25);assert.equal(events[1].frames[0],events[0].frames[0]);assert.equal(JSON.stringify(graph),before);
 const compiled=await import('data:text/javascript,'+encodeURIComponent(compileIRToJS(lowerGraphToIR(graph,registry),registry)));assert.equal(await compiled.execute({x:3}),25);
 const exitsOnly=[];assert.equal(await executeGraph(graph,{x:3},registry,{graphInspection:policy,onNodeExit:e=>exitsOnly.push(e)}),25);assert.equal(exitsOnly.length,2);assert.equal(exitsOnly[1].inspection.variables[1].value,25);
 const plain=[];await executeGraph(graph,{x:3},registry,{onNodeExit:e=>plain.push(e)});assert.ok(plain.every(e=>!Object.hasOwn(e,'inspection')));
});

test('post-operation witness and DTO require explicit v2 opt-in and a completed current output',async()=>{
 const {editor,request,prepared}=fixture(),events=[];await editor.run({graphInspection:prepared.policy,onNodeEnter:()=>{},onNodeExit:e=>events.push(e)});const pause={...events[1],location:null,token:2};assert.equal(validateInspectionPause(pause,prepared).inspection.variables[1].value,25);
 const old=prepareStudioInspection({...request,inspection:graphInspectionWitness(editor,policy)});assert.throws(()=>validateInspectionPause(pause,old),{code:'INVALID_INSPECTION_SNAPSHOT'});
 const pending=structuredClone(pause);pending.inspection.variables[1]={name:'square',declaration:'/graph/nodes/square',type:null,status:'not-evaluated'};assert.throws(()=>validateInspectionPause(pending,prepared),{code:'INVALID_INSPECTION_SNAPSHOT'});
 for(const option of [false,'true',1])assert.throws(()=>prepareStudioInspection({...request,inspection:{...request.inspection,afterOperations:option}}),{code:'INVALID_INSPECTION_SNAPSHOT'});
 let reads=0;const accessor={...request.inspection};Object.defineProperty(accessor,'afterOperations',{get(){reads++;return true;},enumerable:true});assert.throws(()=>prepareStudioInspection({...request,inspection:accessor}),{code:'INVALID_INSPECTION_SNAPSHOT'});assert.equal(reads,0);
 const draft={source:'fn main()->Number {let mut n=0;while n<1 {n=n+1;} return n;}',entry:'main',lowering:'auto'};assert.throws(()=>prepareStudioInspection({action:'text',debug:true,project:editor.serialize(),draft,inspection:{schemaVersion:'ems-source-inspection/2',...draft,policy:{allow:[]},afterOperations:true}}),{code:'UNSUPPORTED_INSPECTION_PROFILE'});
});

test('failed nodes have no exit event; observer failure is isolated and cancellation still stops execution',async()=>{
 const registry=createCoreRegistry(),g={...graph,nodes:[{id:'bad',uses:'core.div',args:{a:{literal:1},b:{literal:0}}}],returns:{node:'bad'}},events=[];
 await assert.rejects(executeGraph(g,{x:3},registry,{onNodeExit:e=>events.push(e)}));assert.equal(events.length,0);
 assert.equal(await executeGraph(graph,{x:3},registry,{onNodeExit:()=>{throw Error('observer');}}),25);
 const controller=new AbortController();await assert.rejects(executeGraph(graph,{x:3},registry,{signal:controller.signal,onNodeExit:()=>{controller.abort();return new Promise(()=>{});}}),{code:'CANCELLED'});
 await assert.rejects(executeGraph(graph,{x:3},registry,{onNodeExit:true}),{code:'INVALID_OPTION'});
});

test('exit snapshots are detached and retain protection and whole-value limits',async()=>{
 const registry=createCoreRegistry(),g={...graph,inputs:{items:{type:'NumberArray'}},output:{type:'NumberArray'},nodes:[{id:'reverse',uses:'std.array.reverse',args:{values:{input:'items'}}}],returns:{node:'reverse'}},p={allow:[{function:g.id,declarations:['/graph/nodes/reverse']}]},input={items:[1,2]},events=[];
 assert.deepEqual(await executeGraph(g,input,registry,{graphInspection:p,onNodeEnter:()=>{},onNodeExit:e=>{events.push(structuredClone(e));e.inspection.variables[0].value.length=0;}}),[2,1]);assert.deepEqual(input.items,[1,2]);assert.deepEqual(events[0].inspection.variables[0].value,[2,1]);
 for(const extra of [{protectedFunctions:[g.id]},{maxArrayItems:1}]){const snapshots=[];await executeGraph(g,input,registry,{graphInspection:{...p,...extra},onNodeEnter:()=>{},onNodeExit:e=>snapshots.push(e)});assert.equal(Object.hasOwn(snapshots[0].inspection.variables[0],'value'),false);}
});

function nested(){const child={...graph,id:'test.Child',inputs:{x:{type:'Number'}},nodes:[{id:'add',uses:'core.add',args:{a:{input:'x'},b:{literal:1}}}],returns:{node:'add'}},registry=createCoreRegistry().registerComposite({id:child.id,version:child.version,graph:child}),parent={...graph,inputs:{},nodes:[{id:'a',uses:child.id,args:{x:{literal:2}}},{id:'b',uses:child.id,args:{x:{literal:5}}},{id:'sum',uses:'core.add',args:{a:{node:'a'},b:{node:'b'}}}],returns:{node:'sum'}};return {registry,parent};}
test('Over reaches the computed composite result and Out skips its same-frame exit',async()=>{
 const {registry,parent}=nested(),pauses=[],modes=['over','step','step','out','continue'];let gate;
 gate=new GraphStepper(p=>{pauses.push(p);assert.equal(gate.resume(p.token,modes.shift()),true);});assert.equal(await executeGraph(parent,{},registry,{onNodeEnter:e=>gate.enter(e),onNodeExit:e=>gate.enter(e),onFrameExit:e=>gate.leave(e)}),9);
 assert.deepEqual(pauses.map(p=>[p.phase,p.callPath.at(-1).node]),[['enter','a'],['exit','a'],['enter','b'],['enter','add'],['exit','b']]);assert.equal(modes.length,0);assert.ok(pauses[3].frames.length>pauses[4].frames.length);
});
test('Continue breakpoints trigger only before operations even when exits are observed',async()=>{
 const {registry,parent}=nested(),pauses=[];let gate;gate=new GraphStepper(p=>{pauses.push(p);gate.resume(p.token,'continue');},{start:'continue',breakpoints:[{profile:'graph',graph:'test.Child',node:'add'}]});assert.equal(await executeGraph(parent,{},registry,{onNodeEnter:e=>gate.enter(e),onNodeExit:e=>gate.enter(e),onFrameExit:e=>gate.leave(e)}),9);assert.deepEqual(pauses.map(p=>p.phase),['enter','enter']);assert.notEqual(pauses[0].frames.at(-1),pauses[1].frames.at(-1));
});

test('typed host failure and impure exits preserve failure and protected effects',async()=>{
 const registry=createCoreRegistry().registerAtomic({id:'test.invalid',version:'1.0.0',inputs:{},output:'Number',effects:[],capabilities:[],execute:()=> 'PRIVATE_SENTINEL'}),g={...graph,inputs:{},nodes:[{id:'call',uses:'test.invalid',args:{}}],returns:{node:'call'}},events=[];
 await assert.rejects(executeGraph(g,{},registry,{onNodeExit:e=>events.push(e)}),{code:'TYPE_MISMATCH'});assert.equal(events.length,0);
 registry.registerAtomic({id:'test.effect',version:'1.0.0',inputs:{secret:'String'},output:'Number',effects:['host.read'],capabilities:['host.read'],execute:()=>7});const impure={...g,inputs:{secret:{type:'String'}},nodes:[{id:'call',uses:'test.effect',args:{secret:{input:'secret'}}}],sequence:['call']},p={allow:[{function:g.id,declarations:['/graph/inputs/secret','/graph/nodes/call']}]};
 assert.equal(await executeGraph(impure,{secret:'PRIVATE_SENTINEL'},registry,{capabilities:['host.read'],allowedEffects:['host.read'],graphInspection:p,onNodeEnter:()=>{},onNodeExit:e=>events.push(e)}),7);assert.ok(events[0].inspection.variables.every(v=>v.status==='protected-effects'));assert.ok(!JSON.stringify(events).includes('PRIVATE_SENTINEL'));
});

test('checked client closes before callbacks for forged exits and accepts distinct legitimate phase tokens',async()=>{
 const {startStudioExecution}=await import('../src/studio/execution-client.mjs'),{editor,request,prepared}=fixture(),events=[];await editor.run({graphInspection:prepared.policy,onNodeEnter:e=>events.push(e),onNodeExit:e=>events.push(e)});const pauses=events.map((e,i)=>({...e,location:null,token:i+1})),Native=globalThis.Worker;let worker,seen=[];
 globalThis.Worker=class{constructor(){worker=this;}postMessage(){}terminate(){this.ended=true;}emit(data){this.onmessage({data});}};
 try{const badJob=startStudioExecution(request,{onPause:p=>seen.push(p)}),bad=structuredClone(pauses[1]);bad.inspection.variables[0].value='PRIVATE_SENTINEL';worker.emit({type:'paused',pause:bad});await assert.rejects(badJob.promise,{code:'INVALID_INSPECTION_SNAPSHOT'});assert.equal(seen.length,0);assert.equal(worker.ended,true);
 const job=startStudioExecution(request,{onPause:p=>seen.push(p)});worker.emit({type:'paused',pause:pauses[0]});assert.equal(job.resume('step'),true);worker.emit({type:'paused',pause:pauses[1]});assert.deepEqual(seen.map(p=>p.phase),['enter','exit']);assert.equal(seen[1].inspection.variables[0].value,5);job.cancel();await assert.rejects(job.promise,{code:'CANCELLED'});
 }finally{globalThis.Worker=Native;}
});
