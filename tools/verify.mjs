#!/usr/bin/env node
import {validateContractFlow} from '../src/contracts/flow.mjs';
import {compileContractFlowJS,executeContractFlow} from '../src/compiler/contract-flow.mjs';
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
await check('served release metadata matches the cached app build and root uses the typed entry router',async()=>{const {startStudioServer}=await import('./serve.mjs'),{BUILD_ID}=await import('../web/build-id.mjs'),{buildOfflineBundle}=await import('./build-offline-assets.mjs'),server=await startStudioServer({port:0});try{const metadata=await(await fetch(server.origin+'/api/release')).json(),entry=await(await fetch(server.origin)).text();return metadata.schemaVersion==='ems-release/1'&&metadata.assets===BUILD_ID&&entry.includes('/web/studio-entry.mjs')&&(await buildOfflineBundle()).version===await get('web/build-id.mjs');}finally{await server.close();}});
await check('one variable accepts repeated writes across ordinary for/fork contracts in runtime and standalone',async()=>{const base=createCoreRegistry(),project=await readJSON('examples/shared-variable-flow.ems-project.json'),inputs=project.inputs,bundle=lowerCheckedModule(typecheckModule(parseEMSModule(await get('examples/shared-variable-flow.ems')),base),'demo.SumSelected',base,{profile:'control'}),module=await import('data:text/javascript;base64,'+Buffer.from(compileContractFlowJS(project.graph,base)).toString('base64'));return project.graph.schemaVersion==='ems-contract-flow/3'&&await executeIR(bundle.ir,inputs,bundle.registry)===8&&await executeContractFlow(project.graph,base,inputs)===8&&module.execute({values:[3,4],skip:0,stop:99})===7;});
await check('ordinary rich flow cells and iteration markers accumulate typed arrays',async()=>{const base=createCoreRegistry(),graph=await readJSON('examples/flow-array-loop.graph.json'),module=await import('data:text/javascript;base64,'+Buffer.from(compileContractFlowJS(graph,base)).toString('base64'));return JSON.stringify(await executeContractFlow(graph,base,{limit:3}))==='[\"x\",\"x\",\"x\"]'&&JSON.stringify(module.execute({limit:0}))==='[]';});
await check('typed array operations are concrete atomic contracts across cold IR restoration',async()=>{const base=createCoreRegistry(),bundle=lowerCheckedModule(typecheckModule(parseEMSModule(await get('examples/typed-array-operations.ems')),base),'Main',base),fresh=createCoreRegistry(),ir=parseIR(serializeIR(bundle.ir,bundle.registry),fresh);return JSON.stringify(await executeIR(ir,{values:['old','remove','keep']},fresh))==='[\"first\",\"keep\",\"EMS\"]';});
await check('typed String arrays share runtime and independent compiler semantics',async()=>{const base=createCoreRegistry(),bundle=lowerCheckedModule(typecheckModule(parseEMSModule(await get('examples/typed-arrays.ems')),base),'Main',base),inputs={values:['EMS',' arrays']},module=await import('data:text/javascript;base64,'+Buffer.from(compileIRToJS(bundle.ir,bundle.registry)).toString('base64'));return await executeIR(bundle.ir,inputs,bundle.registry)==='EMS arrays'&&module.execute(inputs)==='EMS arrays';});
await check('saved Studio example executes through existing semantic IR',async()=>await new ProjectEditor(parseProject(await get('examples/studio-sum.ems.json'))).run()===5);
await check('saved nested Studio composite dependencies execute actual edited body',async()=>await new ProjectEditor(parseProject(await get('examples/studio-composite.ems.json'))).run()===12);
await stat(new URL('docs/spec/STUDIO_TEXT.md',root));await check('found docs/spec/STUDIO_TEXT.md',()=>true);
await check('Studio graph/text roundtrip preserves serialized program and result',async()=>{const editor=new ProjectEditor(parseProject(await get('examples/studio-sum.ems.json'))),text=textFromWorkspace(editor),converted=new ProjectEditor(projectFromText(text,editor,editor.workspace.inputs).project);return converted.serialize()===editor.serialize()&&await runTextDraft(text,editor,editor.workspace.inputs)===5;});
await check('Studio text bridge preserves eager unused-operation failures',async()=>{const editor=new ProjectEditor(),draft={source:'fn test()->Number {let unused=core.div(1,0);return 5;}',entry:'test',lowering:'auto'},converted=new ProjectEditor(projectFromText(draft,editor,{}).project);try{await converted.run();return false;}catch(error){return error.code==='DIV_BY_ZERO';}});
await stat(new URL('docs/spec/STANDARD_LIBRARY.md',root));await check('found docs/spec/STANDARD_LIBRARY.md',()=>true);
await check('value-less iteration markers are ordinary activation contracts, separate from the Boolean fork',async()=>{const registry=createCoreRegistry(),graph=JSON.parse(await get('examples/flow-counter.graph.json')),checked=validateContractFlow(graph,registry);return Object.keys(checked.interfaces.get('begin').inputs).length===0&&checked.interfaces.get('begin').output===null&&checked.interfaces.get('end').output===null&&checked.interfaces.get('fork').inputs.condition==='Boolean';});
await check('explicit feedback graph re-executes comparison in runtime and standalone through the shared IR',async()=>{const registry=createCoreRegistry(),graph=JSON.parse(await get('examples/flow-counter.graph.json')),module=await import('data:text/javascript;base64,'+Buffer.from(compileContractFlowJS(graph,registry)).toString('base64'));return await executeContractFlow(graph,registry,{limit:3})===3&&module.execute({limit:3})===3&&module.execute({limit:0})===0;});
await check('unfinished contract-flow candidates remain editable but execution rejects missing activation links',async()=>{const registry=createCoreRegistry(),graph=JSON.parse(await get('examples/flow-counter.graph.json'));graph.connections=graph.connections.filter(edge=>edge.from.port!=='no');validateContractFlow(graph,registry,{complete:false});try{compileContractFlowJS(graph,registry);return false;}catch(error){return error.code==='UNCONNECTED_FLOW_OUTPUT';}});
await check('all standard library public interfaces validate independently',()=>STANDARD_INTERFACES.length===37&&STANDARD_INTERFACES.every(spec=>validateContractInterface(spec)));
await check('standard library text and persisted graph example execute shared semantics',async()=>{const text={source:await get('examples/stdlib-report.ems'),entry:'analyze',lowering:'auto'};return await runTextDraft(text,new ProjectEditor(),{values:[3,-1,4]})==='sum=6'&&await new ProjectEditor(parseProject(await get('examples/studio-library.ems.json'))).run()==='sum=6';});
await stat(new URL('docs/spec/COLLECTION_TEMPLATES.md',root));await check('found docs/spec/COLLECTION_TEMPLATES.md',()=>true);
await check('typed collection templates execute through shared control IR',async()=>{const source=await get('examples/collection-pipeline.ems'),draft={source,entry:'analyze',lowering:'auto'};return JSON.stringify(await runTextDraft(draft,new ProjectEditor(),{values:[-3,0,2]}))==='[9,4]';});
await check('catalog distinguishes installed contracts and typed collection templates',()=>standardCatalog().schemaVersion==='ems-stdlib-catalog/4'&&standardCatalog().genericContracts.length===20&&standardCatalog().contracts.length===37&&standardCatalog().templates.length===2);
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
await check('Explicit control inspection copies real typed values and defaults to payload-free diagnostics',async()=>{
 const registry=createCoreRegistry(),source='fn main()->Number {let mut x=0;x=x+1;return x;}',bundle=lowerCheckedModule(typecheckModule(parseEMSModule(source),registry),'main',registry,{profile:'control'}),plain=[],events=[];
 assert.equal(await executeIR(bundle.ir,{},bundle.registry,{onControlEnter:event=>plain.push(event)}),1);assert.ok(plain.every(event=>!Object.hasOwn(event,'inspection')));
 assert.equal(await executeIR(bundle.ir,{},bundle.registry,{inspection:{allow:[{function:'main',names:['x']}]},onControlEnter:event=>events.push(event)}),1);assert.equal(events.find(event=>event.kind==='return').inspection.variables[0].value,1);return true;
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
await check('Source-owned inspection transport validates real typed values and rejects forged payload types',async()=>{
 const {prepareStudioInspection,validateInspectionPause}=await import('../src/studio/inspection-transport.mjs'),{ProjectEditor}=await import('../src/studio/project.mjs'),{runTextDraft}=await import('../src/studio/text.mjs');
 const editor=new ProjectEditor(),draft={source:'fn main()->Number {let mut x=0;x=x+1;return x;}',entry:'main',lowering:'auto'},prepared=prepareStudioInspection({action:'text',debug:true,project:editor.serialize(),draft,inspection:{schemaVersion:'ems-source-inspection/1',...draft,policy:{allow:[{function:'main',names:['x']}]}}}),events=[];
 assert.equal(await runTextDraft(draft,editor,{}, {inspection:prepared.policy,onControlEnter:e=>events.push(e)}),1);const pause={...events.find(e=>e.kind==='return'),token:1};assert.equal(validateInspectionPause(pause,prepared).inspection.variables[0].value,1);
 assert.throws(()=>validateInspectionPause({...pause,inspection:{...pause.inspection,variables:[{name:'x',type:'String',status:'value',value:'invalid'}]}},prepared),{code:'INVALID_INSPECTION_SNAPSHOT'});return true;
});
await check('Declaration-address grants isolate sibling bindings even for aliased in-memory IR nodes',async()=>{
 const {controlInspectionDeclarations}=await import('../src/runtime/inspection.mjs');
 const registry=createCoreRegistry(),source='fn main(secret:String)->Number {if true {let x=secret;return 1;}else{let x=secret;return 2;}}',bundle=lowerCheckedModule(typecheckModule(parseEMSModule(source),registry),'main',registry,{profile:'control'}),fn=bundle.ir.functions.find(fn=>fn.id==='main');fn.body[0].otherwise[0]=fn.body[0].then[0];const declaration=controlInspectionDeclarations(fn).find(d=>d.name==='x'&&d.declaration.includes('/otherwise/')).declaration,events=[];
 assert.equal(await executeIR(bundle.ir,{secret:'PRIVATE_VERIFY_SENTINEL'},bundle.registry,{inspection:{allow:[{function:'main',declarations:[declaration]}]},onControlEnter:e=>events.push(e)}),1);assert.ok(events.every(e=>e.inspection.schemaVersion==='ems-inspection/2'&&e.inspection.variables[0].status==='not-in-scope'));assert.ok(!JSON.stringify(events).includes('PRIVATE_VERIFY_SENTINEL'));return true;
});
await check('Explicit graph inspection observes actual memoized outputs without changing call-IR evaluation',async()=>{
 const registry=createCoreRegistry(),graph={schemaVersion:'0.1',id:'verify.Graph',version:'1.0.0',inputs:{x:{type:'Number'}},output:{type:'Number'},nodes:[{id:'sum',uses:'core.add',args:{a:{input:'x'},b:{literal:2}}},{id:'square',uses:'core.mul',args:{a:{node:'sum'},b:{node:'sum'}}}],returns:{node:'square'}},events=[];
 assert.equal(await executeIR(lowerGraphToIR(graph,registry),{x:3},registry,{graphInspection:{allow:[{function:graph.id,declarations:['/graph/nodes/sum']}]},onNodeEnter:e=>events.push(e)}),25);assert.equal(events.length,2);assert.equal(events[0].inspection.variables[0].status,'not-evaluated');assert.equal(events[1].inspection.variables[0].value,5);return true;
});
await check('Checked graph witness transports typed memo values and refuses changed program identity',async()=>{
 const {ProjectEditor}=await import('../src/studio/project.mjs'),{graphInspectionWitness,prepareStudioInspection,validateInspectionPause}=await import('../src/studio/inspection-transport.mjs'),editor=new ProjectEditor();editor.addInput('x','Number');editor.setInput('x',3);const a=editor.addNode('core.add');editor.connect({input:'x'},a,'a');editor.literal(a,'b',2);const b=editor.addNode('core.mul');editor.connect({node:a},b,'a');editor.connect({node:a},b,'b');editor.connect({node:b},'output','return');const request={action:'graph',debug:true,project:editor.serialize(),inspection:graphInspectionWitness(editor,{allow:[{function:editor.workspace.graph.id,declarations:['/graph/nodes/'+a]}]})},prepared=prepareStudioInspection(request),events=[];
 assert.equal(await editor.run({graphInspection:prepared.policy,onNodeEnter:e=>events.push(e)}),25);assert.equal(validateInspectionPause({...events[1],location:null,token:1},prepared).inspection.variables[0].value,5);editor.literal(a,'b',9);assert.throws(()=>prepareStudioInspection({...request,project:editor.serialize()}),{code:'STALE_INSPECTION_SOURCE'});return true;
});
await check('Post-operation graph pauses require v2 permission and carry the actual completed output',async()=>{
 const {ProjectEditor}=await import('../src/studio/project.mjs'),{graphInspectionWitness,prepareStudioInspection,validateInspectionPause}=await import('../src/studio/inspection-transport.mjs'),editor=new ProjectEditor();editor.addInput('x','Number');editor.setInput('x',3);const a=editor.addNode('core.add');editor.connect({input:'x'},a,'a');editor.literal(a,'b',2);editor.connect({node:a},'output','return');const policy={allow:[{function:editor.workspace.graph.id,declarations:['/graph/nodes/'+a]}]},request={action:'graph',debug:true,project:editor.serialize(),inspection:graphInspectionWitness(editor,policy,{afterOperations:true})},prepared=prepareStudioInspection(request),events=[];
 assert.equal(await editor.run({graphInspection:prepared.policy,onNodeEnter:e=>events.push(e),onNodeExit:e=>events.push(e)}),5);assert.deepEqual(events.map(e=>e.phase),['enter','exit']);assert.equal(validateInspectionPause({...events[1],location:null,token:2},prepared).inspection.variables[0].value,5);const old=prepareStudioInspection({...request,inspection:graphInspectionWitness(editor,policy)});assert.throws(()=>validateInspectionPause({...events[1],location:null,token:2},old),{code:'INVALID_INSPECTION_SNAPSHOT'});return true;
});
await check('Visual collection inspection projects real checked control cells without changing execution',async()=>{
 const {ProjectEditor}=await import('../src/studio/project.mjs'),{graphInspectionWitness,prepareStudioInspection,validateInspectionPause}=await import('../src/studio/inspection-transport.mjs'),editor=new ProjectEditor();editor.createCollection('user.Abs','map','std.number.abs');editor.addInput('values','NumberArray',[-2,0,3]);const node=editor.addNode('user.Abs');editor.connect({input:'values'},node,'values');editor.connect({node},'output','return');const request={action:'graph',debug:true,project:editor.serialize(),inspection:graphInspectionWitness(editor,{allow:[]})},empty=prepareStudioInspection(request),binding=empty.presentation.get(empty.bundle.ir.entry).bindings.find(b=>b.kind==='node'),policy={allow:[{function:empty.bundle.ir.entry,declarations:[binding.declaration]}]},prepared=prepareStudioInspection({...request,inspection:graphInspectionWitness(editor,policy)}),events=[];
 assert.deepEqual(await editor.run({inspection:prepared.policy,onControlEnter:e=>events.push(e)}),[2,0,3]);const event=events.findLast(e=>e.function===prepared.bundle.ir.entry&&e.kind==='return');assert.deepEqual(validateInspectionPause({...event,location:null,token:1},prepared).inspection.variables[0].value,[2,0,3]);return true;
});
await check('Control post-operation pauses carry initialized values under an explicit v2 witness',async()=>{
 const {ProjectEditor}=await import('../src/studio/project.mjs'),{prepareStudioInspection,validateInspectionPause}=await import('../src/studio/inspection-transport.mjs'),{runTextDraft}=await import('../src/studio/text.mjs'),editor=new ProjectEditor(),draft={source:'fn main()->Number {let mut n=7;return n;}',entry:'main',lowering:'auto'},request={action:'text',debug:true,project:editor.serialize(),draft,inspection:{schemaVersion:'ems-source-inspection/2',...draft,afterOperations:true,policy:{allow:[{function:'main',declarations:['/body/0']}]}}},prepared=prepareStudioInspection(request),events=[];
 assert.equal(await runTextDraft(draft,editor,{}, {inspection:prepared.policy,onControlExit:e=>events.push(e)}),7);const pause={...events.find(e=>e.kind==='let'),token:1};assert.equal(validateInspectionPause(pause,prepared).inspection.variables[0].value,7);assert.equal(prepared.witness.afterOperations,true);return true;
});
await check('UI post-operation pause remains precommit and carries no speculative state',async()=>{
 const {readFile}=await import('node:fs/promises'),{UIProjectEditor}=await import('../src/studio/ui-project.mjs'),{parseUIWorkspace}=await import('../src/ui/project.mjs'),{createUIWorkerHost}=await import('../src/ui/worker-host.mjs'),base=createCoreRegistry(),saved=parseUIWorkspace(await readFile(new URL('../examples/ui-source-counter.ems-ui.json',import.meta.url),'utf8'),base),editor=new UIProjectEditor(saved.application,base,{sources:saved.sources});editor.applyHandler('change','fn update(delta:Number)->Number {state.count.write(state.count.read()+delta);return state.count.read();}','update');const replies=[],host=createUIWorkerHost(v=>replies.push(v)),policy={capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']};await host({action:'init',id:0,project:editor.source,policy,maxQueue:64,recordTrace:false,debug:true,debugOptions:{start:'step',breakpoints:[],sources:{},afterOperations:true}});const run=host({action:'dispatch',id:1,node:'increment',event:'press',value:undefined});await new Promise(r=>setImmediate(r));await host({action:'resume',id:1,token:replies.at(-1).pause.token,mode:'over'});await new Promise(r=>setImmediate(r));const pause=replies.at(-1).pause;assert.equal(pause.phase,'exit');assert.equal(pause.kind,'expression');assert.equal(replies[0].snapshot.count,0);assert.equal(Object.hasOwn(pause,'snapshot'),false);await host({action:'resume',id:1,token:pause.token,mode:'continue'});await run;assert.equal(replies.at(-1).snapshot.count,1);return true;
});
await check('Entry resource effects protect primitive parameters of otherwise pure nested helpers',async()=>{
 const {ProjectEditor}=await import('../src/studio/project.mjs'),{prepareStudioInspection,validateInspectionPause}=await import('../src/studio/inspection-transport.mjs'),{runTextDraft}=await import('../src/studio/text.mjs'),editor=new ProjectEditor(),draft={source:'fn helper(n:Number)->Number {return n;}fn main()->Number {using h=resource.cell(7);return helper(resource.read(h));}',entry:'main',lowering:'auto'},request={action:'text',debug:true,project:editor.serialize(),draft,inspection:{schemaVersion:'ems-source-inspection/2',...draft,afterOperations:true,policy:{allow:[{function:'helper',declarations:['/inputs/0']}]}}},prepared=prepareStudioInspection(request),events=[];
 assert.equal(await runTextDraft(draft,editor,{}, {inspection:prepared.policy,onControlExit:e=>events.push(e)}),7);const pause={...events.find(e=>e.function==='helper'),token:1};assert.equal(validateInspectionPause(pause,prepared).inspection.variables[0].status,'protected-effects');const bad=structuredClone(pause);bad.inspection.variables[0]={name:'n',declaration:'/inputs/0',type:'Number',status:'value',value:7};assert.throws(()=>validateInspectionPause(bad,prepared),{code:'INVALID_INSPECTION_SNAPSHOT'});return true;
});
await check('Static origin analysis follows control/call/alias dependencies without evaluating code or exposing literal payloads',async()=>{
 const {analyzeControlOrigins}=await import('../src/ir/index.mjs'),{parseEMSModule}=await import('../src/frontend/index.mjs'),{typecheckModule}=await import('../src/frontend/check.mjs'),{lowerCheckedModule}=await import('../src/frontend/lower.mjs');
 const base=createCoreRegistry(),b=lowerCheckedModule(typecheckModule(parseEMSModule('fn helper(n:Number)->Number {return n;}fn main(secret:Number)->Number {let text="ORIGIN_PRIVATE_LITERAL";using h=resource.cell(0);let alias=h;resource.write(alias,secret);return helper(resource.read(h));}'),base),'main',base,{profile:'control'}),a=analyzeControlOrigins(b.ir,b.registry),output=a.nodes.find(n=>n.function==='main'&&n.path==='/return');
 assert.equal(a.securityDecision,false);assert.ok(output.origins.some(o=>o.kind==='input'&&o.function==='main'));assert.ok(output.origins.some(o=>o.reason==='shared-state'));assert.ok(!JSON.stringify(a).includes('ORIGIN_PRIVATE_LITERAL'));assert.throws(()=>analyzeControlOrigins(b.ir,b.registry,{maxSteps:1}),{code:'ANALYSIS_LIMIT'});return true;
});
await check('Origin annotations restrict typed inspection without overriding grants, entry effects or client validation',async()=>{
 const {classifyControlOrigins,executeIR}=await import('../src/ir/index.mjs'),{parseEMSModule}=await import('../src/frontend/index.mjs'),{typecheckModule}=await import('../src/frontend/check.mjs'),{lowerCheckedModule}=await import('../src/frontend/lower.mjs'),base=createCoreRegistry(),bundle=lowerCheckedModule(typecheckModule(parseEMSModule('fn main(open:Number,secret:String)->Number {let mut shown=open;let hidden=secret;return shown;}'),base),'main',base,{profile:'control'}),originPolicy={schemaVersion:'ems-origin-policy/1',sources:[{kind:'input',function:'main',path:'/inputs/0',classification:'public'},{kind:'input',function:'main',path:'/inputs/1',classification:'private'}]},events=[];
 const a=classifyControlOrigins(bundle.ir,bundle.registry,originPolicy);assert.equal(a.nodes.find(n=>n.path==='/body/0').classification,'public');assert.equal(await executeIR(bundle.ir,{open:13,secret:'VERIFY_ORIGIN_PRIVATE'},bundle.registry,{inspection:{allow:[{function:'main',names:['shown','hidden']}],originPolicy},onControlExit:e=>events.push(e)}),13);assert.equal(events.find(e=>e.kind==='return').inspection.variables[0].value,13);assert.ok(events.every(e=>e.inspection.variables[1].status==='protected-origins'));assert.ok(!JSON.stringify(events).includes('VERIFY_ORIGIN_PRIVATE'));return true;
});
await check('Persisted origin annotations pin semantic bytes and reject changed literals before inspection callbacks',async()=>{
 const {createBoundOriginPolicy,executeIR}=await import('../src/ir/index.mjs'),{parseEMSModule}=await import('../src/frontend/index.mjs'),{typecheckModule}=await import('../src/frontend/check.mjs'),{lowerCheckedModule}=await import('../src/frontend/lower.mjs'),base=createCoreRegistry(),lower=source=>lowerCheckedModule(typecheckModule(parseEMSModule(source),base),'main',base,{profile:'control'}),b=lower('fn main()->Number {let mut value=7;return value;}'),policy=await createBoundOriginPolicy(b.ir,b.registry,{schemaVersion:'ems-origin-policy/1',sources:[{kind:'literal',function:'main',path:'/body/0/value',classification:'public'}]}),events=[];
 assert.equal(await executeIR(b.ir,{},b.registry,{inspection:{allow:[{function:'main',names:['value']}],originPolicy:policy},onControlExit:e=>events.push(e)}),7);assert.equal(events.find(e=>e.kind==='return').inspection.variables[0].value,7);const changed=lower('fn main()->Number {let mut value=9;return value;}'),bad=[];await assert.rejects(executeIR(changed.ir,{},changed.registry,{inspection:{allow:[{function:'main',names:['value']}],originPolicy:policy},onControlExit:e=>bad.push(e)}),{code:'STALE_ORIGIN_POLICY'});assert.equal(bad.length,0);return true;
});
await check('Project root-label storage keeps bound metadata apart from grants and refuses changed semantic code',async()=>{
 const {StudioOriginStorage}=await import('../src/studio/origin-storage.mjs'),{createBoundOriginPolicy}=await import('../src/semantics/origin-policy.mjs'),{parseEMSModule}=await import('../src/frontend/index.mjs'),{typecheckModule}=await import('../src/frontend/check.mjs'),{lowerCheckedModule}=await import('../src/frontend/lower.mjs'),r=createCoreRegistry(),lower=s=>lowerCheckedModule(typecheckModule(parseEMSModule(s),r),'main',r,{profile:'control'}),b=lower('fn main()->Number {let mut x=7;return x;}'),p=await createBoundOriginPolicy(b.ir,b.registry,{schemaVersion:'ems-origin-policy/1',sources:[{kind:'literal',function:'main',path:'/body/0/value',classification:'public'}]}),map=new Map(),store=new StudioOriginStorage({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},'verify');store.save(p);assert.deepEqual(await store.checked(b.ir,b.registry),p);assert.ok(!map.get(store.key).includes('allow'));const changed=lower('fn main()->Number {let mut x=9;return x;}');await assert.rejects(store.checked(changed.ir,changed.registry),{code:'STALE_ORIGIN_POLICY'});return true;
});
await check('Visual source annotations project onto the existing control IR and cannot label derived node outputs',async()=>{
 const {ProjectEditor}=await import('../src/studio/project.mjs'),{lowerVisualOrigins,visualOriginAnnotations}=await import('../src/studio/visual-origins.mjs'),{createBoundOriginPolicy}=await import('../src/semantics/origin-policy.mjs'),e=new ProjectEditor();e.addInput('x','Number',3);const n=e.addNode('core.add');e.connect({input:'x'},n,'a');e.literal(n,'b',2);e.connect({node:n},'output','return');const b=lowerVisualOrigins(e.workspace.graph,e.registry),p=await createBoundOriginPolicy(b.ir,b.registry,visualOriginAnnotations(b,[{graph:e.workspace.graph.id,path:'/graph/inputs/x',classification:'public'}]));assert.equal(await e.run({inspection:{allow:[],originPolicy:p},onControlExit:()=>{}}),5);assert.throws(()=>visualOriginAnnotations(b,[{graph:e.workspace.graph.id,path:'/graph/nodes/'+n,classification:'public'}]),{code:'INVALID_VISUAL_ORIGIN'});return true;
});
await check('Certified intrinsic labels preserve private arguments and opaque mutable alias data is never captured',async()=>{
 const {classifyControlOrigins,executeIR}=await import('../src/ir/index.mjs'),{parseEMSModule}=await import('../src/frontend/index.mjs'),{typecheckModule}=await import('../src/frontend/check.mjs'),{lowerCheckedModule}=await import('../src/frontend/lower.mjs'),r=createCoreRegistry(),lower=(source,registry=r)=>lowerCheckedModule(typecheckModule(parseEMSModule(source),registry),'main',registry,{profile:'control'}),b=lower('fn main(a:Number,b:Number)->Number {let mut result=core.add(a,b);return result;}'),p={schemaVersion:'ems-origin-policy/1',sources:[{kind:'input',function:'main',path:'/inputs/0',classification:'public'},{kind:'input',function:'main',path:'/inputs/1',classification:'public'}]};assert.equal(classifyControlOrigins(b.ir,b.registry,p).nodes.find(n=>n.path==='/body/0').classification,'public');const opaque=createCoreRegistry().registerAtomic({id:'host.mutate',inputs:{values:'NumberArray'},output:'Number',execute:({values})=>{values[0]=987654321;return 0;}}),m=lower('fn main(values:Number[])->Number {let mut result=host.mutate(values);return result;}',opaque),events=[];await executeIR(m.ir,{values:[1]},m.registry,{inspection:{allow:[{function:'main',names:['values']}],originPolicy:{schemaVersion:'ems-origin-policy/1',sources:[{kind:'input',function:'main',path:'/inputs/0',classification:'public'}]}},onControlExit:e=>events.push(e)});assert.ok(!JSON.stringify(events).includes('987654321'));return true;
});
await check('Structured control module seals and reimports as an atomic executable without source graph',async()=>{
 const {buildAtomicPackage,registerTrustedAtomicPackage}=await import('../src/compiler/atomic-package.mjs'),{parseEMSModule}=await import('../src/frontend/index.mjs'),{typecheckModule}=await import('../src/frontend/check.mjs'),{lowerCheckedModule}=await import('../src/frontend/lower.mjs'),r=createCoreRegistry(),b=lowerCheckedModule(typecheckModule(parseEMSModule('fn main(values:Number[])->Number {let mut sum=0;for v in values {sum=sum+v;}return sum;}'),r),'main',r,{profile:'control'}),p=await buildAtomicPackage(b.ir,b.registry,{id:'sealed.Sum'}),consumer=createCoreRegistry();assert.equal(p.manifest.contract.kind,'atomic');assert.ok(!Object.hasOwn(p.manifest,'graph'));await registerTrustedAtomicPackage(consumer,p.manifest,p.files['module.mjs']);assert.equal(await consumer.resolve('sealed.Sum').execute({values:[2,3]}),5);assert.equal(consumer.resolve('sealed.Sum').graph,undefined);return true;
});
await check('Sealed typed error ABI is bound to module bytes and survives interpreted/compiled caller catches',async()=>{
 const {buildAtomicPackage,registerTrustedAtomicPackage}=await import('../src/compiler/atomic-package.mjs'),{parseEMSModule}=await import('../src/frontend/index.mjs'),{typecheckModule}=await import('../src/frontend/check.mjs'),{lowerCheckedModule}=await import('../src/frontend/lower.mjs'),{executeIR,compileIRToJS}=await import('../src/ir/index.mjs'),base=createCoreRegistry(),lower=(source,r=base)=>lowerCheckedModule(typecheckModule(parseEMSModule(source),r),'main',r,{profile:'control'}),b=lower('fn main(n:Number)->Number {if n<0 {throw "negative";}return n;}'),p=await buildAtomicPackage(b.ir,b.registry,{id:'sealed.Checked'}),r=createCoreRegistry();assert.deepEqual(p.manifest.errors.types,['String']);await registerTrustedAtomicPackage(r,p.manifest,p.files['module.mjs']);const c=lower('fn main()->Number {try {return sealed.Checked(-1);}catch(error:String){return 42;}}',r),m=await import('data:text/javascript,'+encodeURIComponent(compileIRToJS(c.ir,c.registry)));assert.equal(await executeIR(c.ir,{},c.registry),42);assert.equal(m.execute({}),42);await assert.rejects(registerTrustedAtomicPackage(createCoreRegistry(),{...p.manifest,errors:{model:'ems-user-throw/1',types:[]}},p.files['module.mjs']),{code:'PACKAGE_INTERFACE_MISMATCH'});return true;
});
await check('Sealed execution limits are module-bound and cannot be raised by a compiled consumer',async()=>{
 const {buildAtomicPackage,registerTrustedAtomicPackage}=await import('../src/compiler/atomic-package.mjs'),{parseEMSModule}=await import('../src/frontend/index.mjs'),{typecheckModule}=await import('../src/frontend/check.mjs'),{lowerCheckedModule}=await import('../src/frontend/lower.mjs'),{compileIRToJS}=await import('../src/ir/index.mjs'),base=createCoreRegistry(),lower=(source,r=base)=>lowerCheckedModule(typecheckModule(parseEMSModule(source),r),'main',r,{profile:'control'}),b=lower('fn main(n:Number)->Number {let mut x=0;while x<n {x=x+1;}return x;}'),p=await buildAtomicPackage(b.ir,b.registry,{id:'sealed.Budget',maxSteps:40}),r=createCoreRegistry();await registerTrustedAtomicPackage(r,p.manifest,p.files['module.mjs']);assert.equal(r.resolve('sealed.Budget').execute({n:1}),1);assert.throws(()=>r.resolve('sealed.Budget').execute({n:100},{maxSteps:1000000}),{code:'STEP_LIMIT'});const c=lower('fn main(n:Number)->Number {return sealed.Budget(n);}',r),m=await import('data:text/javascript,'+encodeURIComponent(compileIRToJS(c.ir,c.registry)));assert.throws(()=>m.execute({n:100}),{code:'STEP_LIMIT'});return true;
});
await check('Shared work cannot be reset by nested sealed calls or a generous ancestor ledger',async()=>{
 const {buildAtomicPackage,registerTrustedAtomicPackage}=await import('../src/compiler/atomic-package.mjs'),{createWorkBudget}=await import('../src/semantics/work-budget.mjs'),{parseEMSModule}=await import('../src/frontend/index.mjs'),{typecheckModule}=await import('../src/frontend/check.mjs'),{lowerCheckedModule}=await import('../src/frontend/lower.mjs'),{executeIR,compileIRToJS}=await import('../src/ir/index.mjs'),base=createCoreRegistry(),lower=(source,r=base)=>lowerCheckedModule(typecheckModule(parseEMSModule(source),r),'main',r,{profile:'control'}),leaf=lower('fn main(n:Number)->Number {return n+1;}'),p=await buildAtomicPackage(leaf.ir,leaf.registry,{id:'sealed.Add'}),r=createCoreRegistry();await registerTrustedAtomicPackage(r,p.manifest,p.files['module.mjs']);const c=lower('fn main(n:Number)->Number {let a=sealed.Add(n);return sealed.Add(a);}',r),m=await import('data:text/javascript,'+encodeURIComponent(compileIRToJS(c.ir,c.registry)));assert.equal(await executeIR(c.ir,{n:1},c.registry),3);assert.throws(()=>m.execute({n:1},{maxSteps:10}),{code:'STEP_LIMIT'});await assert.rejects(executeIR(c.ir,{n:1},c.registry,{maxSteps:10}),{code:'STEP_LIMIT'});const linked=await buildAtomicPackage(c.ir,c.registry,{id:'sealed.Consumer',maxSteps:10}),atom=await import('data:text/javascript,'+encodeURIComponent(linked.files['module.mjs']));assert.throws(()=>atom.execute({n:1},{workBudget:createWorkBudget(1000000)}),{code:'STEP_LIMIT'});return true;
});
await check('Tagged public package values use checked Option/Result signatures and standalone consumers',async()=>{
 const {buildAtomicPackage,registerTrustedAtomicPackage}=await import('../src/compiler/atomic-package.mjs'),{parseEMSModule}=await import('../src/frontend/index.mjs'),{typecheckModule}=await import('../src/frontend/check.mjs'),{lowerCheckedModule}=await import('../src/frontend/lower.mjs'),{executeIR,compileIRToJS}=await import('../src/ir/index.mjs'),base=createCoreRegistry(),lower=(source,r=base)=>lowerCheckedModule(typecheckModule(parseEMSModule(source),r),'main',r,{profile:'control'}),b=lower('fn main(value:Option<Number>)->Result<Number,String> {match value {Some(n)=>{return Ok(n*2);},None=>{return Err("missing");}}}'),p=await buildAtomicPackage(b.ir,b.registry,{id:'sealed.Tagged'}),r=createCoreRegistry();await registerTrustedAtomicPackage(r,p.manifest,p.files['module.mjs']);assert.equal(p.manifest.valueABI,'ems-tagged-values/1');const c=lower('fn main(value:Option<Number>)->Number {match sealed.Tagged(value) {Ok(n)=>{return n;},Err(message)=>{return -1;}}}',r),m=await import('data:text/javascript,'+encodeURIComponent(compileIRToJS(c.ir,c.registry)));assert.equal(await executeIR(c.ir,{value:{tag:'Some',value:3}},c.registry),6);assert.equal(m.execute({value:{tag:'None'}}),-1);return true;
});
await check('Owned flow composites retain editable definitions, isolated IR calls and standalone parity',async()=>{
 const {parseFlowProject,FlowProjectEditor}=await import('../src/studio/flow-project.mjs'),{compileContractFlow}=await import('../src/compiler/contract-flow.mjs'),registry=createCoreRegistry(),project=parseFlowProject(await get('examples/composite-flow.ems-project.json'),registry),editor=new FlowProjectEditor(project,registry);assert.equal(project.contracts.length,2);assert.equal(compileContractFlow(project.graph,registry,{contracts:editor.contracts}).ir.functions.length,3);assert.equal(await executeContractFlow(project.graph,registry,{}, {contracts:editor.contracts}),21);editor.openContract('math.Wrap');editor.literal(editor.workspace.graph.nodes.find(n=>n.uses==='math.Step').id,'a',3);const module=await import('data:text/javascript;base64,'+Buffer.from(compileContractFlowJS(editor.project.graph,registry,{contracts:editor.contracts})).toString('base64'));assert.equal(module.execute({}),25);return true;
});
await check('Recursive flow modules preserve self calls, bounded depth and standalone results',async()=>{const {parseFlowProject,flowProjectOptions}=await import('../src/studio/flow-project.mjs'),registry=createCoreRegistry(),project=parseFlowProject(await get('examples/recursive-flow.ems-project.json')),options=flowProjectOptions(project),module=await import('data:text/javascript;base64,'+Buffer.from(compileContractFlowJS(project.graph,registry,options)).toString('base64'));assert.equal(await executeContractFlow(project.graph,registry,{n:5},options),120);assert.equal(module.execute({n:5}),120);assert.throws(()=>module.execute({n:5},{maxDepth:2}),{code:'CALL_DEPTH'});return true;});
await check('Typed dictionaries share source, ordinary flow, cold IR, standalone and explicit sealed value ABI',async()=>{
 const {parseEMSModule}=await import('../src/frontend/index.mjs'),{typecheckModule}=await import('../src/frontend/check.mjs'),{lowerCheckedModule}=await import('../src/frontend/lower.mjs'),{sourceContractFlow}=await import('../src/studio/source-flow.mjs'),{parseFlowProject}=await import('../src/studio/flow-project.mjs'),{buildAtomicPackage}=await import('../src/compiler/atomic-package.mjs'),registry=createCoreRegistry(),bundle=lowerCheckedModule(typecheckModule(parseEMSModule(await get('examples/dictionaries.ems')),registry),'app.WordCounts',registry),inputs={words:['a','b','a','__proto__']},expected={tag:'Map',value:[['a',2],['b',1],['__proto__',1]]},project=parseFlowProject(sourceContractFlow(bundle.ir,bundle.registry)),module=await import('data:text/javascript;base64,'+Buffer.from(compileContractFlowJS(project.graph,bundle.registry)).toString('base64'));assert.deepEqual(await executeContractFlow(project.graph,bundle.registry,inputs),expected);assert.deepEqual(module.execute(inputs),expected);const sealed=await buildAtomicPackage(bundle.ir,bundle.registry,{id:'sealed.Words'});assert.equal(sealed.manifest.valueABI,'ems-tagged-values/2');return true;
});
await check('Versioned rich UI state preserves dictionaries across transactional events and independent output',async()=>{
 const {UIProjectEditor}=await import('../src/studio/ui-project.mjs'),{UIRuntime}=await import('../src/ui/model.mjs'),{compileUIJS}=await import('../src/compiler/ui.mjs'),base=createCoreRegistry(),editor=new UIProjectEditor(JSON.parse(await get('examples/ui-counter.json')),base),policy={capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']};editor.addState('bag','Map<String,Number>',{tag:'Map',value:[]});editor.applyHandler('change','@demo::Counter(delta:Number)->Number{let next=std.map.getOr(state.bag.read(),"count",0)+delta;state.bag.write(std.map.set(state.bag.read(),"count",next));return state.count.write(next);}','demo.Counter');editor.property('title','text',{state:'bag',format:'json'});assert.equal(JSON.parse(editor.source).schemaVersion,'ems-ui-project/4');const module=await import('data:text/javascript;base64,'+Buffer.from(compileUIJS(editor.application,base)).toString('base64'));for(const runtime of [new UIRuntime(editor.application,base,{policy}),module.createRuntime({policy})])try{assert.equal(await runtime.dispatch('increment','press'),1);assert.equal(await runtime.dispatch('increment','press'),2);assert.deepEqual(runtime.snapshot().bag,{tag:'Map',value:[['count',2]]});}finally{await runtime.close();}return true;
});
await check('Native contract instances retain identity, invariant rollback and independent execution',async()=>{
 const {compileInstanceModule}=await import('../src/instances/frontend.mjs'),{createInstanceSession}=await import('../src/instances/runtime.mjs'),{compileInstanceModuleJS}=await import('../src/instances/compiler.mjs'),{parseInstanceModule,serializeInstanceModule}=await import('../src/instances/module.mjs'),registry=createCoreRegistry(),module=compileInstanceModule(await get('examples/contract-instances.ems'),registry),saved=parseInstanceModule(await get('examples/contract-instances.module.json'),registry);assert.equal(serializeInstanceModule(module,registry),serializeInstanceModule(saved,registry));const output=await import('data:text/javascript;base64,'+Buffer.from(compileInstanceModuleJS(module,registry)).toString('base64')),policy={capabilities:['state.read','state.write'],allowedEffects:['state.read','state.write']};for(const create of [options=>createInstanceSession(module,registry,options),output.createSession]){const owner=await create({policy});try{assert.equal(await owner.dispatch('left','Change',{delta:-1}),0);await assert.rejects(owner.dispatch('left','Change',{delta:-1}),{code:'INVARIANT_VIOLATION'});assert.deepEqual(owner.snapshot(),{left:{value:0},right:{value:5}});}finally{await owner.close();}}return true;
});
await check('Native module documents save ordinary transition graphs without losing instance boundaries or workspace siblings',async()=>{
 const {newInstanceProject,serializeInstanceProject,parseInstanceProject}=await import('../src/studio/instance-project.mjs'),{InstanceFlowSession}=await import('../src/studio/instance-flow-session.mjs'),{ProjectManager,workspaceSource,ProjectFileManager}=await import('../src/studio/manager.mjs'),{FlowProjectEditor}=await import('../src/studio/flow-project.mjs'),{createInstanceSession}=await import('../src/instances/runtime.mjs'),data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)},record={id:'native',name:'Counter',kind:'contract',draft:null,source:serializeInstanceProject(newInstanceProject(await get('examples/contract-instances.ems')))},manager=new ProjectManager(storage);manager.save({id:'files',name:'Files',kind:'workspace',draft:null,source:workspaceSource([{path:'main.contract.json',record}])});const session=new InstanceFlowSession(storage,'?project=files&file=native&instance=right&transition=Change'),editor=new FlowProjectEditor(session.project,session.registry,session.options);editor.openContract(session.activeContract);editor.literal(editor.workspace.graph.nodes.find(node=>node.uses==='core.add').id,'b',2);session.saveDraft(editor.serialize());session.apply(editor.serialize());const project=parseInstanceProject(new ProjectFileManager(storage,'files','native').load().source),runtime=await createInstanceSession(project.module,undefined,{policy:{capabilities:['state.read','state.write'],allowedEffects:['state.read','state.write']}});try{assert.equal(await runtime.dispatch('right','Change',{delta:100}),7);assert.equal(await runtime.dispatch('left','Change',{delta:-1}),0);await assert.rejects(runtime.dispatch('left','Change',{delta:-1}),{code:'INVARIANT_VIOLATION'});assert.equal(runtime.snapshot().left.value,0);}finally{runtime.close();}return true;
});
await check('Native instance fields and operations drive the common UI kernel and independent DOM output',async()=>{
 const {parseInstanceProject,serializeInstanceProject}=await import('../src/studio/instance-project.mjs'),{createInstanceUIRuntime}=await import('../src/instances/ui.mjs'),{compileInstanceUIJS}=await import('../src/compiler/instance-ui.mjs'),{buildInstanceUIPackage}=await import('../src/compiler/instance-ui-package.mjs'),project=parseInstanceProject(await get('examples/contract-instance-ui.ems-project.json')),policy={capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']},output=await import('data:text/javascript;base64,'+Buffer.from(compileInstanceUIJS(project.module,project.ui)).toString('base64'));for(const create of [options=>createInstanceUIRuntime(project.module,project.ui,undefined,options),output.createRuntime]){const runtime=await create({policy});try{assert.equal(await runtime.dispatch('down','press'),0);await assert.rejects(runtime.dispatch('down','press'),{code:'INVARIANT_VIOLATION'});assert.equal(runtime.view().children[0].props.text,'0');assert.deepEqual(runtime.snapshot(),{'left.value':0,'right.value':5});}finally{await runtime.close();}}assert.ok(buildInstanceUIPackage(serializeInstanceProject(project),{policy})['bootstrap.mjs'].includes('await mountApplication'));return true;
});
await check('Native UI source shares the semantic module, current UI inverse and independent guarded execution',async()=>{
 const {newInstanceProject}=await import('../src/studio/instance-project.mjs'),{printInstanceUISource,compileInstanceUIFragment}=await import('../src/instances/ui-source.mjs'),{createInstanceUIRuntime}=await import('../src/instances/ui.mjs'),{compileInstanceUIJS}=await import('../src/compiler/instance-ui.mjs'),project=newInstanceProject(await get('examples/native-ui.ems')),text=printInstanceUISource(project.module,project.ui);assert.deepEqual(compileInstanceUIFragment(text,project.module),project.ui);const output=await import('data:text/javascript;base64,'+Buffer.from(compileInstanceUIJS(project.module,project.ui)).toString('base64')),policy={capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']};for(const create of [options=>createInstanceUIRuntime(project.module,project.ui,undefined,options),output.createRuntime]){const runtime=await create({policy});try{assert.equal(await runtime.dispatch('down','press'),0);await assert.rejects(runtime.dispatch('down','press'),{code:'INVARIANT_VIOLATION'});assert.equal(runtime.view().children[0].props.text,'0');}finally{await runtime.close();}}return true;
});
await check('Native field edits preserve real state bindings, invariant boundaries and independent instance values',async()=>{
 const {newInstanceProject}=await import('../src/studio/instance-project.mjs'),{addInstanceField,renameInstanceField,removeInstanceField}=await import('../src/studio/instance-fields.mjs'),{createInstanceSession}=await import('../src/instances/runtime.mjs');let project=newInstanceProject('@Counter{value:Number=1;+Change(delta:Number)->Number{value=value+delta;return value;}?value>=0;}@Counter #left;@Counter #right{value:5;}');project=addInstanceField(project,'Counter','spare','Array<String>',[]);project=renameInstanceField(project,'Counter','value','amount');project=removeInstanceField(project,'Counter','spare');assert.throws(()=>removeInstanceField(project,'Counter','amount'),{code:'FIELD_IN_USE'});const owner=await createInstanceSession(project.module,undefined,{policy:{capabilities:['state.read','state.write'],allowedEffects:['state.read','state.write']}});try{assert.equal(await owner.dispatch('left','Change',{delta:2}),3);assert.deepEqual(owner.snapshot(),{left:{amount:3},right:{amount:5}});await assert.rejects(owner.dispatch('left','Change',{delta:-4}),{code:'INVARIANT_VIOLATION'});assert.equal(owner.snapshot().left.amount,3);}finally{owner.close();}return true;
});
await check('Current native module source reuses typed implementation bindings and the genuine UI runtime',async()=>{
 const {newInstanceProject}=await import('../src/studio/instance-project.mjs'),{renameInstanceField}=await import('../src/studio/instance-fields.mjs'),{printInstanceSource}=await import('../src/instances/source.mjs'),{compileInstanceSource}=await import('../src/instances/ui-source.mjs'),{createInstanceUIRuntime}=await import('../src/instances/ui.mjs'),project=renameInstanceField(newInstanceProject(await get('examples/native-ui.ems')),'Counter','value','amount'),source=printInstanceSource(project.module,project.ui),next=compileInstanceSource(source);assert.deepEqual(next.ui,project.ui);const runtime=await createInstanceUIRuntime(next.module,next.ui,undefined,{policy:{capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']}});try{assert.equal(await runtime.dispatch('up','press'),2);assert.equal(runtime.snapshot()['left.amount'],2);}finally{runtime.close();}return true;
});
await check('Graph contract source preserves authoring identity, checked loop semantics and independent execution',async()=>{
 const {parseEMSModule}=await import('../src/frontend/index.mjs'),{typecheckModule}=await import('../src/frontend/check.mjs'),{lowerCheckedModule}=await import('../src/frontend/lower.mjs'),{executeIR,compileIRToJS}=await import('../src/ir/index.mjs'),{flowProjectFromSource}=await import('../src/studio/flow-source.mjs'),{FlowProjectEditor}=await import('../src/studio/flow-project.mjs'),base=createCoreRegistry(),source=await get('examples/graph-body.ems'),checked=typecheckModule(parseEMSModule(source),base),bundle=lowerCheckedModule(checked,'demo.CounterFlow',base),module=await import('data:text/javascript;base64,'+Buffer.from(compileIRToJS(bundle.ir,bundle.registry)).toString('base64'));assert.equal(await executeIR(bundle.ir,{limit:3},bundle.registry),3);assert.equal(module.execute({limit:4}),4);const editor=new FlowProjectEditor(flowProjectFromSource(source,base)),before=structuredClone(editor.project.canvas);editor.applySource(editor.sourceText.replace('b: 1;','b: 2;'));assert.deepEqual(editor.project.canvas,before);assert.equal(await executeContractFlow(editor.project.graph,base,{limit:3}),4);return true;
});
await check('Native authored graph origins survive first open, field edits and UI execution with checked IR correspondence',async()=>{
 const {newInstanceProject,serializeInstanceProject,parseInstanceProject,instanceProjectFlow,validateInstanceProject}=await import('../src/studio/instance-project.mjs'),{renameInstanceField}=await import('../src/studio/instance-fields.mjs'),{parseFlowProject}=await import('../src/studio/flow-project.mjs'),{createInstanceUIRuntime}=await import('../src/instances/ui.mjs');let p=newInstanceProject(await get('examples/native-graph-ui.ems'));p=renameInstanceField(p,'Counter','value','amount');p=parseInstanceProject(serializeInstanceProject(p));const v=instanceProjectFlow(p,{kind:'transition',instance:'left',name:'Change'});assert.deepEqual(parseFlowProject(v.source,v.registry,v.options).graph.nodes.map(n=>n.id),['read','add','write','out']);const tampered=structuredClone(p);tampered.authoredGraphs[0].graphs[0].nodes[1].args.b={literal:9};assert.throws(()=>validateInstanceProject(tampered),{code:'AUTHORED_GRAPH_MISMATCH'});const runtime=await createInstanceUIRuntime(p.module,p.ui,undefined,{policy:{capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']}});try{assert.equal(await runtime.dispatch('up','press'),7);await assert.rejects(runtime.dispatch('fail','press'),{code:'INVARIANT_VIOLATION'});assert.equal(runtime.snapshot()['left.amount'],7);}finally{runtime.close();}return true;
});
await check('Whole native source applies to the same graph and UI with checked identities and retained presentation',async()=>{
 const {newInstanceProject,instanceProjectFlow,applyInstanceProjectFlow}=await import('../src/studio/instance-project.mjs'),{FlowProjectEditor,parseFlowProject}=await import('../src/studio/flow-project.mjs'),{printInstanceProjectSource,applyInstanceProjectSource}=await import('../src/studio/instance-source.mjs'),{createInstanceUIRuntime}=await import('../src/instances/ui.mjs');let p=newInstanceProject(await get('examples/native-graph-ui.ems'));const target={kind:'transition',instance:'left',name:'Change'},view=instanceProjectFlow(p,target),editor=new FlowProjectEditor(parseFlowProject(view.source,view.registry,view.options),view.registry,view.options);editor.move('add',{x:-720,y:341});p=applyInstanceProjectFlow(p,target,editor.serialize());const text=printInstanceProjectSource(p).source,q=applyInstanceProjectSource(p,text.replace('b <= input::delta;','b: 3;')),next=instanceProjectFlow(q,target);assert.equal(q.schemaVersion,'ems-instance-project/4');assert.equal(q.sourceArchive,p.sourceArchive);assert.deepEqual(parseFlowProject(next.source,next.registry,next.options).canvas.positions.add,{x:-720,y:341});const runtime=await createInstanceUIRuntime(q.module,q.ui,undefined,{policy:{capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']}});try{assert.equal(await runtime.dispatch('up','press'),8);}finally{runtime.close();}return true;
});
console.log(`\nEMS foundation verification passed (${checks} checks). Not production readiness.`);
