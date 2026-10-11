import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectEditor,newProject,parseProject,serializeProject} from '../src/studio/project.mjs';
import {ProjectStorage} from '../src/studio/storage.mjs';
import {lowerGraphToIR,serializeIR} from '../src/ir/index.mjs';

function sum(){const editor=new ProjectEditor();editor.addInput('x','Number',2);editor.addInput('y','Number',3);const id=editor.addNode('core.add');editor.connect({input:'x'},id,'a');editor.connect({input:'y'},id,'b');editor.connect({node:id},'output','return');return {editor,id};}
test('visual edits execute through shared serialized IR and survive project transport',async()=>{
 const {editor,id}=sum();assert.equal(await editor.run(),5);const ref={node:id};editor.connect(ref,'output','return');ref.node='missing';const values=[1,2];editor.addInput('values','NumberArray',values);values.push(99);assert.deepEqual(editor.project.inputs.values,[1,2]);const restored=new ProjectEditor(parseProject(editor.serialize()));assert.equal(await restored.run(),5);assert.equal(restored.serialize(),editor.serialize());
});
test('canvas movement and zoom do not change semantic IR, history restores graph and inputs',async()=>{
 const {editor,id}=sum(),before=serializeIR(lowerGraphToIR(editor.project.graph,editor.registry),editor.registry);editor.move(id,400,300);editor.viewport({x:25,y:-5,scale:1.5});assert.equal(serializeIR(lowerGraphToIR(editor.project.graph,editor.registry),editor.registry),before);editor.setInput('x',7);assert.equal(await editor.run(),10);editor.undo();assert.equal(await editor.run(),5);editor.redo();assert.equal(await editor.run(),10);
});
test('incompatible connections, cycles and invalid literals roll back without consuming undo',()=>{
 const {editor,id}=sum();editor.addInput('text','String','wrong');const before=editor.serialize(),length=editor.history.length;assert.throws(()=>editor.connect({input:'text'},id,'a'),{code:'TYPE_MISMATCH'});assert.throws(()=>editor.connect({node:id},id,'a'),{code:'GRAPH_CYCLE'});assert.throws(()=>editor.literal(id,'b','wrong'),{code:'TYPE_MISMATCH'});assert.equal(editor.serialize(),before);assert.equal(editor.history.length,length);
});
test('disconnect and deletion remove dangling references while keeping a valid runnable graph',async()=>{
 const {editor,id}=sum();editor.disconnect(id,'a');assert.equal(await editor.run(),3);editor.remove('input:y');assert.equal(await editor.run(),0);editor.remove(id);assert.equal(await editor.run(),0);assert.equal(editor.project.graph.nodes.length,0);assert.throws(()=>editor.remove('output'),{code:'INVALID_NODE'});
});
test('project transport preserves signed-zero input and literal values without conflating strings',async()=>{
 const editor=new ProjectEditor();editor.addInput('x','Number',-0);editor.connect({input:'x'},'output','return');const restored=new ProjectEditor(parseProject(editor.serialize()));assert.ok(Object.is(await restored.run(),-0));editor.addInput('text','String','-0');assert.equal(parseProject(editor.serialize()).inputs.text,'-0');
});
test('storage saves and selects projects atomically, quota/corruption leave existing data intact',async()=>{
 const backing=new Map(),storage={getItem:key=>backing.get(key)??null,setItem:(key,value)=>backing.set(key,value)},store=new ProjectStorage(storage),{editor}=sum();store.save(editor.project);const other=newProject('other','Другой');store.save(other);assert.equal(store.list().length,2);assert.equal(store.load().id,'other');assert.equal(await new ProjectEditor(store.load('main')).run(),5);
 const before=[...backing];storage.setItem=()=>{throw new Error('quota');};assert.throws(()=>store.save(newProject('third')),/quota/);assert.deepEqual([...backing],before);backing.set('ems.studio.projects.v1','corrupted');assert.throws(()=>store.load(),{code:'INVALID_STORAGE'});assert.equal(backing.get('ems.studio.projects.v1'),'corrupted');
});
test('prototype-like input names roundtrip as own typed data and malformed metadata rejects',async()=>{
 const editor=new ProjectEditor();editor.addInput('__proto__','Number',4);editor.connect({input:'__proto__'},'output','return');assert.equal(await new ProjectEditor(parseProject(editor.serialize())).run(),4);const data=JSON.parse(editor.serialize());data.canvas.positions.unknown={x:0,y:0};assert.throws(()=>parseProject(JSON.stringify(data)),{code:'INVALID_PROJECT'});delete data.canvas.positions.unknown;data.extra=true;assert.throws(()=>parseProject(JSON.stringify(data)),{code:'INVALID_PROJECT'});const project=newProject();project.graph.nodes=[{id:'output',uses:'core.sum',args:{values:{literal:[]}}}];assert.throws(()=>serializeProject(project),{code:'INVALID_NAME'});
});
