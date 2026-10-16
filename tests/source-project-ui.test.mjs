import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ProjectManager} from '../src/studio/manager.mjs';
import {compileSourceWorkspace} from '../src/studio/source-workspace-compiler.mjs';
import {serializeSourceProject,parseSourceProject} from '../src/studio/source-project.mjs';
import {SourceProjectUISession,applySourceProjectUI} from '../src/studio/source-project-ui.mjs';
import {serializeInstanceModule} from '../src/instances/module.mjs';

function storage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}
async function fixture(){const raw=await readFile(new URL('../examples/modules/counter.source-project.json',import.meta.url),'utf8'),source=JSON.stringify(JSON.parse(raw),null,2)+'\n',store=storage(),manager=new ProjectManager(store);manager.save({id:'sourceui',name:'Исходный UI',kind:'source',source,draft:null});return {manager,source,store};}

test('visual UI edits update only source UI spans and preserve imported contracts, routes and the checked native module',async()=>{
 const {manager,source,store}=await fixture(),session=new SourceProjectUISession(store,'sourceui'),before=serializeInstanceModule(session.document.module);let ui=structuredClone(session.document.ui);
 ui.root.children[1].props.text.literal='Добавить число';ui.root.children[1].events.press.inputs.delta.literal=2;
 session.apply(ui);
 const saved=parseSourceProject(manager.load('sourceui').source),entry=saved.sources.get('app.ems');
 assert.match(entry,/import "lib\/Counter\.ems" as counters;/);assert.match(entry,/@counters::Counter #counter;/);
 assert.match(entry,/up\.press ~> counter::Change\(delta: 2\);/);assert.match(entry,/down\.press ~> counter::Change\(delta: -1\);/);
 assert.equal(serializeInstanceModule(session.document.module),before);assert.equal(session.document.ui.root.children[1].props.text.literal,'Добавить число');
 assert.deepEqual(saved.sources.get('lib/Counter.ems'),parseSourceProject(source).sources.get('lib/Counter.ems'));
 ui=structuredClone(session.document.ui);ui.root.children[2].props.text.literal='Вычесть';session.apply(ui);
 assert.equal(session.document.ui.root.children[2].props.text.literal,'Вычесть');
});

test('UI changes that alter EMS logic or bindings fail before the saved source project changes',async()=>{
 const {manager,store}=await fixture(),session=new SourceProjectUISession(store,'sourceui'),saved=manager.load('sourceui').source,ui=structuredClone(session.document.ui);
 ui.root.children[0].props.text.state='counter.unknown';
 assert.throws(()=>session.apply(ui),error=>['UNKNOWN_STATE','SOURCE_UI_MODULE_CHANGED','SOURCE_UI_MISMATCH'].includes(error.code));
 assert.equal(manager.load('sourceui').source,saved);
 const withEvent=structuredClone(session.document.ui);withEvent.root.children[1].events.press.handler='counter::Missing';
 assert.throws(()=>applySourceProjectUI(saved,'app.ems',withEvent),{code:'UNKNOWN_EVENT'});
 assert.equal(manager.load('sourceui').source,saved);
});

test('stale source windows cannot write a visual UI tree over a newer project',async()=>{
 const {manager,store}=await fixture(),session=new SourceProjectUISession(store,'sourceui'),record=manager.load('sourceui'),ui=structuredClone(session.document.ui);
 manager.save({...record,source:record.source.replace('Увеличить','Новое значение')});ui.root.children[1].props.text.literal='Старая вкладка';
 assert.throws(()=>session.apply(ui),{code:'STALE_SOURCE_PROJECT'});
 assert.match(manager.load('sourceui').source,/Новое значение/);
});
