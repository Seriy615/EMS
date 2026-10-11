import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {executeGraph} from '../src/reference/runtime.mjs';
import {GraphStepper} from '../src/studio/debugger.mjs';
const graph={schemaVersion:'0.1',id:'test.Debug',version:'1.0.0',inputs:{},output:{type:'Number'},nodes:[{id:'first',uses:'core.add',args:{a:{literal:7},b:{literal:8}}},{id:'last',uses:'core.mul',args:{a:{node:'first'},b:{node:'first'}}}],returns:{node:'last'}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('actual evaluator pauses before execution, steps dependencies once and continues without a second interpreter',async()=>{
 const registry=createCoreRegistry(),pauses=[],calls=[];const original=registry.resolve('core.add').execute;
 registry.registerAtomic({id:'test.Add',inputs:{a:'Number',b:'Number'},output:'Number',execute:(params,context)=>{calls.push('add');return original(params,context);}});
 const traced={...graph,nodes:graph.nodes.map(node=>node.id==='first'?{...node,uses:'test.Add'}:node)};
 const gate=new GraphStepper(pause=>pauses.push(pause));let settled=false;
 const execution=executeGraph(traced,{},registry,{onNodeEnter:event=>gate.enter(event)}).finally(()=>{settled=true;});
 await tick();assert.equal(settled,false);assert.deepEqual(calls,[]);assert.equal(pauses[0].callPath[0].node,'first');
 assert.deepEqual(pauses[0].inputs,{a:'Number',b:'Number'});assert.equal(pauses[0].output,'Number');
 assert.equal(gate.resume(99,'step'),false);assert.equal(gate.resume(1,'invalid'),false);assert.equal(settled,false);
 assert.equal(gate.resume(1,'step'),true);assert.equal(gate.resume(1,'step'),false);await tick();
 assert.deepEqual(calls,['add']);assert.equal(pauses[1].callPath[0].node,'last');assert.equal(settled,false);
 assert.equal(gate.resume(1,'continue'),false);assert.equal(gate.resume(2,'continue'),true);assert.equal(await execution,225);
 assert.equal(pauses.length,2);assert.deepEqual(calls,['add']);assert.equal(gate.resume(2,'continue'),false);
});
test('nested operation locations and type metadata are detached and contain no runtime values',async()=>{
 const registry=createCoreRegistry();registry.registerComposite({id:'user.Debug',version:'1.0.0',graph:{...graph,id:'user.Debug'}});
 const root={...graph,id:'test.Root',nodes:[{id:'wrapper',uses:'user.Debug',args:{}}],returns:{node:'wrapper'}},events=[];
 assert.equal(await executeGraph(root,{},registry,{onNodeEnter:event=>{events.push(structuredClone(event));event.callPath.length=0;event.inputs.a='String';}}),225);
 assert.deepEqual(events.map(e=>e.callPath.map(c=>c.node)),[['wrapper'],['wrapper','first'],['wrapper','last']]);
 assert.deepEqual(Object.keys(events[1]).sort(),['phase','callPath','frames','inputs','output','effects','capabilities'].sort());
 assert.equal(registry.resolve('core.add').inputs.a,'Number');assert.equal(JSON.stringify(events).includes('225'),false);
});
test('observer rejection does not change semantics and cancellation terminates an unresolved pause',async()=>{
 const registry=createCoreRegistry();assert.equal(await executeGraph(graph,{},registry,{onNodeEnter:()=>Promise.reject(new Error('observer'))}),225);
 await assert.rejects(executeGraph(graph,{},registry,{onNodeEnter:42}),{code:'INVALID_OPTION'});
 const controller=new AbortController();let enter;const ready=new Promise(resolve=>{enter=resolve;});
 const run=executeGraph(graph,{},registry,{signal:controller.signal,onNodeEnter:()=>{enter();return new Promise(()=>{});}});
 await ready;controller.abort();await assert.rejects(run,{code:'CANCELLED'});
 const broken={...graph,nodes:[{id:'division',uses:'core.div',args:{a:{literal:7},b:{literal:0}}}],returns:{node:'division'}};
 await assert.rejects(executeGraph(broken,{},registry,{onNodeEnter:()=>{throw new Error('observer');}}),e=>e.code==='DIV_BY_ZERO'&&Object.keys(e.details).length===0);
});
test('debug order matches real demand versus explicit sequence and preserves independent compiled result',async()=>{
 const {lowerGraphToIR,compileIRToJS}=await import('../src/ir/index.mjs');
 const registry=createCoreRegistry(),calls=[],withDead={...graph,nodes:[...graph.nodes,{id:'unused',uses:'core.div',args:{a:{literal:1},b:{literal:0}}}]};
 const module=await import('data:text/javascript,'+encodeURIComponent(compileIRToJS(lowerGraphToIR(withDead,registry),registry)));
 assert.equal(await executeGraph(withDead,{},registry,{onNodeEnter:e=>calls.push(e.callPath.at(-1).node)}),module.execute({}));
 assert.deepEqual(calls,['first','last']);calls.length=0;
 await assert.rejects(executeGraph({...withDead,sequence:['first','last','unused']},{},registry,{onNodeEnter:e=>calls.push(e.callPath.at(-1).node)}),{code:'DIV_BY_ZERO'});
 assert.deepEqual(calls,['first','last','unused']);
});
test('preflight type and permission failures do not invent operation pauses or execute implementations',async()=>{
 const registry=createCoreRegistry();let entered=0,executed=0;
 registry.registerAtomic({id:'test.Restricted',inputs:{},output:'Number',effects:['network'],capabilities:['network'],execute:()=>{executed++;return 1;}});
 const restricted={...graph,nodes:[{id:'restricted',uses:'test.Restricted',args:{}}],returns:{node:'restricted'}};
 await assert.rejects(executeGraph(restricted,{},registry,{onNodeEnter:()=>{entered++;}}),e=>['PERMISSION_DENIED','EFFECT_NOT_ALLOWED'].includes(e.code));
 await assert.rejects(executeGraph({...graph,inputs:{value:{type:'Number'}}},{value:'bad'},registry,{onNodeEnter:()=>{entered++;}}),{code:'TYPE_MISMATCH'});
 assert.equal(entered,0);assert.equal(executed,0);
});
