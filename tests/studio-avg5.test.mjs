import {lowerGraphToIR,serializeIR} from '../src/ir/index.mjs';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ProjectEditor,parseProject} from '../src/studio/project.mjs';
const source=await readFile(new URL('../examples/studio-avg5.ems.json',import.meta.url),'utf8');
test('AVG5 project reuses the original arithmetic graph as an editable composite and exports the same semantics',async()=>{
 const original=JSON.parse(await readFile(new URL('../examples/avg5.graph.json',import.meta.url),'utf8')),editor=new ProjectEditor(parseProject(source));
 const registry=createCoreRegistry();assert.equal(serializeIR(lowerGraphToIR(editor.project.contracts[0].graph,registry),registry),serializeIR(lowerGraphToIR(original,registry),registry));assert.equal(editor.workspace.graph.nodes.length,1);assert.equal(editor.registry.resolve(editor.workspace.graph.nodes[0].uses).kind,'composite');assert.match(editor.project.name,/не WCA/);
 assert.ok(Math.abs(await editor.run()-12.566666666666663)<1e-12);editor.setInput('times',[1,2,3,4,5]);assert.equal(await editor.run(),3);
 editor.openContract(original.id);assert.equal(editor.workspace.graph.nodes.length,6);editor.literal('average','b',4);editor.collapse();assert.equal(await editor.run(),2.25);const saved=editor.serialize(),restored=new ProjectEditor(parseProject(saved));assert.equal(await restored.run(),2.25);
 const compiled=await import('data:text/javascript;base64,'+Buffer.from(restored.compile()).toString('base64'));assert.equal(await compiled.execute({times:[1,2,3,4,5]}),2.25);editor.undo();assert.equal(await editor.run(),3);
});
test('AVG5 dependency/body corruption and incompatible inputs fail instead of using a placeholder',()=>{
 const record=JSON.parse(source);record.contracts=[];assert.throws(()=>parseProject(JSON.stringify(record)));const editor=new ProjectEditor(parseProject(source)),before=editor.serialize();assert.throws(()=>editor.setInput('times','bad'),{code:'TYPE_MISMATCH'});assert.equal(editor.serialize(),before);assert.throws(()=>editor.removeComposite('demo.AverageOfFiveArithmetic'),{code:'MISSING_CONTRACT'});assert.equal(editor.serialize(),before);
});
