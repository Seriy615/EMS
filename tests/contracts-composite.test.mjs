import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createCoreRegistry,executeGraph,compileStandaloneJS,validateGraph,compiledAtomicManifest,registerCompiledAtomic } from '../src/reference/index.mjs';
import { registerContractBinding } from '../src/contracts/index.mjs';
import { createStateRegistry,ReactorSession } from '../src/runtime/reactor.mjs';
import { lowerGraphToIR,parseIR,serializeIR,executeIR,compileIRToJS,EFFECT_PROFILE,graphFromIR } from '../src/ir/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';

const sourceGraph={schemaVersion:'0.1',id:'impl.divide',version:'1.0.0',inputs:{a:{type:'Number'},b:{type:'Number'}},output:{type:'Number'},nodes:[{id:'division',uses:'core.div',args:{a:{input:'a'},b:{input:'b'}}}],returns:{node:'division'}};
const interfaceSpec={schemaVersion:'ems-contract-interface/1',id:'std.divide',version:'1.0.0',inputs:[{name:'a',type:'Number'},{name:'b',type:'Number'}],output:{type:'Number'},errors:[],semantics:{determinism:'deterministic',effects:[],capabilities:[]},conditions:{pre:[{kind:'nonzero',subject:{input:'b'}}],post:[{kind:'positive',subject:{result:true}}]}};
const descriptor={schemaVersion:'ems-contract-binding/1',id:'reference.divide',version:'1.0.0',interface:{id:'std.divide',version:'1.0.0'},implementation:{id:'impl.divide',version:'1.0.0'},targets:['node'],determinism:'deterministic'};
function setup(spec=interfaceSpec,graph=sourceGraph,registry=createCoreRegistry()){
  registry.registerComposite({id:graph.id,version:graph.version,graph});registerContractBinding(registry,spec,descriptor,{target:'node'});return registry;
}
const restore=(graph,registry)=>parseIR(serializeIR(lowerGraphToIR(graph,registry),registry),registry);
const output=async source=>(await import(`data:text/javascript,${encodeURIComponent(source)}`)).execute;
const outcome=async run=>{try{return {value:await run()};}catch(error){return {code:error?.code,details:error?.details};}};

for(const profile of ['graph','IR','text call','text control'])test(`composite interface conditions survive ${profile} runtime/standalone`,async()=>{
  const registry=setup();let graph=registry.resolve('std.divide').graph,run,execute;
  if(profile==='graph'){run=inputs=>executeGraph(graph,inputs,registry);execute=await output(compileStandaloneJS(graph,registry));}
  else if(profile==='IR'){const ir=restore(graph,registry);run=inputs=>executeIR(ir,inputs,registry);execute=await output(compileIRToJS(ir,registry));}
  else{const checked=typecheckModule(parseEMSModule('fn test(a:Number,b:Number)->Number { return std.divide(a,b); }'),registry),bundle=lowerCheckedModule(checked,'test',registry,{profile:profile==='text call'?'call':'control'});run=inputs=>executeIR(bundle.ir,inputs,bundle.registry);execute=await output(compileIRToJS(bundle.ir,bundle.registry));}
  for(const [inputs,expected] of [[{a:6,b:2},{value:3}],[{a:1,b:0},{code:'PRECONDITION_FAILED',details:{contract:'std.divide',condition:0}}],[{a:-1,b:1},{code:'POSTCONDITION_FAILED',details:{contract:'std.divide',condition:0}}],[{a:-0,b:1},{code:'POSTCONDITION_FAILED',details:{contract:'std.divide',condition:0}}]]){
    assert.deepEqual(await outcome(()=>run(inputs)),expected);assert.deepEqual(await outcome(()=>execute(inputs)),expected);
  }
});

test('installed representation preserves editable graph, independent snapshot and exact public identity',async()=>{
  const graph=structuredClone(sourceGraph),registry=setup(interfaceSpec,graph),item=registry.resolve('std.divide');
  assert.equal(item.kind,'composite');assert.notEqual(item.graph,graph);assert.deepEqual(item.graph.nodes,graph.nodes);assert.equal(item.graph.id,'std.divide');assert.equal(item.graph.version,'1.0.0');assert.equal(item.interfaceBoundary.binding.implementation.id,'impl.divide');
  graph.nodes[0].uses='core.mul';assert.equal(item.graph.nodes[0].uses,'core.div');
  item.graph.nodes[0].uses='core.mul';assert.equal(await executeGraph(item.graph,{a:6,b:2},registry),12);assert.equal((await output(compileStandaloneJS(item.graph,registry)))({a:6,b:2}),12);
  assert.equal(registry.resolve('impl.divide').graph.nodes[0].uses,'core.mul');
});

