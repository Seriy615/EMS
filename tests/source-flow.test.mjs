import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {createStateRegistry} from '../src/runtime/reactor.mjs';
import {compileUIHandler} from '../src/ui/source.mjs';
import {sourceContractFlow} from '../src/studio/source-flow.mjs';
import {UIProjectEditor} from '../src/studio/ui-project.mjs';
import {UIFlowSession} from '../src/studio/ui-flow-session.mjs';
import {FlowProjectEditor} from '../src/studio/flow-project.mjs';
import {UIRuntime} from '../src/ui/model.mjs';
import {compileUIJS} from '../src/compiler/ui.mjs';
const policy={capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']};
async function setup(source){const base=createCoreRegistry(),app=JSON.parse(await readFile(new URL('../examples/ui-counter.json',import.meta.url),'utf8')),editor=new UIProjectEditor(app,base);editor.applyHandler('change',source,'demo.Counter');return {base,editor};}
const counter=await readFile(new URL('../examples/counter.ems',import.meta.url),'utf8');
test('an existing source UI handler opens as ordinary contracts without changing the saved application until Apply',async()=>{
 const {base,editor}=await setup(counter),before=editor.source,records=new Map([['ems.studio.ui.v1',before]]),storage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)},session=new UIFlowSession(storage,'?handler=change',base),graph=new FlowProjectEditor(session.project,session.registry,session.options);
 assert.deepEqual(graph.project.graph.nodes.map(node=>node.uses).sort(),['core.add','state.count.read','state.count.write','std.program.Result'].sort());assert.equal(storage.getItem('ems.studio.ui.v1'),before);
 const add=graph.project.graph.nodes.find(node=>node.uses==='core.add');graph.literal(add.id,'b',2);session.saveDraft(graph.serialize());assert.equal(new UIFlowSession(storage,'?handler=change',base).project.graph.nodes.find(node=>node.id===add.id).args.b.literal,2);
 const source=session.apply(graph.serialize()),{parseUIWorkspace}=await import('../src/ui/project.mjs'),workspace=parseUIWorkspace(source,base),runtime=new UIRuntime(workspace.application,base,{policy});try{assert.equal(await runtime.dispatch('increment','press'),2);assert.equal(await runtime.dispatch('increment','press'),4);}finally{await runtime.close();}assert.ok(workspace.sources.change.flow);
 graph.remove(add.id);session.saveDraft(graph.serialize());assert.throws(()=>session.apply(graph.serialize()),{code:'UNCONNECTED_FLOW_INPUT'});assert.equal(storage.getItem('ems.studio.ui.v1'),source);
});
test('source while/if/break/continue use real marker and fork ports with runtime and standalone UI parity',async()=>{
 const source='@demo::Counter(delta:Number)->Number { while state.count.read() < 5 { if state.count.read() >= 3 { break; } state.count.write(state.count.read() + delta); continue; } return state.count.read(); }', {base,editor}=await setup(source),app=editor.application,registry=createStateRegistry(base,app.reactor.state),flow=sourceContractFlow(compileUIHandler(source,'demo.Counter',app,base).ir,registry,{allowState:true}),project=JSON.parse(flow);
 assert.equal(project.graph.nodes.filter(n=>n.uses==='std.control.If').length,2);assert.equal(project.graph.nodes.filter(n=>n.uses==='std.control.IterationBegin').length,1);assert.equal(project.graph.nodes.filter(n=>n.uses==='std.control.IterationEnd').length,1);assert.ok(project.graph.nodes.every(n=>!n.uses.includes('Block')));
 const original=new UIRuntime(app,base,{policy});editor.applyFlow('change',flow);const migrated=new UIRuntime(editor.application,base,{policy}),{createRuntime}=await import('data:text/javascript;base64,'+Buffer.from(compileUIJS(editor.application,base)).toString('base64')),compiled=createRuntime({policy});try{for(const runtime of [original,migrated,compiled]){assert.equal(await runtime.dispatch('increment','press'),3);assert.equal(runtime.snapshot().count,3);}}finally{await Promise.all([original.close(),migrated.close(),compiled.close()]);}
});
test('unsupported source constructs refuse projection without replacing a working handler or inventing graph operations',async()=>{
 for(const source of ['@demo::Counter(delta:Number)->Number { return [delta][0]; }']){const {base,editor}=await setup(source),before=editor.source,registry=createStateRegistry(base,editor.application.reactor.state);assert.throws(()=>sourceContractFlow(compileUIHandler(source,'demo.Counter',editor.application,base).ir,registry,{allowState:true}),{code:'SOURCE_FLOW_UNSUPPORTED'});assert.equal(editor.source,before);}
});
test('mutable source projection and standalone UI roll back prior state writes after an arithmetic failure',async()=>{const source='@demo::Counter(delta:Number)->Number{let mut x=delta;x=x+1;x=x+2;state.count.write(x);return 1/(delta-delta);}',{base,editor}=await setup(source),app=editor.application,registry=createStateRegistry(base,app.reactor.state),flow=sourceContractFlow(compileUIHandler(source,'demo.Counter',app,base).ir,registry,{allowState:true}),original=new UIRuntime(app,base,{policy});editor.applyFlow('change',flow);const projected=new UIRuntime(editor.application,base,{policy}),{createRuntime}=await import('data:text/javascript;base64,'+Buffer.from(compileUIJS(editor.application,base)).toString('base64')),standalone=createRuntime({policy});try{for(const runtime of [original,projected,standalone]){await assert.rejects(runtime.dispatch('increment','press'),{code:'DIV_BY_ZERO'});assert.equal(runtime.snapshot().count,0);}}finally{await Promise.all([original.close(),projected.close(),standalone.close()]);}});
