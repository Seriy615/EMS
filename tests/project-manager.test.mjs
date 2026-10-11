import {createCoreRegistry} from '../src/reference/registry.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ProjectManager,projectURL} from '../src/studio/manager.mjs';
import {newProject,serializeProject,parseProject,ProjectEditor} from '../src/studio/project.mjs';
import {UIProjectEditor} from '../src/studio/ui-project.mjs';
const memory=()=>({data:new Map(),getItem(key){return this.data.get(key)??null;},setItem(key,value){this.data.set(key,value);}});
const graph=(id='graph')=>({id,name:id,kind:'graph',source:serializeProject(newProject(id,id)),draft:null});
const uiSource=await readFile(new URL('../examples/ui-source-counter.ems-ui.json',import.meta.url),'utf8');
const ui={id:'counter',name:'Счётчик',kind:'ui',source:uiSource,draft:null};
test('unified catalog roundtrips graph/UI source witnesses, signed zero and unapplied text candidates',async()=>{
 const storage=memory(),manager=new ProjectManager(storage),record=graph();const project=parseProject(record.source);project.inputs={n:-0};project.graph.inputs={n:{type:'Number'}};project.graph.returns={input:'n'};record.source=serializeProject(project);record.draft={schemaVersion:'ems-studio-text/1',source:'invalid unfinished EMS',entry:'main',lowering:'auto',inputs:'{"n":0}'};
 manager.save(record);manager.save(ui);const restored=new ProjectManager(storage);assert.deepEqual(restored.list().map(item=>item.kind),['graph','ui']);assert.ok(Object.is(await new ProjectEditor(parseProject(restored.load('graph').source)).run(),-0));assert.equal(restored.load('graph').draft.source,record.draft.source);assert.equal(restored.load('counter').source,uiSource);assert.ok(new UIProjectEditor((await import('../src/ui/project.mjs')).parseUIWorkspace(uiSource,createCoreRegistry()).application,undefined,{sources:(await import('../src/ui/project.mjs')).parseUIWorkspace(uiSource,createCoreRegistry()).sources}).sources.change.source);assert.equal(projectURL(ui),'/web/ui-demo.html?project=counter');
});
test('catalog copy/rename/import preserve originals and drafts and never overwrite import destinations',()=>{
 const manager=new ProjectManager(memory());manager.save(graph());manager.save(ui);const original=manager.export('graph');manager.copy('graph','copy','Копия');manager.rename('copy','Новое имя');assert.equal(parseProject(manager.load('copy').source).name,'Новое имя');assert.equal(manager.export('graph'),original);manager.import(manager.export('copy'),'imported');assert.equal(parseProject(manager.load('imported').source).id,'imported');assert.throws(()=>manager.import(original,'graph'),{code:'DUPLICATE_PROJECT'});manager.copy('counter','counterCopy','UI copy');assert.equal(manager.load('counterCopy').source,uiSource);manager.remove('copy');assert.equal(manager.load('copy'),null);assert.equal(manager.list().length,4);
});
test('invalid source witness, metadata, corrupt catalog and quota failures preserve stored bytes',()=>{
 const storage=memory(),manager=new ProjectManager(storage);manager.save(ui);const before=JSON.stringify([...storage.data]);const malformed=JSON.parse(uiSource);malformed.sources.change.source+='\n// different source'; // Source comments can remain semantically equal; change real expression instead.
 malformed.sources.change.source=malformed.sources.change.source.replace('+ delta','+ "wrong"');
 for(const record of [{...ui,source:JSON.stringify(malformed)},{...graph(),name:'mismatch'},{...ui,draft:{}},{...graph(),draft:{}}])assert.throws(()=>manager.save(record));assert.equal(JSON.stringify([...storage.data]),before);
 assert.throws(()=>manager.import('{"schemaVersion":5}','badVersion'),{code:'INVALID_PROJECT_RECORD'});
 const invalid=JSON.parse(manager.export('counter'));invalid.project.extra=true;assert.throws(()=>manager.import(JSON.stringify(invalid),'bad'));assert.equal(JSON.stringify([...storage.data]),before);
 storage.setItem=()=>{throw new Error('QuotaExceededError');};assert.throws(()=>manager.rename('counter','renamed'),/Quota/);assert.equal(JSON.stringify([...storage.data]),before);
 const key=[...storage.data.keys()][0];storage.data.set(key,'{');assert.throws(()=>manager.list(),{code:'INVALID_STORAGE'});assert.throws(()=>manager.save(graph()),{code:'INVALID_STORAGE'});assert.equal(storage.data.get(key),'{');
});

test('manager imports legacy typed graph and source-owned UI exports as independent copies',()=>{
 const manager=new ProjectManager(memory());const record=graph('legacy');manager.import(record.source,'newGraph');manager.import(uiSource,'newUI');assert.equal(parseProject(manager.load('newGraph').source).id,'newGraph');assert.equal(manager.load('newUI').source,uiSource);assert.equal(manager.load('newGraph').draft,null);assert.equal(manager.load('legacy'),null);
});