test('nested boundaries keep condition order and do not evaluate host nodes before preconditions',async()=>{
  let calls=0;const registry=createCoreRegistry().registerAtomic({id:'counted',inputs:{a:'Number',b:'Number'},output:'Number',execute:({a,b})=>{calls++;return a/b;},emitJS:({a,b})=>`(${a}/${b})`}),graph=structuredClone(sourceGraph);graph.nodes[0].uses='counted';setup(interfaceSpec,graph,registry);
  registry.registerComposite({id:'outer.impl',version:'1.0.0',graph:{...structuredClone(sourceGraph),id:'outer.impl',nodes:[{id:'inner',uses:'std.divide',args:{a:{input:'a'},b:{input:'b'}}}],returns:{node:'inner'}}});
  const spec=structuredClone(interfaceSpec),binding=structuredClone(descriptor);spec.id='outer.public';spec.conditions.pre=[{kind:'positive',subject:{input:'a'}}];binding.interface.id=spec.id;binding.implementation.id='outer.impl';registerContractBinding(registry,spec,binding,{target:'node'});
  const publicGraph=registry.resolve('outer.public').graph,execute=await output(compileStandaloneJS(publicGraph,registry));
  for(const inputs of [{a:-1,b:0},{a:1,b:0}]){const actual=await outcome(()=>executeGraph(publicGraph,inputs,registry));assert.equal(actual.code,'PRECONDITION_FAILED');assert.deepEqual(await outcome(()=>execute(inputs)),actual);}assert.equal(calls,0);
  assert.equal(await executeGraph(publicGraph,{a:6,b:2},registry),3);assert.equal(calls,1);assert.equal(execute({a:6,b:2}),3);
});

test('composite declared and undeclared errors are caught around all nested nodes',async()=>{
  for(const declared of [true,false]){
    const spec=structuredClone(interfaceSpec);spec.conditions.pre=[];spec.conditions.post=[];if(declared)spec.errors=[{code:'DIV_BY_ZERO',payloadType:null}];
    const registry=setup(spec),graph=registry.resolve('std.divide').graph,execute=await output(compileStandaloneJS(graph,registry));
    const actual=await outcome(()=>executeGraph(graph,{a:1,b:0},registry));assert.equal(actual.code,declared?'DIV_BY_ZERO':'UNDECLARED_CONTRACT_ERROR');assert.deepEqual(await outcome(()=>execute({a:1,b:0})),actual);
  }
});

test('direct graph/IR edits cannot bypass version, signature or conservative interface grants',async()=>{
  const spec=structuredClone(interfaceSpec);spec.semantics.effects=['log.write'];spec.semantics.capabilities=['log.write'];const registry=setup(spec),graph=structuredClone(registry.resolve('std.divide').graph);delete graph.effects;delete graph.capabilities;
  await assert.rejects(executeGraph(graph,{a:6,b:2},registry),{code:'PERMISSION_DENIED'});assert.throws(()=>compileStandaloneJS(graph,registry),{code:'UNSUPPORTED_TARGET'});assert.throws(()=>lowerGraphToIR(graph,registry),{code:'UNSUPPORTED_PROFILE'});
  assert.equal(await executeGraph(graph,{a:6,b:2},registry,{allowedEffects:['log.write'],capabilities:['log.write']}),3);
  const ir=lowerGraphToIR(graph,registry,{profile:EFFECT_PROFILE});await assert.rejects(executeIR(ir,{a:6,b:2},registry),{code:'PERMISSION_DENIED'});
  const wrongVersion=structuredClone(graph);wrongVersion.version='1.1.0';assert.throws(()=>validateGraph(wrongVersion,registry),{code:'CONTRACT_VERSION'});
  await assert.rejects(executeGraph(wrongVersion,{a:6,b:2},registry),{code:'CONTRACT_VERSION'});
  const wrongSignature=structuredClone(graph);wrongSignature.inputs.b.type='Boolean';assert.throws(()=>validateGraph(wrongSignature,registry),{code:'INCOMPATIBLE_BINDING'});
});

test('implementation-own declarations cannot disappear behind graph-only binding analysis',()=>{
  const registry=createCoreRegistry().registerComposite({id:sourceGraph.id,version:sourceGraph.version,graph:structuredClone(sourceGraph),effects:['hidden.effect']});
  assert.throws(()=>registerContractBinding(registry,interfaceSpec,descriptor,{target:'node'}),{code:'INCOMPATIBLE_BINDING'});
});

test('compiled composite seal retains conditions after reimport as atomic',async()=>{
  const registry=setup(),graph=registry.resolve('std.divide').graph,execute=await output(compileStandaloneJS(graph,registry));
  const consumer=createCoreRegistry();registerCompiledAtomic(consumer,compiledAtomicManifest(graph),execute);
  const program={...structuredClone(sourceGraph),id:'consumer',nodes:[{id:'call',uses:'std.divide',args:{a:{input:'a'},b:{input:'b'}}}],returns:{node:'call'}};
  assert.equal(await executeGraph(program,{a:6,b:2},consumer),3);await assert.rejects(executeGraph(program,{a:1,b:0},consumer),{code:'PRECONDITION_FAILED'});await assert.rejects(executeGraph(program,{a:-1,b:1},consumer),{code:'POSTCONDITION_FAILED'});
});

