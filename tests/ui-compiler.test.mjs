import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {compileUIJS} from '../src/compiler/ui.mjs';
import {UIRuntime} from '../src/ui/model.mjs';
import {exportUIProject} from '../tools/export-ui.mjs';
import {serializeUIProject} from '../src/ui/project.mjs';
import {fixture,policy} from './helpers/ui-fixture.mjs';
const outcome=async fn=>{try{return {value:await fn()};}catch(e){return {error:e.code,details:e.details};}};
const compiled=async(application,base)=>await import(`data:text/javascript,${encodeURIComponent(compileUIJS(application,base))}`);
test('compiled UI shares actual typed event/FIFO/render/trace behavior with the interpreter',async()=>{
 const {application,base}=fixture({profile:'control'});application.reactor.state[0].initial=-0;application.reactor.state[1].initial='-0';
 const output=await compiled(application,base),sessions=[new UIRuntime(application,base,{policy,recordTrace:true}),output.createRuntime({policy,recordTrace:true})];
 for(const s of sessions){assert.equal(s.view().children[0].props.text,'-0');assert.equal(s.view().children[3].props.value,'-0');assert.deepEqual(await Promise.all([s.dispatch('increment','press'),s.dispatch('increment','press')]),[1,2]);assert.equal(await s.dispatch('name','change','<img src=x onerror=alert(1)>'),'<img src=x onerror=alert(1)>');const copy=s.snapshot();copy.count=90;assert.equal(s.snapshot().count,2);}
 assert.deepEqual(sessions[1].snapshot(),sessions[0].snapshot());assert.deepEqual(sessions[1].view(),sessions[0].view());assert.deepEqual(sessions[1].trace(),sessions[0].trace());await Promise.all(sessions.map(s=>s.close()));
});
test('compiled UI rejects invalid events/types/disabled controls and restores committed state after errors',async()=>{
 const {application,base}=fixture({profile:'control'}),output=await compiled(application,base),sessions=[new UIRuntime(application,base,{policy,recordTrace:true}),output.createRuntime({policy,recordTrace:true})];
 for(const args of [['increment','press'],['fail','press'],['name','change','reject'],['locked','change','true'],['name','change',false],['missing','press'],['increment','press',1],['locked','change',true],['increment','press']]){
  const results=await Promise.all(sessions.map(s=>outcome(()=>s.dispatch(...args))));assert.deepEqual(results[1],results[0]);assert.deepEqual(sessions[1].snapshot(),sessions[0].snapshot());assert.deepEqual(sessions[1].view(),sessions[0].view());
 }
 assert.equal(sessions[1].snapshot().count,1);assert.equal(sessions[1].snapshot().name,'EMS');assert.deepEqual(sessions[1].trace(),sessions[0].trace());await Promise.all(sessions.map(s=>s.close()));assert.equal((await outcome(()=>sessions[1].dispatch('increment','press'))).error,'SESSION_CLOSED');
});
test('compiled UI preflight checks explicit permissions including handlers without visible events',async()=>{
 const {application,base}=fixture({profile:'control'});application.ui.root.children=application.ui.root.children.slice(0,1);const output=await compiled(application,base);
 for(const grants of [{},{capabilities:['ui.render']},{capabilities:['ui.render'],allowedEffects:['ui.render']},{capabilities:policy.capabilities,allowedEffects:['ui.render']},{capabilities:'ui.render'}]){
  const actual=await outcome(()=>output.createRuntime({policy:grants})),expected=await outcome(()=>new UIRuntime(application,base,{policy:grants}));assert.deepEqual(actual,expected);assert.ok(actual.error);
 }
 const s=output.createRuntime({policy});assert.equal(s.snapshot().count,0);await s.close();
});
test('UI compiler rejects invalid semantic trees and unsupported state graph export before execution',()=>{
 const {application,base}=fixture({profile:'control'});for(const change of [a=>a.ui.root.kind='script',a=>a.ui.root.props.innerHTML={literal:'unsafe'},a=>a.ui.root.children[1].events.press.inputs.delta={literal:'1'}]){const bad=structuredClone(application);change(bad);assert.throws(()=>compileUIJS(bad,base));}
 const old=fixture();assert.throws(()=>compileUIJS(old.application,old.base),{code:'UNSUPPORTED_TARGET'});
});
test('UI package requires explicit grants and validates source witnesses before overwriting artifacts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ems-ui-export-negative-')),source=await readFile('examples/ui-source-counter.ems-ui.json','utf8');
 try{await writeFile(join(dir,'application.mjs'),'previous checked output');await assert.rejects(exportUIProject(source,dir),{code:'PERMISSION_DENIED'});assert.equal(await readFile(join(dir,'application.mjs'),'utf8'),'previous checked output');const data=JSON.parse(source);data.sources.change.source='fn wrong()->Number{return 0;}';await assert.rejects(exportUIProject(JSON.stringify(data),dir,{policy}));assert.equal(await readFile(join(dir,'application.mjs'),'utf8'),'previous checked output');const result=await exportUIProject(source,dir,{policy});assert.deepEqual(result.files,['application.mjs','bootstrap.mjs','index.html','style.css']);assert.doesNotMatch(await readFile(join(dir,'application.mjs'),'utf8'),/\bimport\s*(?:\(|[{'*])/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('fresh process runs the exported UI semantic module without EMS installed',async()=>{
 const {application,base}=fixture({profile:'control'}),dir=await mkdtemp(join(tmpdir(),'ems-ui-export-node-'));
 try{await exportUIProject(serializeUIProject(application,base),dir,{policy});await writeFile(join(dir,'run.mjs'),`import {createRuntime} from './application.mjs';const s=createRuntime({policy:${JSON.stringify(policy)}});await s.dispatch('increment','press');try{await s.dispatch('fail','press');}catch(e){if(e.code!=='DIV_BY_ZERO')throw e;}console.log(s.snapshot().count,s.view().children[0].props.text);await s.close();`);assert.equal(execFileSync(process.execPath,[join(dir,'run.mjs')],{cwd:dir,encoding:'utf8'}).trim(),'1 1');}finally{await rm(dir,{recursive:true,force:true});}
});

test('compiled bindings preserve signed literals and own __proto__ input names',async()=>{
 const {compileUIHandler}=await import('../src/ui/source.mjs');const {application,base}=fixture({profile:'control'});
 application.reactor.state[0].initial=-0;
 application.reactor.handlers[0].program=compileUIHandler('fn run(__proto__:Number)->Number{return state.count.write(__proto__);}','run',application,base).ir;
 application.ui.root.children[1].events.press.inputs=Object.fromEntries([['__proto__',{literal:-0}]]);
 const output=await compiled(application,base),s=output.createRuntime({policy});
 try{assert.ok(Object.is(await s.dispatch('increment','press'),-0));assert.equal(s.view().children[0].props.text,'-0');assert.ok(Object.is(s.snapshot().count,-0));}finally{await s.close();}
});
