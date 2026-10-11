import test from 'node:test';
import assert from 'node:assert/strict';
import {StudioDebuggerStorage,studioDebuggerContext,resolveStudioDebugger} from '../src/studio/debugger-storage.mjs';
import {captureSourceBreakpoint} from '../src/studio/source-anchors.mjs';
import {breakpointAtTextOffset} from '../src/studio/breakpoints.mjs';
import {compileTextDraft,runTextDraft} from '../src/studio/text.mjs';
import {ProjectEditor,newProject} from '../src/studio/project.mjs';
import {GraphStepper,breakpointForEvent} from '../src/studio/debugger.mjs';
import {ProjectManager} from '../src/studio/manager.mjs';
const memory=()=>{const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
const source='fn main()->Number {let mut x=0;return x+1;}';
const draft=(text=source,entry='main')=>({source:text,entry,lowering:'auto'});
function fixture(){const editor=new ProjectEditor(newProject('debugPersist'));editor.addNode('core.add');return editor;}
function textRecord(editor,value=draft()){
 const bundle=compileTextDraft(value,editor),anchor=captureSourceBreakpoint(bundle,breakpointAtTextOffset(bundle,value.source.indexOf('return x+1')));
 return {context:studioDebuggerContext(editor,value),point:anchor.point,anchor};
}
const graphRecord=editor=>({context:studioDebuggerContext(editor),point:{profile:'graph',graph:editor.project.graph.id,node:'n1'},anchor:null});

test('fresh storage instance restores a checked shifted source point and pauses the original evaluator',async()=>{
 const editor=fixture(),storage=memory(),store=new StudioDebuggerStorage(storage,editor.project.id),record=textRecord(editor);store.save([record]);
 record.anchor.point.node='/body/99';const restored=new StudioDebuggerStorage(storage,editor.project.id).load(),next=draft('// shifted\n'+source.replace('return','core.add(1,2);return')),bundle=compileTextDraft(next,editor),resolved=resolveStudioDebugger(restored,studioDebuggerContext(editor,next),{bundle,project:editor.project});
 assert.equal(restored[0].point.node,'/body/1');assert.equal(resolved[0].point.node,'/body/2');const pauses=[],gate=new GraphStepper(p=>{pauses.push(p);queueMicrotask(()=>gate.resume(p.token,'continue'));},{start:'continue',breakpoints:resolved.map(item=>item.point)});
 assert.equal(await runTextDraft(next,editor,{}, {onControlEnter:e=>gate.enter(e)}),1);assert.equal(pauses.length,1);assert.deepEqual(breakpointForEvent(pauses[0]),resolved[0].point);
 assert.equal(next.source.slice(pauses[0].location.start.offset,pauses[0].location.end.offset),'return x+1;');
});

test('graph, text and entry/lowering contexts remain separate across mode changes; invalid drafts are inactive',()=>{
 const editor=fixture(),store=new StudioDebuggerStorage(memory(),editor.project.id),text=textRecord(editor),graph=graphRecord(editor),other={...text,context:{...text.context,entry:'other'}};store.save([graph,text,other]);
 const saved=store.load(),bundle=compileTextDraft(draft(),editor);
 assert.equal(resolveStudioDebugger(saved,studioDebuggerContext(editor),{project:editor.project}).length,1);
 const selected=resolveStudioDebugger(saved,studioDebuggerContext(editor,draft()),{bundle,project:editor.project});assert.equal(selected.length,1);assert.equal(selected[0].point.profile,'control');
 assert.equal(resolveStudioDebugger(saved,studioDebuggerContext(editor,draft()),{project:editor.project})[0].reason,'invalid-draft');
 assert.equal(resolveStudioDebugger(saved,studioDebuggerContext(editor,{...draft(),lowering:'call'}),{bundle,project:editor.project}).length,0);
 store.save([]);assert.deepEqual(store.load(),[]);
});

test('semantic library and binding version drift deactivate records; layout/name/inputs preserve context',()=>{
 const editor=fixture(),record=textRecord(editor),context=record.context;
 editor.project.name='Renamed';editor.project.canvas.positions.n1={x:999,y:5};editor.project.inputs.test=9;assert.deepEqual(studioDebuggerContext(editor,draft()),context);
 const item=editor.registry.resolve('core.add');editor.registry.items.set(item.id,{...item,version:'9.0.0'});
 const changed=studioDebuggerContext(editor,draft());assert.notEqual(changed.library,context.library);assert.equal(resolveStudioDebugger([record],changed,{bundle:compileTextDraft(draft(),editor),project:editor.project})[0].reason,'library-changed');
 editor.registry.items.set(item.id,item);assert.ok(resolveStudioDebugger([record],studioDebuggerContext(editor,draft()),{bundle:compileTextDraft(draft(),editor),project:editor.project})[0].point);
 const graph=graphRecord(editor);editor.project.graph.nodes[0].args.a.literal=100;assert.equal(resolveStudioDebugger([graph],studioDebuggerContext(editor),{project:editor.project})[0].reason,'library-changed');
});

test('owner/schema/corrupt/duplicate/budget failures preserve saved bytes and never invoke contract callbacks',()=>{
 const editor=fixture(),storage=memory(),store=new StudioDebuggerStorage(storage,editor.project.id),record=graphRecord(editor);let invoked=0;const item=editor.registry.resolve('core.add');editor.registry.items.set(item.id,{...item,execute:()=>{invoked++;throw Error('Must not execute');}});store.save([record]);const saved=storage.getItem(store.key);
 for(const input of ['null','1','[]','{}','{',saved.replace('ems-studio-debugger/1','bad'),saved.replace('debugPersist','another')])assert.throws(()=>store.check(input),{code:'INVALID_DEBUG_STORAGE'});
 for(const input of [[record,record],Array(65).fill(record),[{...record,extra:true}],[{...record,context:{...record.context,value:'payload'}}],[{...record,anchor:{}}]])assert.throws(()=>store.save(input));
 assert.equal(storage.getItem(store.key),saved);assert.equal(invoked,0);assert.throws(()=>store.save([{...record,context:{...record.context,library:'🧩'.repeat(300000)}}]),{code:'DEBUG_ANCHOR_LIMIT'});assert.equal(storage.getItem(store.key),saved);
 const failing={getItem:key=>storage.getItem(key),setItem:()=>{throw Object.assign(Error('Quota'),{code:'QUOTA'});}};assert.throws(()=>new StudioDebuggerStorage(failing,editor.project.id).save([]),{code:'QUOTA'});assert.equal(storage.getItem(store.key),saved);
});

test('source/point mismatch and absent graph operations cannot become active after restore',()=>{
 const editor=fixture(),store=new StudioDebuggerStorage(memory(),editor.project.id),text=textRecord(editor);assert.throws(()=>store.save([{...text,point:{...text.point,node:'/body/99'}}]),{code:'INVALID_DEBUG_STORAGE'});
 const graph=graphRecord(editor);graph.point.node='missing';store.save([graph]);assert.deepEqual(resolveStudioDebugger(store.load(),studioDebuggerContext(editor),{project:editor.project})[0].point,null);
});

test('program export, catalog copy and import carry no debugger sidecar or inherited points',()=>{
 const editor=fixture(),storage=memory(),store=new StudioDebuggerStorage(storage,editor.project.id),manager=new ProjectManager(storage);store.save([textRecord(editor)]);manager.save({id:editor.project.id,name:editor.project.name,kind:'graph',source:editor.serialize(),draft:null});
 const exported=manager.export(editor.project.id);assert.equal(exported.includes('ems-studio-debugger'),false);assert.equal(exported.includes('ems-source-breakpoint'),false);
 manager.copy(editor.project.id,'debugCopy','Copy');manager.import(exported,'debugImport');assert.deepEqual(new StudioDebuggerStorage(storage,'debugCopy').load(),[]);assert.deepEqual(new StudioDebuggerStorage(storage,'debugImport').load(),[]);assert.equal(store.load().length,1);
});
