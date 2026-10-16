import test from 'node:test';
import assert from 'node:assert/strict';
import {newInstanceProject} from '../src/studio/instance-project.mjs';
import {InstanceUIProjectEditor} from '../src/studio/instance-ui-project.mjs';
import {createCoreRegistry} from '../src/reference/registry.mjs';
const source='@Counter{value:Number=0;+Add(delta:Number)->Number{value=core.add(value,delta);return value;}} @Counter #counter; @UI.Column #root{@UI.Text #value{text <= counter.value as number;} @UI.Button #up{text:"+";}} up.clicked ~> counter::Add(delta:1);';
test('native UI presentation snapshots are isolated from callers, source replacement, undo and failed edits',()=>{
 const editor=new InstanceUIProjectEditor(newInstanceProject(source)),original=editor.source;
 const document=editor.document;document.ui.root.children[1].props.text.literal='changed outside';document.module.program.functions.length=0;
 assert.equal(editor.document.ui.root.children[1].props.text.literal,'+');assert.ok(editor.document.module.program.functions.length);
 editor.property('up','text',{literal:'new'});assert.equal(editor.document.ui.root.children[1].props.text.literal,'new');editor.undo();assert.equal(editor.source,original);assert.equal(editor.document.ui.root.children[1].props.text.literal,'+');editor.redo();assert.equal(editor.document.ui.root.children[1].props.text.literal,'new');
 const before=editor.source;assert.throws(()=>editor.replace('{}'));assert.equal(editor.source,before);assert.equal(editor.document.ui.root.children[1].props.text.literal,'new');
 editor.source='invalid json';assert.throws(()=>editor.document);editor.source=before;assert.equal(editor.document.ui.root.children[1].props.text.literal,'new');
});
test('native UI cached presentation revalidates on registry deletion and replacement',()=>{
 const registry=createCoreRegistry(),editor=new InstanceUIProjectEditor(newInstanceProject(source,registry),registry),add=registry.items.get('core.add');void editor.document;
 registry.items.delete('core.add');assert.throws(()=>editor.document);registry.items.set('core.add',add);assert.ok(editor.document.ui);
 registry.items.set('core.add',Object.freeze({...add,output:'String'}));assert.throws(()=>editor.document);registry.items.set('core.add',add);assert.ok(editor.document.ui);
});
