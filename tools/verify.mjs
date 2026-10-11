#!/usr/bin/env node
import assert from 'node:assert/strict';
import {compileStateControlJS} from '../src/compiler/control.mjs';
import {compileReactorJS} from '../src/compiler/reactor.mjs';
import {compileUIJS} from '../src/compiler/ui.mjs';
import {buildUIProjectPackage} from '../src/compiler/ui-package.mjs';
import {handlerSourceGraph,replaceHandlerGraphNode} from '../src/studio/control-graph.mjs';
import {editHandlerGraphNode} from '../src/studio/control-graph-ops.mjs';
import {connectHandlerGraphPort} from '../src/studio/control-graph-links.mjs';
import { readFile, stat, open } from 'node:fs/promises';
import { createCoreRegistry, parseTextEMS, validateGraph, executeGraph, compileStandaloneJS, compiledAtomicManifest, registerCompiledAtomic, registerTrustedJSBindings } from '../src/reference/index.mjs';
import { lowerGraphToIR, serializeIR, parseIR, executeIR, compileIRToJS, graphProvenance } from '../src/ir/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import { createStateRegistry, ReactorSession, replayEvents } from '../src/runtime/reactor.mjs';
import { validateContractInterface, compareContractInterfaces, registerContractBinding, createProgramLock, executeLockedIR, compileLockedIRToJS } from '../src/contracts/index.mjs';
import { runNodeConformance } from './conformance.mjs';
import { ProjectEditor,parseProject } from '../src/studio/project.mjs';
import {textFromWorkspace,projectFromText,runTextDraft} from '../src/studio/text.mjs';
import {UIProjectEditor} from '../src/studio/ui-project.mjs';
import {parseUIProject,serializeUIProject} from '../src/ui/project.mjs';
import {UIRuntime} from '../src/ui/model.mjs';
import {STANDARD_INTERFACES,standardCatalog} from '../src/stdlib/finite.mjs';
const root=new URL('../',import.meta.url);
const get=async p=>readFile(new URL(p,root),'utf8');
const readJSON=async p=>JSON.parse(await get(p));
let checks=0;
async function check(desc, fn) { const x=await fn(); assert.ok(x,desc); checks++; console.log('✓',desc); }
const required=['AGENTS.md','.agents/policy.json','PROJECT_GOAL.md','docs/spec/LANGUAGE_SEMANTICS.md','docs/spec/IR.md','schemas/ir.schema.json','docs/spec/STATE_EVENTS.md','schemas/reactor.schema.json','docs/spec/CONTROL_IR.md','schemas/control-ir.schema.json','schemas/control-finite-ir.schema.json','schemas/control-algebraic-ir.schema.json','docs/spec/CONTROL_ALGEBRAIC.md','docs/spec/CONTROL_FUTURES.md','schemas/control-futures-ir.schema.json','docs/spec/CONTROL_STREAMS.md','schemas/control-streams-ir.schema.json','docs/spec/PROGRAM_LOCK.md','schemas/program-lock.schema.json','docs/spec/RESOURCE_IDL.md','schemas/resource-interface.schema.json','docs/spec/CONTRACT_IDL.md','schemas/contract-interface.schema.json','schemas/contract-binding.schema.json','docs/spec/CONTROL_RESOURCES.md','schemas/control-resources-ir.schema.json','docs/qa/PROGRESS.md','docs/spec/EMS_FULL_SPEC.md','docs/plans/ROADMAP.md','docs/qa/ACCEPTANCE.md','tasks/backlog.json'];
for(const f of required) { await stat(new URL(f,root)); await check(`found ${f}`,()=>true); }
for(const f of ['docs/qa/CONFORMANCE.md','tests/fixtures/language-conformance.json','docs/qa/BROWSER_P1.md','examples/portable-analysis.ems']) { await stat(new URL(f,root)); await check(`found ${f}`,()=>true); }
for(const f of ['docs/spec/STUDIO_PROJECT.md','schemas/studio-project.schema.json']) { await stat(new URL(f,root)); await check(`found ${f}`,()=>true); }
await stat(new URL('docs/spec/STUDIO_COMPOSITES.md',root));await check('found docs/spec/STUDIO_COMPOSITES.md',()=>true);
await check('saved Studio example executes through existing semantic IR',async()=>await new ProjectEditor(parseProject(await get('examples/studio-sum.ems.json'))).run()===5);
await check('saved nested Studio composite dependencies execute actual edited body',async()=>await new ProjectEditor(parseProject(await get('examples/studio-composite.ems.json'))).run()===12);
await stat(new URL('docs/spec/STUDIO_TEXT.md',root));await check('found docs/spec/STUDIO_TEXT.md',()=>true);
await check('Studio graph/text roundtrip preserves serialized program and result',async()=>{const editor=new ProjectEditor(parseProject(await get('examples/studio-sum.ems.json'))),text=textFromWorkspace(editor),converted=new ProjectEditor(projectFromText(text,editor,editor.workspace.inputs).project);return converted.serialize()===editor.serialize()&&await runTextDraft(text,editor,editor.workspace.inputs)===5;});
await check('Studio text bridge preserves eager unused-operation failures',async()=>{const editor=new ProjectEditor(),draft={source:'fn test()->Number {let unused=core.div(1,0);return 5;}',entry:'test',lowering:'auto'},converted=new ProjectEditor(projectFromText(draft,editor,{}).project);try{await converted.run();return false;}catch(error){return error.code==='DIV_BY_ZERO';}});
await stat(new URL('docs/spec/STANDARD_LIBRARY.md',root));await check('found docs/spec/STANDARD_LIBRARY.md',()=>true);
await check('all standard library public interfaces validate independently',()=>STANDARD_INTERFACES.length===36&&STANDARD_INTERFACES.every(spec=>validateContractInterface(spec)));
await check('standard library text and persisted graph example execute shared semantics',async()=>{const text={source:await get('examples/stdlib-report.ems'),entry:'analyze',lowering:'auto'};return await runTextDraft(text,new ProjectEditor(),{values:[3,-1,4]})==='sum=6'&&await new ProjectEditor(parseProject(await get('examples/studio-library.ems.json'))).run()==='sum=6';});
await stat(new URL('docs/spec/COLLECTION_TEMPLATES.md',root));await check('found docs/spec/COLLECTION_TEMPLATES.md',()=>true);
await check('typed collection templates execute through shared control IR',async()=>{const source=await get('examples/collection-pipeline.ems'),draft={source,entry:'analyze',lowering:'auto'};return JSON.stringify(await runTextDraft(draft,new ProjectEditor(),{values:[-3,0,2]}))==='[9,4]';});
await check('catalog distinguishes installed contracts and typed collection templates',()=>standardCatalog().schemaVersion==='ems-stdlib-catalog/2'&&standardCatalog().contracts.length===36&&standardCatalog().templates.length===2);
for(const file of ['docs/spec/STUDIO_COLLECTIONS.md','schemas/studio-collection-project.schema.json']){await stat(new URL(file,root));await check(`found ${file}`,()=>true);}
await check('saved visual collection authoring and verified control IR execute independently',async()=>{const source=await get('examples/studio-collections.ems.json'),editor=new ProjectEditor(parseProject(source));const module=await import('data:text/javascript,'+encodeURIComponent(editor.compile()));return editor.serialize()===source&&JSON.stringify(await editor.run())==='[3]'&&JSON.stringify(module.execute(editor.project.inputs))==='[3]';});
for(const file of ['docs/spec/UI_TREE.md','schemas/ui-application.schema.json']){await stat(new URL(file,root));await check(`found ${file}`,()=>true);}
await check('semantic UI counter dispatches actual EMS IR and renders committed state',async()=>{const application=await readJSON('examples/ui-counter.json'),linked=createStateRegistry(createCoreRegistry(),application.reactor.state),bundle=lowerCheckedModule(typecheckModule(parseEMSModule(await get('examples/counter.ems')),linked),'demo.Counter',linked);assert.equal(serializeIR(bundle.ir,linked),serializeIR(application.reactor.handlers[0].program,linked));const runtime=new UIRuntime(application,createCoreRegistry(),{policy:{capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']}});try{await runtime.dispatch('increment','press');await runtime.dispatch('increment','press');await runtime.dispatch('decrement','press');return runtime.view().children[1].props.text==='1';}finally{await runtime.close();}});
for(const file of ['docs/spec/UI_PROJECT.md','schemas/ui-project.schema.json']){await stat(new URL(file,root));await check(`found ${file}`,()=>true);}
await check('typed UI project roundtrips and restores actual EMS counter handlers',async()=>{const source=await get('examples/ui-counter.ems-ui.json'),base=createCoreRegistry(),application=parseUIProject(source,base);if(serializeUIProject(application,base)!==source)return false;const runtime=new UIRuntime(application,base,{policy:{capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']}});try{return await runtime.dispatch('increment','press')===1;}finally{await runtime.close();}});
await stat(new URL('docs/spec/UI_AUTHORING.md',root));await check('found docs/spec/UI_AUTHORING.md',()=>true);
await check('UI handler authoring stores a checked source witness and updates actual EMS behavior',async()=>{const base=createCoreRegistry(),editor=new UIProjectEditor(await readJSON('examples/ui-counter.json'),base);editor.applyHandler('change','fn update(delta:Number)->Number{return state.count.write(state.count.read()+delta*2);}','update');const restored=parseUIProject(editor.source,base),runtime=new UIRuntime(restored,base,{policy:{capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']}});try{return JSON.parse(editor.source).schemaVersion==='ems-ui-project/2'&&await runtime.dispatch('increment','press')===2;}finally{await runtime.close();}});
await check('shipped source-owned UI project has a reproducible v2 source witness',async()=>{const source=await get('examples/ui-source-counter.ems-ui.json'),base=createCoreRegistry(),application=parseUIProject(source,base),sources=JSON.parse(source).sources;return sources.change.source===await get('examples/counter.ems')&&serializeUIProject(application,base,{sources})===source;});
for(const file of ['docs/spec/UI_WORKER.md','src/ui/worker-host.mjs','web/ui-worker.mjs']){await stat(new URL(file,root));await check(`found ${file}`,()=>true);}
const policy=await readJSON('.agents/policy.json');
await check('models exactly Sol 6.1 + Luna 6',()=>policy.agents.approvedDisplayNames.join(',')==='GPT-6.1 Sol,GPT-6 Luna');
await check('fallback disabled',()=>policy.agents.allowImplicitModelFallback===false);
const backlog=await readJSON('tasks/backlog.json');
await check('backlog model policy matches owner',()=>JSON.stringify(backlog.agentPolicy.approved)===JSON.stringify(policy.agents.approvedDisplayNames) && backlog.tasks.every(t=>JSON.stringify(t.ownerModelPolicy)===JSON.stringify(policy.agents.approvedDisplayNames)));
await check('completed tasks have completed dependencies',()=>backlog.tasks.every(t=>t.status!=='DONE' || t.dependsOn.every(id=>backlog.tasks.find(d=>d.id===id)?.status==='DONE')));
const graph=await readJSON('examples/avg5.graph.json');
const registry=createCoreRegistry();
validateGraph(graph,registry); await check('graph validates',()=>true);
const result=await executeGraph(graph,{times:[12.4,11.85,13.2,12.1,14]},registry);
await check('graph computes 12.566...',()=>Math.abs(result-12.566666666666666)<1e-9);
const textGraph=parseTextEMS(await get('examples/avg5.ems'));
const textResult=await executeGraph(textGraph,{times:[12.4,11.85,13.2,12.1,14]},registry);
await check('text and graph agree',()=>textResult===result);
const ir=lowerGraphToIR(graph,registry);
const serialized=serializeIR(ir,registry);
await check('IR roundtrip is canonical',()=>serializeIR(parseIR(serialized,registry),registry)===serialized);
await check('text and graph share semantic IR',()=>serializeIR(lowerGraphToIR(textGraph,registry),registry)===serialized);
await check('graph provenance remains outside IR',()=>!Object.hasOwn(ir,'sourceMap') && graphProvenance(graph,'examples/avg5.graph.json').nodes.total.pointer==='/nodes/0');
const vectors=(await readJSON('tests/fixtures/semantics.json')).vectors;
await check('all core vectors conform through serialized IR and standalone',async()=>{
  for(const vector of vectors){
    const lowered=parseIR(serializeIR(lowerGraphToIR(vector.graph,registry),registry),registry);
    const module=await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(lowered,registry))}`);
    const outcome=async fn=>{try{return {value:await fn()};}catch(e){return {error:e.code,name:e.name,details:e.details};}};
    const reference=await outcome(()=>executeGraph(vector.graph,vector.inputs,registry));
    assert.deepEqual(await outcome(()=>executeIR(lowered,vector.inputs,registry)),reference);
    assert.deepEqual(await outcome(()=>module.execute(vector.inputs)),reference);
    if(vector.expected.error) assert.equal(reference.error,vector.expected.error);
    else assert.deepEqual(reference,{value:vector.expected.value});
  }
  return true;
});
const sealed=compiledAtomicManifest(graph); await check('sealing excludes source graph',()=>sealed.kind==='atomic' && !Object.hasOwn(sealed,'graph'));
const js=compileStandaloneJS(graph,registry);
const runtime=await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(js)}`);
await check('standalone compiled result matches',()=>runtime.execute({times:[12.4,11.85,13.2,12.1,14]})===result);
const sealedReg=createCoreRegistry();
registerCompiledAtomic(sealedReg,sealed,runtime.execute);
const outer=await readJSON('examples/composite-using-atomic.graph.json');
const value=await executeGraph(outer,{times:[12.4,11.85,13.2,12.1,14]},sealedReg);
await check('sealing binds as an atom in composite',()=>Math.abs(value-2*result)<1e-9);
const foreignManifest=await readJSON('examples/external-math.bindings.json');
const jsForeignReg=createCoreRegistry();
await registerTrustedJSBindings(jsForeignReg,foreignManifest,new URL('examples/external-math.mjs',root).href);
const imported=await readJSON('examples/imported-library.graph.json');
await check('library -> atomic contracts -> composite',async ()=> (await executeGraph(imported,{x:12},jsForeignReg))===100);
const spec=await get('docs/spec/EMS_FULL_SPEC.md');
await check('scope covers text + visual',()=>spec.includes('Текстовая форма') && spec.includes('визуальная форма'));
await check('scope covers atomic / composite',()=>spec.includes('Атомарные контракты') && spec.includes('Составные контракты'));
await check('scope covers library import',()=>spec.includes('Импорт библиотек'));
const ast=parseEMSModule(await get('examples/language-core.ems'));
await check('EMS frontend parses located module syntax',()=>ast.schemaVersion==='ems-ast/1' && ast.declarations.length===5 && ast.declarations.every(d=>d.location.start.line>=1));
await check('EMS frontend preserves M0 source syntax',async()=>parseEMSModule(await get('examples/avg5.ems')).declarations[0].name===graph.id);
const checked=typecheckModule(parseEMSModule(await get('examples/avg5.ems')),registry);
const moduleBundle=lowerCheckedModule(checked,graph.id,registry);
await check('typed AST executes through shared IR/runtime',async()=>await executeIR(moduleBundle.ir,{times:[12.4,11.85,13.2,12.1,14]},moduleBundle.registry)===result);
const typedOutput=await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(moduleBundle.ir,moduleBundle.registry))}`);
await check('typed AST standalone matches reference semantics',()=>typedOutput.execute({times:[12.4,11.85,13.2,12.1,14]})===result);
const logCalls=[];
const effectRegistry=createCoreRegistry().registerAtomic({id:'demo.stdout',inputs:{message:'String'},output:'String',effects:['log.write'],capabilities:['stdout.write'],execute:({message})=>{logCalls.push(message);return message;}});
const effectBundle=lowerCheckedModule(typecheckModule(parseEMSModule(await get('examples/effect-text.ems')),effectRegistry),'demo.OrderedLogs',effectRegistry);
await check('textual pure assertion rejects transitive host effects',()=>{
  assert.throws(()=>typecheckModule(parseEMSModule('fn test() -> String requires pure { return demo.stdout("denied"); }'),effectRegistry),{code:'EFFECT_MISMATCH'});return true;
});
await check('effect IR requires grants before any call',async()=>{
  await assert.rejects(executeIR(effectBundle.ir,{},effectBundle.registry),{code:'PERMISSION_DENIED'});assert.deepEqual(logCalls,[]);return true;
});
await check('text effects retain order through IR and reject unsupported compilation',async()=>{
  const restored=parseIR(serializeIR(effectBundle.ir,effectBundle.registry),effectBundle.registry);
  assert.equal(await executeIR(restored,{},effectBundle.registry,{capabilities:['stdout.write'],allowedEffects:['log.write']}),'second');
  assert.deepEqual(logCalls,['first','second']);assert.throws(()=>compileIRToJS(restored,effectBundle.registry),{code:'UNSUPPORTED_TARGET'});return true;
});
const stateDeclarations=[{id:'count',type:'Number',initial:0}];
const stateRegistry=createStateRegistry(createCoreRegistry(),stateDeclarations);
const counterBundle=lowerCheckedModule(typecheckModule(parseEMSModule(await get('examples/counter.ems')),stateRegistry),'demo.Counter',stateRegistry);
const counterManifest={schemaVersion:'ems-reactor/1',id:'demo.counter',version:'1.0.0',state:stateDeclarations,handlers:[{event:'increment',program:counterBundle.ir}]};
const counterOptions={policy:{capabilities:['state.read','state.write'],allowedEffects:['state.read','state.write']},recordTrace:true};
const counterSession=new ReactorSession(counterManifest,counterBundle.registry,counterOptions);
await check('textual state events execute in FIFO order',async()=>{
  assert.deepEqual(await Promise.all([1,2,-1].map(delta=>counterSession.dispatch('increment',{delta}))),[1,3,2]);return counterSession.snapshot().count===2;
});
await check('state event replay reproduces committed trace',async()=>{
  const replay=new ReactorSession(counterManifest,counterBundle.registry,counterOptions);
  await replayEvents(replay,counterSession.trace());assert.deepEqual(replay.trace(),counterSession.trace());
  await replay.close();await counterSession.close();return true;
});
const controlBundle=lowerCheckedModule(typecheckModule(parseEMSModule(await get('examples/factorial.ems')),registry),'demo.Factorial',registry);
const controlIR=parseIR(serializeIR(controlBundle.ir,controlBundle.registry),controlBundle.registry);
await check('control IR executes checked loop semantics',async()=>controlIR.schemaVersion==='ems-ir/2' && await executeIR(controlIR,{n:5},controlBundle.registry)===120);
const controlOutput=await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(controlIR,controlBundle.registry))}`);
await check('standalone control loop agrees and preserves execution limits',()=>{
  assert.equal(controlOutput.execute({n:5}),120);assert.throws(()=>controlOutput.execute({n:5},{maxSteps:3}),{code:'STEP_LIMIT'});return true;
});
const recoveryBundle=lowerCheckedModule(typecheckModule(parseEMSModule(await get('examples/error-recovery.ems')),registry),'demo.ErrorRecovery',registry);
const recoveryIR=parseIR(serializeIR(recoveryBundle.ir,registry),registry);
await check('typed user exceptions recover through serialized control IR',async()=>recoveryIR.profile==='ems-control-errors/1' && await executeIR(recoveryIR,{value:-5},registry)===5);
const recoveryOutput=await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(recoveryIR,registry))}`);
await check('standalone typed catch agrees with runtime',()=>recoveryOutput.execute({value:-5})===5);
const guarded=lowerCheckedModule(typecheckModule(parseEMSModule('fn guarded()->Number { try { while true {} return 1; } finally { return 2; } }'),registry),'guarded',registry);
await check('finally cannot suppress exhausted execution budget',async()=>{
  await assert.rejects(executeIR(guarded.ir,{},registry,{maxSteps:10}),{code:'STEP_LIMIT'});
  const output=await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(guarded.ir,registry))}`);
  assert.throws(()=>output.execute({},{maxSteps:10}),{code:'STEP_LIMIT'});return true;
});
const algebraicBundle=lowerCheckedModule(typecheckModule(parseEMSModule(await get('examples/algebraic.ems')),registry),'demo.Resolve',registry);
const algebraicIR=parseIR(serializeIR(algebraicBundle.ir,registry),registry);
await check('algebraic control IR preserves typed presence and absence',async()=>{
  assert.equal(algebraicIR.profile,'ems-control-algebraic/1');
  assert.deepEqual(await executeIR(algebraicIR,{value:{tag:'Some',value:4}},registry),{tag:'Ok',value:5});
  assert.deepEqual(await executeIR(algebraicIR,{value:{tag:'None'}},registry),{tag:'Err',value:'missing value'});return true;
});
const algebraicOutput=await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(algebraicIR,registry))}`);
await check('algebraic standalone matches runtime and rejects host null',async()=>{
  assert.deepEqual(algebraicOutput.execute({value:{tag:'Some',value:4}}),{tag:'Ok',value:5});
  assert.deepEqual(algebraicOutput.execute({value:{tag:'None'}}),{tag:'Err',value:'missing value'});
  assert.throws(()=>algebraicOutput.execute({value:null}),{code:'TYPE_MISMATCH'});
  await assert.rejects(executeIR(algebraicIR,{value:null},registry),{code:'TYPE_MISMATCH'});return true;
});
const futuresBundle=lowerCheckedModule(typecheckModule(parseEMSModule(await get('examples/futures.ems')),registry),'demo.FutureTotal',registry);
const futuresIR=parseIR(serializeIR(futuresBundle.ir,registry),registry);
await check('language Future tasks and typed await execute from serialized IR',async()=>futuresIR.profile==='ems-control-futures/1' && await executeIR(futuresIR,{value:3},registry)===9);
const futuresOutput=await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(futuresIR,registry))}`);
await check('independent async standalone matches language Future result',async()=>await futuresOutput.execute({value:3})===9);
await check('future creation budget is shared by runtime and standalone',async()=>{
  await assert.rejects(executeIR(futuresIR,{value:3},registry,{maxFutures:1}),{code:'FUTURE_LIMIT'});
  await assert.rejects(futuresOutput.execute({value:3},{maxFutures:1}),{code:'FUTURE_LIMIT'});return true;
});
const streamsBundle=lowerCheckedModule(typecheckModule(parseEMSModule(await get('examples/streams.ems')),registry),'demo.StreamTotal',registry);
const streamsIR=parseIR(serializeIR(streamsBundle.ir,registry),registry);
await check('bounded Stream producer/consumer executes through serialized shared IR',async()=>streamsIR.profile==='ems-control-streams/1' && await executeIR(streamsIR,{values:[1,2,3]},registry)===6);
const streamsOutput=await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(streamsIR,registry))}`);
await check('independent Stream standalone agrees with runtime',async()=>await streamsOutput.execute({values:[1,2,3]})===6);
await check('terminal producer budget failure releases Stream waiters and preserves code',async()=>{
  await assert.rejects(executeIR(streamsIR,{values:[1,2,3]},registry,{maxSteps:30}),{code:'STEP_LIMIT'});
  await assert.rejects(streamsOutput.execute({values:[1,2,3]},{maxSteps:30}),{code:'STEP_LIMIT'});return true;
});
const resourcesBundle=lowerCheckedModule(typecheckModule(parseEMSModule(await get('examples/resources.ems')),registry),'demo.ResourceTotal',registry);
const resourcesIR=parseIR(serializeIR(resourcesBundle.ir,registry),registry);
await check('resource using executes from typed serialized IR',async()=>resourcesIR.profile==='ems-control-resources/1' && await executeIR(resourcesIR,{value:4},registry)===5);
const resourcesOutput=await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(resourcesIR,registry))}`);
await check('independent resource standalone agrees and releases once',async()=>{
  const events=[];assert.equal(await resourcesOutput.execute({value:4},{onResourceCleanup:event=>events.push(event)}),5);
  assert.equal(events.length,1);return events[0].phase==='released';
});
await check('resource cleanup survives program step exhaustion in runtime and standalone',async()=>{
  const bundle=lowerCheckedModule(typecheckModule(parseEMSModule('fn guarded()->Number { using cell=resource.cell(1); while true {} return 0; }'),registry),'guarded',registry);
  const output=await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(bundle.ir,registry))}`);
  for(const run of [options=>executeIR(bundle.ir,{},registry,options),options=>output.execute({},options)]){
    const events=[];await assert.rejects(run({maxSteps:20,onResourceCleanup:event=>events.push(event)}),{code:'STEP_LIMIT'});
    assert.equal(events.length,1);assert.equal(events[0].phase,'released');
  }return true;
});
const publicInterface=validateContractInterface(await readJSON('examples/contract-interface.json'));
const publicBinding=await readJSON('examples/contract-binding.json');
const idlRegistry=createCoreRegistry();registerContractBinding(idlRegistry,publicInterface,publicBinding,{target:'node'});
const idlBundle=lowerCheckedModule(typecheckModule(parseEMSModule('fn division(a:Number,b:Number)->Number { return std.math.divide(a,b); }'),idlRegistry),'division',idlRegistry);
await check('separate IDL binding executes public contract through shared IR',async()=>await executeIR(idlBundle.ir,{a:6,b:2},idlRegistry)===3);
const idlOutput=await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(idlBundle.ir,idlRegistry))}`);
await check('IDL standalone preserves preconditions before implementation',async()=>{
  assert.equal(idlOutput.execute({a:6,b:2}),3);assert.throws(()=>idlOutput.execute({a:1,b:0}),{code:'PRECONDITION_FAILED'});
  await assert.rejects(executeIR(idlBundle.ir,{a:1,b:0},idlRegistry),{code:'PRECONDITION_FAILED'});return true;
});
await check('IDL minor change cannot add undeclared capabilities',()=>{
  const next=structuredClone(publicInterface);next.version='1.1.0';next.semantics.capabilities=['network'];return !compareContractInterfaces(publicInterface,next).compatible;
});
const compositeRegistry=createCoreRegistry();
const divideGraph={schemaVersion:'0.1',id:'demo.divide',version:'1.0.0',inputs:{a:{type:'Number'},b:{type:'Number'}},output:{type:'Number'},nodes:[{id:'divide',uses:'core.div',args:{a:{input:'a'},b:{input:'b'}}}],returns:{node:'divide'}};
compositeRegistry.registerComposite({id:divideGraph.id,version:divideGraph.version,graph:divideGraph});
const compositeBinding=structuredClone(publicBinding);compositeBinding.id='ems.composite.divide';compositeBinding.implementation.id=divideGraph.id;
registerContractBinding(compositeRegistry,publicInterface,compositeBinding,{target:'node'});
const selectedComposite=compositeRegistry.resolve(publicInterface.id);
await check('public IDL binding preserves inspectable composite nodes',async()=>{
  assert.equal(selectedComposite.kind,'composite');assert.deepEqual(selectedComposite.graph.nodes,divideGraph.nodes);
  return await executeGraph(selectedComposite.graph,{a:6,b:2},compositeRegistry)===3;
});
const compositeIR=lowerGraphToIR(selectedComposite.graph,compositeRegistry);
const compositeOutput=await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(compositeIR,compositeRegistry))}`);
await check('direct composite IR and standalone retain public precondition',async()=>{
  await assert.rejects(executeIR(parseIR(serializeIR(compositeIR,compositeRegistry),compositeRegistry),{a:1,b:0},compositeRegistry),{code:'PRECONDITION_FAILED'});
  assert.throws(()=>compositeOutput.execute({a:1,b:0}),{code:'PRECONDITION_FAILED'});return compositeOutput.execute({a:6,b:2})===3;
});
const resourceInterface=validateContractInterface(await readJSON('examples/resource-interface.json'));
await check('resource public IDL exposes readonly execution-owned lifecycle',()=>resourceInterface.lifecycle.ownership==='execution'&&resourceInterface.lifecycle.write===null);
const resourceIDLRegistry=createCoreRegistry();let resourceIDLReleased=0;
resourceIDLRegistry.registerResource({id:'node.file.read',inputs:{path:'String'},valueType:'String',effects:['fs.read'],capabilities:['fs.read'],acquire:({path})=>open(path,'r'),read:file=>file.readFile('utf8'),release:async file=>{await file.close();resourceIDLReleased++;}});
registerContractBinding(resourceIDLRegistry,resourceInterface,await readJSON('examples/resource-binding.json'),{target:'node'});
const resourceIDLBundle=lowerCheckedModule(typecheckModule(parseEMSModule('fn read(path:String)->String { using value=std.file.read(path); return resource.read(value); }'),resourceIDLRegistry),'read',resourceIDLRegistry);
await check('public resource interface reads an actual file and completes owned release',async()=>{
  assert.equal(await executeIR(resourceIDLBundle.ir,{path:new URL('examples/resources.ems',root).pathname},resourceIDLBundle.registry,{allowedEffects:['fs.read'],capabilities:['fs.read']}),await get('examples/resources.ems'));return resourceIDLReleased===1;
});
const programLock=await createProgramLock(ir,registry,{target:'node'});
await check('dependency lock executes exact core program',async()=>await executeLockedIR(programLock,ir,{times:[12.4,11.85,13.2,12.1,14]},registry,{target:'node'})===result);
const lockedOutput=await import(`data:text/javascript,${encodeURIComponent(await compileLockedIRToJS(programLock,ir,registry,{target:'node'}))}`);
await check('verified standalone retains arithmetic result',()=>lockedOutput.execute({times:[12.4,11.85,13.2,12.1,14]})===result);
await check('locked execution rejects changed target before execution',async()=>{await assert.rejects(executeLockedIR(programLock,ir,{times:[]},registry,{target:'web'}),{code:'LOCK_MISMATCH'});return true;});
await check('common conformance gate matches a typed value and detailed failure across fresh standalone processes',async()=>{
  const report=await runNodeConformance([
    {id:'verify.value',source:'fn test()->Number {return 3;}',expected:{value:3}},
    {id:'verify.error',source:'fn test()->Number {return 1/0;}',expected:{error:'DIV_BY_ZERO'}}
  ]);
  return report.passed===2&&report.failed===0;
});
const compiledStateRegistry=createStateRegistry(createCoreRegistry(),[{id:'count',type:'Number',initial:0}]);
const compiledStateIR=lowerCheckedModule(typecheckModule(parseEMSModule(await get('examples/counter.ems')),compiledStateRegistry),'demo.Counter',compiledStateRegistry,{profile:'control'}).ir;
const compiledStateModule=await import(`data:text/javascript,${encodeURIComponent(compileStateControlJS(compiledStateIR,compiledStateRegistry))}`);
await check('kernel state handler compiles without EMS imports and keeps actual reads/writes',()=>{
  let count=0;const state={read:()=>count,write:(_,value)=>(count=value)};
  const options={state,capabilities:['state.read','state.write'],allowedEffects:['state.read','state.write']};
  return compiledStateModule.execute({delta:2},options)===2&&compiledStateModule.execute({delta:3},options)===5&&count===5;
});
await check('compiled state handler preserves permission checks before state access',()=>{
  let calls=0;assert.throws(()=>compiledStateModule.execute({delta:1},{state:{read:()=>++calls,write:()=>++calls}}),{code:'PERMISSION_DENIED'});return calls===0;
});
const standaloneReactorManifest={schemaVersion:'ems-reactor/1',id:'verify.counter',version:'1.0.0',state:[{id:'count',type:'Number',initial:0}],handlers:[{event:'update',program:compiledStateIR}]};
const standaloneReactorModule=await import(`data:text/javascript,${encodeURIComponent(compileReactorJS(standaloneReactorManifest,compiledStateRegistry))}`);
await check('independent state session owns FIFO commits and deterministic replay',async()=>{
 const options={policy:{capabilities:['state.read','state.write'],allowedEffects:['state.read','state.write']},recordTrace:true};
 const s=standaloneReactorModule.createSession(options),r=standaloneReactorModule.createSession(options);
 try{assert.deepEqual(await Promise.all([s.dispatch('update',{delta:2}),s.dispatch('update',{delta:3})]),[2,5]);await standaloneReactorModule.replayEvents(r,s.trace());assert.deepEqual(r.trace(),s.trace());return r.snapshot().count===5;}finally{await s.close();await r.close();}
});
await check('independent state session close cancels queued writes before commit',async()=>{
 const s=standaloneReactorModule.createSession({policy:{capabilities:['state.read','state.write'],allowedEffects:['state.read','state.write']}});
 const pending=assert.rejects(s.dispatch('update',{delta:100}),{code:'CANCELLED'});await s.close();await pending;await assert.rejects(s.dispatch('update',{delta:1}),{code:'SESSION_CLOSED'});return s.snapshot().count===0;
});
const standaloneUIBase=createCoreRegistry(),standaloneUIApplication=parseUIProject(await get('examples/ui-source-counter.ems-ui.json'),standaloneUIBase);
const standaloneUIModule=await import(`data:text/javascript,${encodeURIComponent(compileUIJS(standaloneUIApplication,standaloneUIBase))}`);
await check('independent semantic UI dispatches actual state events without EMS imports',async()=>{
 const s=standaloneUIModule.createRuntime({policy:{capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']}});
 try{await s.dispatch('increment','press');await s.dispatch('increment','press');await s.dispatch('decrement','press');return s.snapshot().count===1&&s.view().children[1].props.text==='1';}finally{await s.close();}
});
await check('independent UI preflight denies missing state grants before preview',()=>{
 assert.throws(()=>standaloneUIModule.createRuntime({policy:{capabilities:['ui.render'],allowedEffects:['ui.render']}}),{code:'PERMISSION_DENIED'});return true;
});
await check('shared UI package contains an actual independent executable application',async()=>{
 const policy={capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']};
 const files=await buildUIProjectPackage(await get('examples/ui-source-counter.ems-ui.json'),{policy});
 const output=await import(`data:text/javascript,${encodeURIComponent(files['application.mjs'])}`),runtime=output.createRuntime({policy});
 try{return await runtime.dispatch('increment','press')===1&&runtime.snapshot().count===1;}finally{await runtime.close();}
});
await check('typed control graph edit recompiles an actual source-owned UI handler',async()=>{
 const editor=new UIProjectEditor(standaloneUIApplication,standaloneUIBase,{sources:JSON.parse(await get('examples/ui-source-counter.ems-ui.json')).sources});
 const graph=handlerSourceGraph(editor,'change'),node=graph.nodes.find(item=>item.kind==='BinaryExpression');
 replaceHandlerGraphNode(editor,'change',graph.source,node.id,'state.count.read()+delta*2');
 const runtime=new UIRuntime(editor.application,standaloneUIBase,{policy:{capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']}});
 try{return await runtime.dispatch('increment','press')===2;}finally{await runtime.close();}
});
await check('structured graph call edit executes through the original typed handler frontend',async()=>{
 const editor=new UIProjectEditor(standaloneUIApplication,standaloneUIBase,{sources:JSON.parse(await get('examples/ui-source-counter.ems-ui.json')).sources});
 const graph=handlerSourceGraph(editor,'change'),node=graph.nodes.find(item=>item.contract?.id==='state.count.write');
 editHandlerGraphNode(editor,'change',graph.source,node.id,{kind:'call',target:'state.count.write',arguments:['next*3']});
 const runtime=new UIRuntime(editor.application,standaloneUIBase,{policy:{capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']}});
 try{return await runtime.dispatch('increment','press')===3;}finally{await runtime.close();}
});
await check('typed graph port connection reuses the selected lexical parameter',async()=>{
 const editor=new UIProjectEditor(standaloneUIApplication,standaloneUIBase,{sources:JSON.parse(await get('examples/ui-source-counter.ems-ui.json')).sources});
 const graph=handlerSourceGraph(editor,'change'),source=graph.nodes.find(item=>item.kind==='Parameter'),target=graph.nodes.find(item=>item.contract?.id==='state.count.write');
 connectHandlerGraphPort(editor,'change',graph.source,source.id,target.id,'value');
 const runtime=new UIRuntime(editor.application,standaloneUIBase,{policy:{capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']}});
 try{await runtime.dispatch('increment','press');return await runtime.dispatch('increment','press')===1;}finally{await runtime.close();}
});
await check('unified project catalog preserves source-owned UI and imports a separate copy',async()=>{
 const {ProjectManager}=await import('../src/studio/manager.mjs');const values=new Map(),manager=new ProjectManager({getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)});
 manager.import(await get('examples/ui-source-counter.ems-ui.json'),'counter');const original=manager.export('counter');manager.import(original,'copy');return manager.load('copy').source===manager.load('counter').source&&manager.export('counter')===original&&manager.list().length===2;
});
await check('AVG5 Studio example has a real reusable six-operation composite',async()=>{
 const project=parseProject(await get('examples/studio-avg5.ems.json')),editor=new ProjectEditor(project);editor.setInput('times',[1,2,3,4,5]);return project.contracts.length===1&&project.contracts[0].graph.nodes.length===6&&await editor.run()===3;
});
await check('graph debugger steps the original evaluator with payload-free exact node locations',async()=>{
 const {GraphStepper}=await import('../src/studio/debugger.mjs');
 const editor=new ProjectEditor(parseProject(await get('examples/studio-avg5.ems.json'))),locations=[];
 let gate;gate=new GraphStepper(pause=>{locations.push(pause);gate.resume(pause.token,'step');});
 const value=await editor.run({onNodeEnter:event=>gate.enter(event)});
 return Math.abs(value-12.566666666666663)<1e-12&&locations.length===7&&locations[0].callPath[0].node==='avg5'&&locations[1].callPath.at(-1).node==='total'&&Object.keys(locations[1].inputs).join(',')==='values'&&locations[1].inputs.values==='NumberArray';
});
await check('control text debugger maps actual lazy execution to fresh source locations',async()=>{
 const {GraphStepper}=await import('../src/studio/debugger.mjs'),events=[];
 let gate;gate=new GraphStepper(pause=>{events.push(pause);gate.resume(pause.token,'step');});
 const draft={source:'fn test(x:Number)->Number {if x>0 {return x*2;}else {return core.div(1,0);}}',entry:'test',lowering:'auto'};
 const value=await runTextDraft(draft,new ProjectEditor(),{x:3},{onControlEnter:event=>gate.enter(event)});
 return value===6&&events[0].kind==='if'&&events.every(event=>event.location)&&!events.some(event=>draft.source.slice(event.location.start.offset,event.location.end.offset)==='core.div(1,0)');
});
await check('UI event diagnostics leave draft state private until the existing transaction commits',async()=>{
 const runtime=new UIRuntime(standaloneUIApplication,standaloneUIBase,{policy:{capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']}}),events=[];
 try{const value=await runtime.dispatch('increment','press',undefined,{onControlEnter:event=>{events.push(event);assert.equal(runtime.snapshot().count,0);}});return value===1&&runtime.snapshot().count===1&&events.length>0&&events.every(event=>!Object.hasOwn(event,'state'));}finally{await runtime.close();}
});
await check('source breakpoints stop each actual loop iteration without changing its output',async()=>{
 const {GraphStepper}=await import('../src/studio/debugger.mjs'),{breakpointAtTextOffset}=await import('../src/studio/breakpoints.mjs'),{compileTextDraft}=await import('../src/studio/text.mjs');
 const draft={source:'fn count()->Number {let mut x=0;while x<3 {x=x+1;}return x;}',entry:'count',lowering:'auto'},editor=new ProjectEditor(),bundle=compileTextDraft(draft,editor),point=breakpointAtTextOffset(bundle,draft.source.indexOf('x+1')+1),events=[];
 const gate=new GraphStepper(pause=>{events.push(pause);gate.resume(pause.token,'continue');},{start:'continue',breakpoints:[point]});
 return await runTextDraft(draft,editor,{}, {onControlEnter:event=>gate.enter(event)})===3&&events.length===3&&events.every(event=>event.node===point.node&&event.function===point.function);
});
await check('Step Over/Out follows actual activation frames and original control output',async()=>{
 const {GraphStepper}=await import('../src/studio/debugger.mjs'),events=[],exits=[];
 const draft={source:'fn child(x:Number)->Number {return x*2;} fn test()->Number {let mut a=child(3);let b=a+1;return b;}',entry:'test',lowering:'auto'};
 const gate=new GraphStepper(pause=>{events.push(pause);gate.resume(pause.token,events.length===1?'over':'out');});
 const value=await runTextDraft(draft,new ProjectEditor(),{}, {onControlEnter:event=>gate.enter(event),onFrameExit:event=>{exits.push(event);gate.leave(event);}});
 return value===7&&events.length===2&&events[0].node==='/body/0'&&events[1].node==='/body/1'&&events[0].frames[0]===events[1].frames[0]&&exits.some(event=>event.frames.length===2);
});
await check('Studio debugger storage restores checked text points separately from graph policy',async()=>{
 const {StudioDebuggerStorage,studioDebuggerContext,resolveStudioDebugger}=await import('../src/studio/debugger-storage.mjs'),{captureSourceBreakpoint}=await import('../src/studio/source-anchors.mjs'),{breakpointAtTextOffset}=await import('../src/studio/breakpoints.mjs'),{compileTextDraft}=await import('../src/studio/text.mjs'),{ProjectEditor,newProject}=await import('../src/studio/project.mjs');
 const editor=new ProjectEditor(newProject('debugStoreVerify')),draft={source:'fn main()->Number {let mut x=0;return x+1;}',entry:'main',lowering:'auto'},bundle=compileTextDraft(draft,editor),anchor=captureSourceBreakpoint(bundle,breakpointAtTextOffset(bundle,draft.source.indexOf('return'))),values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},store=new StudioDebuggerStorage(storage,editor.project.id);store.save([{context:studioDebuggerContext(editor,draft),point:anchor.point,anchor}]);
 const restored=new StudioDebuggerStorage(storage,editor.project.id).load();assert.equal(resolveStudioDebugger(restored,studioDebuggerContext(editor,draft),{bundle,project:editor.project})[0].point.node,'/body/1');assert.equal(resolveStudioDebugger(restored,studioDebuggerContext(editor),{project:editor.project}).length,0);return true;
});
await check('Source anchor resolves a shifted typed operation and refuses changed syntax',async()=>{
 const {captureSourceBreakpoint,resolveSourceBreakpoint}=await import('../src/studio/source-anchors.mjs'),{breakpointAtTextOffset}=await import('../src/studio/breakpoints.mjs'),{compileTextDraft}=await import('../src/studio/text.mjs'),{ProjectEditor,newProject}=await import('../src/studio/project.mjs');
 const editor=new ProjectEditor(newProject('anchorVerify')),source='fn main()->Number {let mut x=0;return x+1;}',compile=source=>compileTextDraft({source,entry:'main',lowering:'auto'},editor),before=compile(source),anchor=captureSourceBreakpoint(before,breakpointAtTextOffset(before,source.indexOf('return'))),after=compile(source.replace('return','core.add(1,2);return'));
 assert.equal(resolveSourceBreakpoint(after,anchor).point.node,'/body/2');assert.equal(resolveSourceBreakpoint(compile(source.replace('x+1','x+2')),anchor).point,null);return true;
});
await check('UI source breakpoint pauses a private write and commits through the original host',async()=>{
 const {createUIWorkerHost}=await import('../src/ui/worker-host.mjs'),{parseUIWorkspace}=await import('../src/ui/project.mjs'),{compileUIHandler}=await import('../src/ui/source.mjs'),{breakpointAtTextOffset}=await import('../src/studio/breakpoints.mjs');
 const base=createCoreRegistry(),saved=parseUIWorkspace(await get('examples/ui-source-counter.ems-ui.json'),base),editor=new UIProjectEditor(saved.application,base,{sources:saved.sources});editor.applyHandler('change','fn update(delta:Number)->Number {state.count.write(state.count.read()+delta);return state.count.read();}','update');
 const witness=editor.sources.change,bundle=compileUIHandler(witness.source,witness.entry,editor.application,base),point=breakpointAtTextOffset(bundle,witness.source.indexOf('return')),replies=[];let ready;const paused=new Promise(resolve=>ready=resolve),host=createUIWorkerHost(reply=>{replies.push(reply);if(reply.type==='paused')ready(reply);});
 await host({action:'init',id:0,project:editor.source,policy:{capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']},maxQueue:64,recordTrace:false,debug:true,debugOptions:{start:'continue',breakpoints:[{handler:'change',point}],sources:{change:witness}}});
 const run=host({action:'dispatch',id:1,node:'increment',event:'press',value:undefined}),reply=await paused;assert.equal(replies[0].snapshot.count,0);assert.equal(reply.pause.node,'/body/1');await host({action:'resume',id:1,token:reply.pause.token,mode:'continue'});await run;return replies.at(-1).snapshot.count===1&&replies.at(-1).value===1;
});
console.log(`\nEMS foundation verification passed (${checks} checks). Not production readiness.`);
