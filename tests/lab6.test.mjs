import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {newInstanceProject,serializeInstanceProject,parseInstanceProject,instanceProjectFlow} from '../src/studio/instance-project.mjs';
import {parseFlowProject,FlowProjectEditor} from '../src/studio/flow-project.mjs';
import {createInstanceUIRuntime} from '../src/instances/ui.mjs';
import {compileInstanceUIJS} from '../src/compiler/instance-ui.mjs';
const source=await readFile(new URL('../examples/lab6.ems',import.meta.url),'utf8'),saved=await readFile(new URL('../examples/lab6.ems-project.json',import.meta.url),'utf8'),policy={capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']};
const buttons=['whileButton','forButton','repeatButton','gotoButton'];
function expected(epsilon){const terms=[];for(let n=1;n<=1075;n++){const term=2**(-n)+3**(-n);if(term<=epsilon)break;terms.push(term);}return terms;}
function values(report){const lines=report.split('\n');return {terms:lines.slice(1,-1).map(Number),sum:Number(lines.at(-1).slice('Сумма: '.length))};}
test('lab6 saved editable project is compiled from the supplied EMS source with genuine graph bodies',()=>{
 assert.equal(serializeInstanceProject(newInstanceProject(source)),saved);
 const project=parseInstanceProject(saved);assert.ok(project.authoredGraphs);
 assert.match(source,/for n in/);assert.match(source,/while term > accuracy/);
 assert.match(source,/@lab::RepeatUntil/);assert.match(source,/#until.yes ~> #report.enter/);assert.match(source,/#end.repeat ~> #begin.enter/);
});
test('lab6 transition graphs open with the shared contract library and can be saved back',()=>{
 const project=parseInstanceProject(saved);
 for(const name of ['SetEpsilon','While','For','RepeatUntil','GoTo']){const view=instanceProjectFlow(project,{kind:'transition',instance:'series',name}),flow=parseFlowProject(view.source,view.registry,view.options);assert.ok(flow.graph.nodes.length>0,name+' has a graph');assert.ok(view.registry.items.has('core.add'));assert.ok(flow.contracts.some(item=>item.graph.id==='lab.Validate'));const validate=flow.contracts.find(item=>item.graph.id==='lab.Validate').graph;assert.ok(validate.nodes.some(node=>node.uses==='std.error.Throw'));if(name!=='SetEpsilon')assert.equal(typeof view.activeContract,'string');const editor=new FlowProjectEditor(flow,view.registry,view.options);assert.ok(editor.catalogRegistry.items.has('core.add'));const reopened=parseFlowProject(editor.serialize(),view.registry,view.options);assert.equal(reopened.graph.id,flow.graph.id);}
});
test('lab6 four EMS methods include precisely terms above epsilon and agree with the independent formula',async()=>{
 const project=parseInstanceProject(saved),runtime=await createInstanceUIRuntime(project.module,project.ui,undefined,{policy});
 try{for(const epsilon of ['1','0.8333333333333333','0.5','0.001','0.000001']){
  await runtime.dispatch('accuracy','change',epsilon);const reports=[];
  for(const button of buttons){const report=await runtime.dispatch(button,'press'),actual=values(report),terms=expected(Number(epsilon));assert.equal(actual.terms.length,terms.length);for(let n=0;n<terms.length;n++)assert.ok(Math.abs(actual.terms[n]-terms[n])<1e-14);assert.ok(actual.terms.every(term=>term>Number(epsilon)));assert.ok(Math.abs(actual.sum-terms.reduce((a,b)=>a+b,0))<1e-14);reports.push(report);}
  assert.equal(new Set(reports).size,1);
 }}finally{runtime.close();}
});
test('lab6 invalid epsilon rolls back the result in every method',async()=>{
 const project=parseInstanceProject(saved),runtime=await createInstanceUIRuntime(project.module,project.ui,undefined,{policy});
 try{const report=await runtime.dispatch('whileButton','press');for(const epsilon of ['0','-1','not a number']){await runtime.dispatch('accuracy','change',epsilon);for(const button of buttons){await assert.rejects(runtime.dispatch(button,'press'));assert.equal(runtime.view().children.find(node=>node.id==='answer').props.text,report);}}}finally{runtime.close();}
});
test('lab6 compiled application executes all four methods in a fresh Node process without the EMS service',async()=>{
 const project=parseInstanceProject(saved),folder=await mkdtemp(join(tmpdir(),'ems-lab6-'));
 try{const file=join(folder,'application.mjs');await writeFile(file,compileInstanceUIJS(project.module,project.ui));const script=`const {createRuntime}=await import(${JSON.stringify('file://'+file)});const runtime=await createRuntime({policy:${JSON.stringify(policy)}});for(const button of ${JSON.stringify(buttons)})console.log(JSON.stringify(await runtime.dispatch(button,'press')));runtime.close();`;const child=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:folder,encoding:'utf8'});assert.equal(child.status,0,child.stderr);const reports=child.stdout.trim().split('\n').map(JSON.parse);assert.equal(reports.length,4);assert.equal(new Set(reports).size,1);assert.equal(values(reports[0]).sum,1.4980214723682874);}finally{await rm(folder,{recursive:true,force:true});}
});
