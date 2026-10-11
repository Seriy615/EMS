import test from 'node:test';
import assert from 'node:assert/strict';
import {serializeUIProject,parseUIProject} from '../src/ui/project.mjs';
import {UIRuntime} from '../src/ui/model.mjs';
import {fixture,policy} from './helpers/ui-fixture.mjs';
import {createStateRegistry} from '../src/runtime/reactor.mjs';
import {parseEMSModule} from '../src/frontend/index.mjs';
import {typecheckModule} from '../src/frontend/check.mjs';
import {lowerCheckedModule} from '../src/frontend/lower.mjs';

test('typed UI transport preserves signed Number/NumberArray and literal String marker without ambiguity',async()=>{
 const {application,base}=fixture();application.reactor.state[0].initial=-0;application.reactor.state.push({id:'numbers',type:'NumberArray',initial:[-0,2]});application.reactor.state[1].initial='-0';application.ui.root.children[1].events.press.inputs.delta={literal:-0};application.ui.root.children[1].props.text={literal:'-0'};
 const source=serializeUIProject(application,base),parsed=parseUIProject(source,base);assert.equal(serializeUIProject(parsed,base),source);assert.ok(Object.is(parsed.reactor.state[0].initial,-0));assert.ok(Object.is(parsed.reactor.state[3].initial[0],-0));assert.equal(parsed.reactor.state[1].initial,'-0');assert.equal(parsed.ui.root.children[1].props.text.literal,'-0');assert.ok(Object.is(parsed.ui.root.children[1].events.press.inputs.delta.literal,-0));
 const runtime=new UIRuntime(parsed,base,{policy});assert.equal(runtime.view().children[0].props.text,'-0');await runtime.dispatch('increment','press');assert.ok(Object.is(runtime.snapshot().count,-0));await runtime.dispatch('name','change','ok');assert.equal(runtime.snapshot().name,'ok');await runtime.close();
});
test('UI transport reconstructs executable call and control handlers and preserves rollback behavior',async()=>{
 const {application,base}=fixture(),parsed=parseUIProject(serializeUIProject(application,base),base),runtime=new UIRuntime(parsed,base,{policy});assert.equal(await runtime.dispatch('increment','press'),1);await assert.rejects(runtime.dispatch('name','change','reject'),{code:'USER_THROW'});await assert.rejects(runtime.dispatch('fail','press'),{code:'DIV_BY_ZERO'});assert.deepEqual(runtime.snapshot(),{count:1,name:'EMS',locked:false});await runtime.close();
});
test('UI transport pins transitive unused composite dependencies before host invocation',()=>{
 const {application,base}=fixture();let calls=0;base.registerAtomic({id:'host.leaf',version:'1.0.0',inputs:{},output:'Number',effects:[],capabilities:[],execute:()=>++calls});base.registerComposite({id:'host.outer',version:'1.0.0',graph:{schemaVersion:'0.1',id:'host.outer',version:'1.0.0',inputs:{},output:{type:'Number'},nodes:[{id:'unused',uses:'host.leaf',args:{}}],returns:{literal:1}}});
 const registry=createStateRegistry(base,application.reactor.state);application.reactor.handlers.push({event:'nested',program:lowerCheckedModule(typecheckModule(parseEMSModule('fn nested()->Number{return host.outer();}'),registry),'nested',registry).ir});const source=serializeUIProject(application,base),data=JSON.parse(source);assert.ok(data.references.some(pin=>pin.id==='host.leaf'));assert.equal(calls,0);base.items.set('host.leaf',{...base.resolve('host.leaf'),version:'2.0.0'});assert.throws(()=>parseUIProject(source,base),{code:'CONTRACT_VERSION'});assert.equal(calls,0);
});
test('malformed typed values, versions, missing/extra pins and bounded tree fail before accepted UI model',()=>{
 const {application,base}=fixture(),source=serializeUIProject(application,base);for(const change of [d=>d.references.pop(),d=>d.references.push(d.references[0]),d=>d.application.reactor.state[0].initial.type='String',d=>d.application.reactor.state[0].initial.value='nan',d=>d.application.ui.root.children[1].props.text.literal.value=1,d=>d.application.ui.root.children[1].events.press.inputs.delta.literal.type='Unknown',d=>d.extra=true,d=>d.application.ui.root.children=null,d=>d.application.reactor.handlers[0].program.version='']){const data=JSON.parse(source);change(data);assert.throws(()=>parseUIProject(JSON.stringify(data),base),error=>error.name==='EmsError');}
 assert.throws(()=>parseUIProject('{',base),{code:'INVALID_UI_PROJECT'});assert.throws(()=>parseUIProject(' '.repeat(1048577),base),{code:'UI_LIMIT'});const oversized=structuredClone(application);oversized.ui.root.children[0].props.text={literal:'界'.repeat(400000)};assert.throws(()=>serializeUIProject(oversized,base),{code:'UI_LIMIT'});const data=JSON.parse(source);data.references=data.references.reverse().map(({id,version})=>({version,id}));assert.equal(serializeUIProject(parseUIProject(JSON.stringify(data),base),base),source);
});

test('transactional UI authoring undo/storage preserve typed source and previous data on invalid/quota failures',async()=>{
 const {UIProjectEditor,UIProjectStorage}=await import('../src/studio/ui-project.mjs'),{application,base}=fixture(),editor=new UIProjectEditor(application,base),original=editor.source,edited=editor.application;edited.reactor.state[0].initial=-0;editor.replace(serializeUIProject(edited,base));assert.ok(Object.is(editor.application.reactor.state[0].initial,-0));editor.undo();assert.equal(editor.source,original);editor.redo();const records=new Map(),store=new UIProjectStorage({getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)},base);store.save(editor.application);assert.ok(Object.is(store.load().reactor.state[0].initial,-0));const before=editor.source;assert.throws(()=>editor.replace('{'),{code:'INVALID_UI_PROJECT'});assert.equal(editor.source,before);const persisted=records.get('ems.studio.ui.v1'),full=new UIProjectStorage({getItem:key=>records.get(key)??null,setItem:()=>{throw new Error('quota');}},base);assert.throws(()=>full.save(application),/quota/);assert.equal(records.get('ems.studio.ui.v1'),persisted);records.set('ems.studio.ui.v1','{');assert.throws(()=>store.load(),{code:'INVALID_UI_PROJECT'});assert.equal(records.get('ems.studio.ui.v1'),'{');
});

test('undo preflight rejects dependency drift before changing current UI source or history',async()=>{
 const {UIProjectEditor}=await import('../src/studio/ui-project.mjs'),{application,base}=fixture(),editor=new UIProjectEditor(application,base),changed=editor.application;changed.reactor.state[0].initial=5;editor.replace(serializeUIProject(changed,base));const source=editor.source,history=[...editor.history];base.items.set('core.add',{...base.resolve('core.add'),version:'2.0.0'});assert.throws(()=>editor.undo(),{code:'CONTRACT_VERSION'});assert.equal(editor.source,source);assert.deepEqual(editor.history,history);assert.deepEqual(editor.future,[]);
});
