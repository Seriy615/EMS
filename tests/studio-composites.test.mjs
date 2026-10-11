import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {ProjectEditor,newProject,parseProject} from '../src/studio/project.mjs';
import {ProjectStorage} from '../src/studio/storage.mjs';

function fixture(){const editor=new ProjectEditor();editor.addInput('x','Number',2);editor.addInput('y','Number',3);const id=editor.addNode('core.add');editor.connect({input:'x'},id,'a');editor.connect({input:'y'},id,'b');editor.connect({node:id},'output','return');editor.createComposite('user.Sum');return editor;}
function call(editor,id){const node=editor.addNode(id);editor.connect({input:'x'},node,'x');editor.connect({input:'y'},node,'y');editor.connect({node},'output','return');return node;}
test('composites preserve typed graph, expand edits affect callers and undo restores dependencies',async()=>{
 const editor=fixture();call(editor,'user.Sum');assert.equal(await editor.run(),5);editor.openContract('user.Sum');assert.equal(editor.workspace.graph.id,'user.Sum');editor.literal('n1','b',10);assert.equal(await editor.run(),12);editor.collapse();assert.equal(await editor.run(),12);editor.undo();assert.equal(await editor.run(),5);editor.redo();assert.equal(await editor.run(),12);assert.equal(editor.registry.resolve('user.Sum').kind,'composite');
});
test('nested navigation, v2 serialization and storage preserve actual registry closure and canvas',async()=>{
 const editor=fixture();call(editor,'user.Sum');editor.createComposite('user.Outer');call(editor,'user.Outer');editor.openContract('user.Outer');editor.openContract('user.Sum');editor.move('n1',500,400);assert.equal(editor.collapse(),true);assert.equal(editor.selectedContract,'user.Outer');editor.collapse();assert.equal(editor.selectedContract,null);
 const encoded=editor.serialize();assert.equal(JSON.parse(encoded).schemaVersion,'ems-studio-project/2');const restored=new ProjectEditor(parseProject(encoded));assert.equal(await restored.run(),5);assert.equal(restored.serialize(),encoded);restored.openContract('user.Sum');assert.deepEqual(restored.workspace.canvas.positions.n1,{x:500,y:400});assert.equal(restored.project.canvas.positions.n1.x,280);
 const backing=new Map(),storage=new ProjectStorage({getItem:key=>backing.get(key)??null,setItem:(key,value)=>backing.set(key,value)});storage.save(editor.project);assert.equal(await new ProjectEditor(storage.load()).run(),5);
});
test('cycles, incompatible signature edits and deleting a used definition roll back atomically',()=>{
 const editor=fixture();call(editor,'user.Sum');editor.openContract('user.Sum');const before=editor.serialize(),history=editor.history.length;
 assert.throws(()=>editor.addNode('user.Sum'),{code:'RECURSIVE_COMPOSITE'});assert.throws(()=>editor.addInput('extra','Number'),{code:'MISSING_ARGUMENT'});assert.throws(()=>editor.removeComposite('user.Sum'),{code:'MISSING_CONTRACT'});assert.throws(()=>editor.createComposite('core.add'),{code:'DUPLICATE_CONTRACT'});
 assert.equal(editor.serialize(),before);assert.equal(editor.history.length,history);assert.throws(()=>editor.openContract('core.add'),{code:'ATOMIC_CONTRACT'});
});
test('new contract inputs/output can be authored before use; collection and IR metadata reject tampering',async()=>{
 const editor=new ProjectEditor();editor.createComposite('user.Identity');editor.openContract('user.Identity');editor.addInput('text','String','hello');editor.connect({input:'text'},'output','return');editor.main();const node=editor.addNode('user.Identity');editor.literal(node,'text','world');editor.connect({node},'output','return');assert.equal(await editor.run(),'world');
 const data=JSON.parse(editor.serialize());data.contracts[0].ir.version='2.0.0';assert.throws(()=>parseProject(JSON.stringify(data)),{code:'CONTRACT_VERSION'});const missing=JSON.parse(editor.serialize());missing.contracts=[];assert.throws(()=>parseProject(JSON.stringify(missing)),{code:'MISSING_CONTRACT'});const unknown=JSON.parse(editor.serialize());unknown.contracts[0].extra=true;assert.throws(()=>parseProject(JSON.stringify(unknown)),{code:'INVALID_PROJECT'});
});
test('v1 project migration remains lossless and unused contract deletion is undoable',async()=>{
 const source=await readFile(new URL('../examples/studio-sum.ems.json',import.meta.url),'utf8'),editor=new ProjectEditor(parseProject(source));assert.equal(await editor.run(),5);assert.equal(editor.serialize(),source);editor.createComposite('user.Unused');editor.openContract('user.Unused');editor.removeComposite('user.Unused');assert.equal(editor.selectedContract,null);assert.equal(JSON.parse(editor.serialize()).schemaVersion,'ems-studio-project/1');editor.undo();assert.equal(editor.project.contracts.length,1);
});
test('nested composite standalone is actual independent code executed in another process',async()=>{
 const editor=fixture();call(editor,'user.Sum');editor.createComposite('user.Outer');call(editor,'user.Outer');const directory=await mkdtemp(join(tmpdir(),'ems-composite-studio-'));
 try{await writeFile(join(directory,'program.mjs'),editor.compile());await writeFile(join(directory,'run.mjs'),'import {execute} from "./program.mjs"; console.log(execute({x:2,y:3}));');const result=spawnSync(process.execPath,['run.mjs'],{cwd:directory,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'5');}finally{await rm(directory,{recursive:true,force:true});}
});

test('small source with exponential composite fanout is rejected before recursive lowering',()=>{
 const project=newProject();let previous='core.add';
 for(let index=0;index<15;index++){
  const graph={schemaVersion:'0.1',id:'user.level'+index,version:'1.0.0',inputs:{a:{type:'Number'},b:{type:'Number'}},output:{type:'Number'},nodes:[{id:'left',uses:previous,args:{a:{input:'a'},b:{input:'b'}}},{id:'right',uses:previous,args:{a:{input:'a'},b:{input:'b'}}}],returns:{node:'left'}};
  project.contracts.push({graph,inputs:{a:1,b:2},canvas:{positions:{},view:{x:0,y:0,scale:1}}});previous=graph.id;
 }
 assert.throws(()=>new ProjectEditor(project),{code:'PROJECT_LIMIT'});
});
