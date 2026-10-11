import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectEditor} from '../src/studio/project.mjs';
import {prepareStudioInspection,graphInspectionWitness,validateInspectionPause} from '../src/studio/inspection-transport.mjs';
import {runTextDraft} from '../src/studio/text.mjs';

function fixture(){
 const editor=new ProjectEditor();editor.addInput('n','Number');const node=editor.addNode('core.add');editor.connect({input:'n'},node,'a');editor.literal(node,'b',1);editor.connect({node},'output','return');editor.createComposite('user.Child');
 editor.edit(p=>{p.graph.inputs={};p.inputs={};p.graph.nodes=[{id:'a',uses:'user.Child',args:{n:{literal:2}}},{id:'b',uses:'user.Child',args:{n:{literal:5}}},{id:'sum',uses:'core.add',args:{a:{node:'a'},b:{node:'b'}}}];p.graph.returns={node:'sum'};p.canvas.positions={};});editor.createComposite('user.Outer');
 editor.edit(p=>{p.graph.nodes=[{id:'outer',uses:'user.Outer',args:{}}];p.graph.returns={node:'outer'};p.canvas.positions={};});return editor;
}
const policy={allow:[{function:'user.Child',declarations:['/graph/inputs/n']}]};
test('nested repeated graph activations validate the full call chain and independent values',async()=>{
 const editor=fixture(),prepared=prepareStudioInspection({action:'graph',debug:true,project:editor.serialize(),inspection:graphInspectionWitness(editor,policy)}),events=[];assert.equal(await editor.run({graphInspection:prepared.policy,onNodeEnter:e=>events.push(e)}),9);
 const pauses=events.map((e,i)=>validateInspectionPause({...e,location:null,token:i+1},prepared)),children=pauses.filter(p=>p.callPath.at(-1).graph==='user.Child');assert.deepEqual(children.map(p=>p.inspection.variables[0].value),[2,5]);assert.ok(children.every(p=>p.callPath.length===3&&p.frames.length===3));assert.notEqual(children[0].frames.at(-1),children[1].frames.at(-1));
 const bad=structuredClone(children[0]);bad.callPath[1].node='sum';assert.throws(()=>validateInspectionPause(bad,prepared),{code:'INVALID_INSPECTION_SNAPSHOT'});
});
test('selected nested root is an explicit witness and body/version changes invalidate old permission',()=>{
 const editor=fixture(),old=graphInspectionWitness(editor,policy);editor.openContract('user.Outer');assert.throws(()=>prepareStudioInspection({action:'graph',debug:true,project:editor.serialize(),selected:'user.Outer',inspection:old}),{code:'STALE_INSPECTION_SOURCE'});
 const current=graphInspectionWitness(editor,policy);assert.ok(prepareStudioInspection({action:'graph',debug:true,project:editor.serialize(),selected:'user.Outer',inspection:current}).graphs.has('user.Child'));
 editor.edit(p=>{p.contracts.find(item=>item.graph.id==='user.Child').graph.nodes[0].args.b={literal:99};});assert.throws(()=>prepareStudioInspection({action:'graph',debug:true,project:editor.serialize(),selected:'user.Outer',inspection:current}),{code:'STALE_INSPECTION_SOURCE'});
});
test('source-defined call graphs use the checked source registry across nested function boundaries',async()=>{
 const editor=new ProjectEditor(),draft={source:'fn child(n:Number)->Number {return core.add(n,1);} fn outer()->Number {let a=child(2);let b=child(5);return core.add(a,b);} fn main()->Number {return outer();}',entry:'main',lowering:'call'},prepared=prepareStudioInspection({action:'text',debug:true,project:editor.serialize(),draft,inspection:{schemaVersion:'ems-source-inspection/1',...draft,policy:{allow:[{function:'child',declarations:['/graph/inputs/n']}]}}}),events=[];
 assert.equal(await runTextDraft(draft,editor,{}, {graphInspection:prepared.policy,onNodeEnter:e=>events.push(e)}),9);const children=events.filter(e=>e.callPath.at(-1).graph==='child');assert.deepEqual(children.map(e=>e.inspection.variables[0].value),[2,5]);for(const [i,p]of children.entries()){assert.ok(p.location);assert.equal(validateInspectionPause({...p,token:i+1},prepared).callPath.length,3);}
});
