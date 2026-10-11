import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {executeGraph} from '../src/reference/runtime.mjs';
import {lowerGraphToIR,executeIR,compileIRToJS} from '../src/ir/index.mjs';
import {graphInspectionDeclarations,GRAPH_INSPECTOR} from '../src/runtime/graph-inspection.mjs';
const graph={schemaVersion:'0.1',id:'test.Graph',version:'1.0.0',inputs:{x:{type:'Number'},secret:{type:'String'}},output:{type:'Number'},nodes:[{id:'sum',uses:'core.add',args:{a:{input:'x'},b:{literal:2}}},{id:'twice',uses:'core.mul',args:{a:{node:'sum'},b:{node:'sum'}}}],returns:{node:'twice'}};
const grant=(ids,extra={})=>({allow:[{function:graph.id,declarations:ids}],...extra});

test('graph inspection observes real memoized dependencies without new evaluation; default and standalone semantics stay unchanged',async()=>{
 const registry=createCoreRegistry(),plain=[],events=[],before=JSON.stringify(graph);assert.equal(await executeGraph(graph,{x:3,secret:'PRIVATE_SENTINEL'},registry,{onNodeEnter:e=>plain.push(e)}),25);assert.ok(plain.every(e=>!Object.hasOwn(e,'inspection')));
 const ir=lowerGraphToIR(graph,registry);assert.equal(await executeIR(ir,{x:3,secret:'PRIVATE_SENTINEL'},registry,{graphInspection:grant(['/graph/inputs/x','/graph/nodes/sum','/graph/nodes/twice']),onNodeEnter:e=>events.push(e)}),25);assert.equal(events.length,2);
 assert.deepEqual(events[0].inspection.variables.map(v=>v.status),['value','not-evaluated','not-evaluated']);assert.equal(events[1].inspection.variables[1].value,5);assert.equal(events[1].inspection.variables[2].status,'not-evaluated');assert.ok(!JSON.stringify(events).includes('PRIVATE_SENTINEL'));assert.equal(JSON.stringify(graph),before);
 const compiled=await import('data:text/javascript,'+encodeURIComponent(compileIRToJS(ir,registry)));assert.equal(await compiled.execute({x:3,secret:'PRIVATE_SENTINEL'}),25);
});
test('snapshot mutation cannot change input/memo values; unrequested and uncomputed nodes do not execute',async()=>{
 let calls=0;const registry=createCoreRegistry().registerAtomic({id:'test.spy',version:'1.0.0',inputs:{},output:'Number',effects:[],capabilities:[],execute:()=>{calls++;return 100;}}),g={...graph,inputs:{a:{type:'NumberArray'}},nodes:[{id:'copy',uses:'std.array.reverse',args:{values:{input:'a'}}},{id:'count',uses:'std.array.length',args:{values:{node:'copy'}}},{id:'unused',uses:'test.spy',args:{}}],returns:{node:'count'}};
 const input={a:[1,2]},events=[];assert.equal(await executeGraph(g,input,registry,{graphInspection:grant(['/graph/inputs/a','/graph/nodes/copy','/graph/nodes/unused']),onNodeEnter:e=>{events.push(structuredClone(e));for(const variable of e.inspection.variables)if(Array.isArray(variable.value))variable.value.length=0;}}),2);assert.deepEqual(input.a,[1,2]);assert.equal(calls,0);assert.ok(events.every(e=>e.inspection.variables[2].status==='not-evaluated'));
});
test('nested repeated composite activations have independent inputs, memo values and frame identity',async()=>{
 const child={schemaVersion:'0.1',id:'test.Child',version:'1.0.0',inputs:{n:{type:'Number'}},output:{type:'Number'},nodes:[{id:'add',uses:'core.add',args:{a:{input:'n'},b:{literal:1}}}],returns:{node:'add'}},registry=createCoreRegistry().registerComposite({id:child.id,version:child.version,graph:child}),parent={...graph,inputs:{},nodes:[{id:'a',uses:child.id,args:{n:{literal:2}}},{id:'b',uses:child.id,args:{n:{literal:5}}},{id:'sum',uses:'core.add',args:{a:{node:'a'},b:{node:'b'}}}],returns:{node:'sum'}},events=[];
 assert.equal(await executeGraph(parent,{},registry,{graphInspection:{allow:[{function:child.id,declarations:['/graph/inputs/n','/graph/nodes/add']}]},onNodeEnter:e=>events.push(e)}),9);const nested=events.filter(e=>e.callPath.at(-1).graph===child.id);assert.deepEqual(nested.map(e=>e.inspection.variables[0].value),[2,5]);assert.ok(nested.every(e=>e.inspection.variables[1].status==='not-evaluated'));assert.notEqual(nested[0].frames.at(-1),nested[1].frames.at(-1));
});
test('marked graph closure and effectful program barriers prevent value capture while preserving ordinary output',async()=>{
 const registry=createCoreRegistry(),closed=[];assert.equal(await executeGraph(graph,{x:3,secret:'PRIVATE_SENTINEL'},registry,{graphInspection:grant(['/graph/inputs/secret'],{protectedFunctions:[graph.id]}),onNodeEnter:e=>closed.push(e)}),25);assert.ok(closed.every(e=>e.inspection.variables[0].status==='protected-program'));assert.ok(!JSON.stringify(closed).includes('PRIVATE_SENTINEL'));
 registry.registerAtomic({id:'test.host',version:'1.0.0',inputs:{s:'String'},output:'Number',effects:['host.read'],capabilities:['host.read'],execute:()=>1});const g={...graph,inputs:{s:{type:'String'}},nodes:[{id:'n',uses:'test.host',args:{s:{input:'s'}}}],sequence:['n'],returns:{node:'n'}},events=[];
 assert.equal(await executeGraph(g,{s:'PRIVATE_SENTINEL'},registry,{capabilities:['host.read'],allowedEffects:['host.read'],graphInspection:grant(['/graph/inputs/s']),onNodeEnter:e=>events.push(e)}),1);assert.ok(events.every(e=>e.inspection.variables[0].status==='protected-effects'));assert.ok(!JSON.stringify(events).includes('PRIVATE_SENTINEL'));
});
test('unknown or wrong-domain grants and missing observers are rejected before operation callbacks',async()=>{
 const registry=createCoreRegistry();let callbacks=0;for(const p of [grant(['/graph/nodes/missing']),grant(['/inputs/0']),{allow:[{function:graph.id,names:['x']}]},{allow:[{function:'unknown',declarations:['/graph/inputs/x']}]},grant(['/graph/inputs/x'],{protectedFunctions:['unknown']})])await assert.rejects(executeGraph(graph,{x:1,secret:''},registry,{graphInspection:p,onNodeEnter:()=>callbacks++}),{code:'INVALID_INSPECTION_POLICY'});assert.equal(callbacks,0);await assert.rejects(executeGraph(graph,{x:1,secret:''},registry,{graphInspection:grant(['/graph/inputs/x'])}),{code:'INVALID_INSPECTION_POLICY'});
});
test('graph budget limits omit whole values and inherited options do not activate capture',async()=>{
 const registry=createCoreRegistry(),g={...graph,inputs:{s:{type:'String'},a:{type:'NumberArray'}},nodes:[{id:'n',uses:'core.add',args:{a:{literal:1},b:{literal:2}}}],returns:{node:'n'}},events=[];await executeGraph(g,{s:'ééé',a:[1,2]},registry,{graphInspection:grant(['/graph/inputs/s','/graph/inputs/a'],{maxStringBytes:4,maxArrayItems:1}),onNodeEnter:e=>events.push(e)});assert.ok(events[0].inspection.variables.every(v=>v.status==='limit'&&!Object.hasOwn(v,'value')));
 const previous=Object.getOwnPropertyDescriptor(Object.prototype,'graphInspection');try{Object.defineProperty(Object.prototype,'graphInspection',{value:grant(['/graph/inputs/s']),configurable:true});const plain=[];await executeGraph(g,{s:'PRIVATE_SENTINEL',a:[]},registry,{onNodeEnter:e=>plain.push(e)});assert.ok(plain.every(e=>!Object.hasOwn(e,'inspection')));}finally{if(previous)Object.defineProperty(Object.prototype,'graphInspection',previous);else delete Object.prototype.graphInspection;}
 assert.equal(graphInspectionDeclarations(g,registry).length,3);
});