test('standalone composite interface module executes outside EMS without imports',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ems-composite-idl-'));
  try{const registry=setup(),graph=registry.resolve('std.divide').graph;await writeFile(join(directory,'program.mjs'),compileStandaloneJS(graph,registry));
    await writeFile(join(directory,'run.mjs'),'import {execute} from "./program.mjs"; console.log(execute({a:6,b:2}));try{execute({a:1,b:0});process.exitCode=1;}catch(error){console.log(error.code);}');
    const child=spawnSync(process.execPath,['run.mjs'],{cwd:directory,encoding:'utf8'});assert.equal(child.status,0,child.stderr);assert.equal(child.stdout.trim(),'3\nPRECONDITION_FAILED');
  }finally{await rm(directory,{recursive:true,force:true});}
});


test('composite interface postcondition fails before event commit and owned state rolls back',async()=>{
  const state=[{id:'count',type:'Number',initial:0}],registry=createStateRegistry(createCoreRegistry(),state),graph=structuredClone(sourceGraph),spec=structuredClone(interfaceSpec);
  graph.nodes=[{id:'read',uses:'state.count.read',args:{}},{id:'delta',uses:'core.div',args:{a:{input:'a'},b:{input:'b'}}},{id:'add',uses:'core.add',args:{a:{node:'read'},b:{node:'delta'}}},{id:'write',uses:'state.count.write',args:{value:{node:'add'}}}];graph.returns={node:'write'};graph.sequence=['read','delta','add','write'];
  spec.semantics.effects=['state.read','state.write'];spec.semantics.capabilities=['state.read','state.write'];setup(spec,graph,registry);
  const bundle=lowerCheckedModule(typecheckModule(parseEMSModule('fn test(a:Number,b:Number)->Number { return std.divide(a,b); }'),registry),'test',registry);
  const session=new ReactorSession({schemaVersion:'ems-reactor/1',id:'idl.events',version:'1.0.0',state,handlers:[{event:'divide',program:bundle.ir}]},bundle.registry,{policy:{allowedEffects:spec.semantics.effects,capabilities:spec.semantics.capabilities},recordTrace:true});
  try{assert.equal(await session.dispatch('divide',{a:2,b:1}),2);await assert.rejects(session.dispatch('divide',{a:-3,b:1}),{code:'POSTCONDITION_FAILED'});assert.deepEqual(session.snapshot(),{count:2});await assert.rejects(session.dispatch('divide',{a:1,b:0}),{code:'PRECONDITION_FAILED'});assert.deepEqual(session.snapshot(),{count:2});}finally{await session.close();}
});

test('serialized composite graph/IR requires its pinned interface and rejects silent downcasting',async()=>{
  const registry=setup(),graph=registry.resolve('std.divide').graph,ir=restore(graph,registry),bare=createCoreRegistry();
  assert.equal(graph.schemaVersion,'ems-contract-graph/1');assert.equal(ir.profile,'ems-contract-core-finite/1');assert.deepEqual(ir.interfaceRef,{id:'std.divide',version:'1.0.0'});
  await assert.rejects(executeGraph(JSON.parse(JSON.stringify(graph)),{a:-1,b:1},bare),{code:'MISSING_CONTRACT'});assert.throws(()=>parseIR(serializeIR(ir,registry),bare),{code:'MISSING_CONTRACT'});
  const fake=structuredClone(ir);fake.profile='ems-core-finite/1';assert.throws(()=>graphFromIR(fake,registry),{code:'INVALID_IR'});delete fake.interfaceRef;assert.throws(()=>graphFromIR(fake,registry),{code:'MISSING_INTERFACE_REF'});
  const wrong=structuredClone(ir);wrong.interfaceRef.version='2.0.0';assert.throws(()=>graphFromIR(wrong,registry),{code:'CONTRACT_VERSION'});
  const unbound=createCoreRegistry().registerComposite({id:graph.id,version:graph.version,graph:{...structuredClone(sourceGraph),id:graph.id}});assert.throws(()=>graphFromIR(ir,unbound),{code:'MISSING_INTERFACE'});
});

test('rebinding an already public composite preserves both interface boundaries through an inspectable call',async()=>{
  const registry=setup(),spec=structuredClone(interfaceSpec),binding=structuredClone(descriptor);spec.id='std.rebound';spec.conditions.post=[];binding.interface.id=spec.id;binding.implementation.id='std.divide';registerContractBinding(registry,spec,binding,{target:'node'});
  const graph=registry.resolve(spec.id).graph;assert.equal(registry.resolve(spec.id).kind,'composite');assert.equal(graph.nodes[0].uses,'std.divide');const execute=await output(compileStandaloneJS(graph,registry));
  const actual=await outcome(()=>executeGraph(graph,{a:-1,b:1},registry));assert.equal(actual.code,'POSTCONDITION_FAILED');assert.equal(actual.details.contract,'std.divide');assert.deepEqual(await outcome(()=>execute({a:-1,b:1})),actual);
});
