#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createCoreRegistry, parseTextEMS, validateGraph, executeGraph, compileStandaloneJS, compiledAtomicManifest, registerCompiledAtomic, registerTrustedJSBindings } from '../src/reference/index.mjs';
import { lowerGraphToIR, serializeIR, parseIR, executeIR, compileIRToJS, graphProvenance } from '../src/ir/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import { createStateRegistry, ReactorSession, replayEvents } from '../src/runtime/reactor.mjs';
import { validateContractInterface, compareContractInterfaces, registerContractBinding } from '../src/contracts/index.mjs';
const root=new URL('../',import.meta.url);
const get=async p=>readFile(new URL(p,root),'utf8');
const readJSON=async p=>JSON.parse(await get(p));
let checks=0;
async function check(desc, fn) { const x=await fn(); assert.ok(x,desc); checks++; console.log('✓',desc); }
const required=['AGENTS.md','.agents/policy.json','PROJECT_GOAL.md','docs/spec/LANGUAGE_SEMANTICS.md','docs/spec/IR.md','schemas/ir.schema.json','docs/spec/STATE_EVENTS.md','schemas/reactor.schema.json','docs/spec/CONTROL_IR.md','schemas/control-ir.schema.json','schemas/control-finite-ir.schema.json','schemas/control-algebraic-ir.schema.json','docs/spec/CONTROL_ALGEBRAIC.md','docs/spec/CONTROL_FUTURES.md','schemas/control-futures-ir.schema.json','docs/spec/CONTROL_STREAMS.md','schemas/control-streams-ir.schema.json','docs/spec/CONTRACT_IDL.md','schemas/contract-interface.schema.json','schemas/contract-binding.schema.json','docs/spec/CONTROL_RESOURCES.md','schemas/control-resources-ir.schema.json','docs/qa/PROGRESS.md','docs/spec/EMS_FULL_SPEC.md','docs/plans/ROADMAP.md','docs/qa/ACCEPTANCE.md','tasks/backlog.json'];
for(const f of required) { await stat(new URL(f,root)); await check(`found ${f}`,()=>true); }
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
console.log(`\nEMS foundation verification passed (${checks} checks). Not production readiness.`);