test('inherited internal context never enables graph value payloads',async()=>{
 const previous=Object.getOwnPropertyDescriptor(Object.prototype,GRAPH_INSPECTOR);let invoked=0;
 try{Object.defineProperty(Object.prototype,GRAPH_INSPECTOR,{value:()=>{invoked++;return {secret:'PRIVATE_SENTINEL'};},configurable:true});const events=[];await executeGraph(graph,{x:1,secret:'PRIVATE_SENTINEL'},createCoreRegistry(),{onNodeEnter:e=>events.push(e)});assert.equal(invoked,0);assert.ok(events.every(e=>!Object.hasOwn(e,'inspection')));}finally{if(previous)Object.defineProperty(Object.prototype,GRAPH_INSPECTOR,previous);else delete Object.prototype[GRAPH_INSPECTOR];}
});

test('observing an accessor input adds no getter reads or changes to ordinary execution',async()=>{
 const g={...graph,inputs:{x:{type:'Number'}},nodes:[{id:'a',uses:'core.add',args:{a:{input:'x'},b:{literal:0}}},{id:'b',uses:'core.add',args:{a:{input:'x'},b:{literal:0}}},{id:'sum',uses:'core.add',args:{a:{node:'a'},b:{node:'b'}}}],returns:{node:'sum'}},registry=createCoreRegistry();
 let plainReads=0,observedReads=0;const plain={},observed={};Object.defineProperty(plain,'x',{get(){return ++plainReads;},enumerable:true});Object.defineProperty(observed,'x',{get(){return ++observedReads;},enumerable:true});const expected=await executeGraph(g,plain,registry),events=[];assert.equal(await executeGraph(g,observed,registry,{graphInspection:grant(['/graph/inputs/x']),onNodeEnter:e=>events.push(e)}),expected);assert.equal(observedReads,plainReads);assert.ok(events.every(e=>e.inspection.variables[0].status==='unavailable'));
});

test('Studio refuses an explicit graph inspection request until its checked transport exists',async()=>{
 const {startStudioExecution}=await import('../src/studio/execution-client.mjs');
 await assert.rejects(startStudioExecution({action:'graph',debug:true,graphInspection:grant(['/graph/inputs/x'])}).promise,{code:'UNSUPPORTED_INSPECTION_TRANSPORT'});
});
