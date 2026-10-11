import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCoreRegistry } from '../src/reference/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import { serializeIR, parseIR, executeIR, compileIRToJS } from '../src/ir/index.mjs';
import { validateControlIR } from '../src/ir/control.mjs';
import { createStateRegistry, ReactorSession } from '../src/runtime/reactor.mjs';

const lower = (source, registry = createCoreRegistry()) => lowerCheckedModule(typecheckModule(parseEMSModule(source), registry), 'test', registry, { profile: 'control' });
const compiled = async bundle => (await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(bundle.ir,bundle.registry))}`)).execute;
const outcome = async fn => { try { return { value: await fn() }; } catch (e) { return { error: e.code, details: e.details }; } };

const vectors = [
  ['selected branch', 'fn test(flag:Boolean)->Number { if flag { return 1; } else { return 1/0; } }', {flag:true}, 1],
  ['else-if', 'fn test(x:Number)->Number { if x<0 { return -1; } else if x==0 { return 0; } else { return 1; } }', {x:2},1],
  ['mutable while/break/continue', 'fn test()->Number { let mut n=0; let mut total=0; while n<10 { n=n+1; if n==3 { continue; } if n==6 { break; } total=total+n; } return total; }',{},12],
  ['numeric for and outer assignments', 'fn test(values:Number[])->Number { let mut total=0; for value in values { if value<0 { continue; } total=total+value; } return total; }',{values:[2,-1,3]},5],
  ['computed array/index', 'fn test(x:Number)->Number { let values=[x,x+1]; return values[1]; }',{x:2},3],
  ['generic branch specialization', 'fn choose<T>(flag:Boolean,a:T,b:T)->T { if flag { return a; } else { return b; } } fn test()->Number { let flag=choose(false,true,false); return choose(flag,1,4); }',{},4],
  ['recursive factorial', 'fn factorial(n:Number)->Number { if n<=1 { return 1; } return n*factorial(n-1); } fn test(n:Number)->Number { return factorial(n); }',{n:5},120],
  ['short circuit', 'fn test()->Boolean { return false && (1/0==0) || true; }',{},true],
  ['structural array equality', 'fn test()->Boolean { return [1,2]==[1,2] && [1]!=[2]; }',{},true],
  ['negative zero', 'fn test()->Number { let mut n=0; n=-n; return n; }',{},-0],
  ['numeric remainder', 'fn test(x:Number)->Number { return x%3; }',{x:8},2],
  ['repeated pure call has fresh locals', 'fn count(n:Number)->Number { let mut x=0; while x<n { x=x+1; } return x; } fn test()->Number { return count(2)+count(3); }',{},5]
];
for (const [name, source, inputs, expected] of vectors) test(`control runtime/standalone: ${name}`, async () => {
  const bundle=lower(source), execute=await compiled(bundle);
  const ir=parseIR(serializeIR(bundle.ir,bundle.registry),bundle.registry);
  assert.deepEqual(await executeIR(ir,inputs,bundle.registry),expected);assert.deepEqual(execute(inputs),expected);
  assert.equal(serializeIR(ir,bundle.registry),serializeIR(bundle.ir,bundle.registry));
});

for (const [name,source,inputs,options,code] of [
  ['host contract overflow','fn test(x:Number)->Number { return add(x,x); }',{x:Number.MAX_VALUE},{},'TYPE_MISMATCH'],
  ['overflow','fn test(x:Number)->Number { let mut value=x; value=value*2; return value; }',{x:Number.MAX_VALUE},{},'TYPE_MISMATCH'],
  ['bounds','fn test(i:Number)->Number { return [1,2][i]; }',{i:0.5},{},'BOUNDS_ERROR'],
  ['modulo zero','fn test()->Number { return 1%0; }',{},{},'DIV_BY_ZERO'],
  ['loop budget','fn test()->Number { while true {} return 1; }',{}, {maxSteps:25},'STEP_LIMIT'],
  ['call depth','fn test()->Number { return test(); }',{}, {maxDepth:3},'CALL_DEPTH']
]) test(`control matching error: ${name}`,async()=>{
  const bundle=lower(source),execute=await compiled(bundle);
  const interpreted=await outcome(()=>executeIR(bundle.ir,inputs,bundle.registry,options));
  assert.equal(interpreted.error,code);assert.deepEqual(await outcome(()=>execute(inputs,options)),interpreted);
});

test('runtime and compiled control agree on exact shared step thresholds',async()=>{
  const bundle=lower('fn helper(x:Number)->Number { return x+1; } fn test()->Number { let mut n=0; while n<3 { n=helper(n); } return n; }');
  const execute=await compiled(bundle);
  for(let maxSteps=1;maxSteps<=75;maxSteps++) assert.deepEqual(await outcome(()=>executeIR(bundle.ir,{},bundle.registry,{maxSteps})),await outcome(()=>execute({},{maxSteps})));
});

test('control preflight includes untaken effect branches and does not execute denied calls',async()=>{
  let calls=0;const registry=createCoreRegistry().registerAtomic({id:'host.write',inputs:{},output:'Number',effects:['log.write'],capabilities:['log.access'],execute:()=>{calls++;return 9;}});
  const bundle=lower('fn test(flag:Boolean)->Number { if flag { return host.write(); } return 1; }',registry);
  await assert.rejects(executeIR(bundle.ir,{flag:false},registry),{code:'PERMISSION_DENIED'});
  assert.equal(calls,0);
  const grants={allowedEffects:['log.write'],capabilities:['log.access']};
  assert.equal(await executeIR(bundle.ir,{flag:false},registry,grants),1);assert.equal(calls,0);
  assert.equal(await executeIR(bundle.ir,{flag:true},registry,grants),9);assert.equal(calls,1);
  assert.throws(()=>compileIRToJS(bundle.ir,registry),{code:'UNSUPPORTED_TARGET'});
});

test('control verifier rejects forged types, policies, calls, immutable assignment and illegal exits',()=>{
  const bundle=lower('fn test(x:Number)->Number { let mut n=x; n=n+1; return n; }');
  for(const [mutate,code] of [
    [ir=>{ir.functions[0].body[0].value.type='String';},'TYPE_MISMATCH'],
    [ir=>{ir.functions[0].body[0].mutable=false;},'IMMUTABLE_ASSIGNMENT'],
    [ir=>{ir.functions[0].body[0]={kind:'break'};},'INVALID_CONTROL'],
    [ir=>{ir.functions[0].policy.effects=['made.up'];},'EFFECT_MISMATCH'],
    [ir=>{ir.functions[0].body.push(null);},'INVALID_IR'],
    [ir=>{ir.functions[0].body[0].unknown=true;},'INVALID_IR']
  ]){const ir=structuredClone(bundle.ir);mutate(ir);assert.throws(()=>validateControlIR(ir,bundle.registry),{code});}
  const call=lower('fn test(x:Number)->Number { return add(x,1); }');call.ir.functions[0].body[0].value.target.version='999';
  assert.throws(()=>validateControlIR(call.ir,call.registry),{code:'CONTRACT_VERSION'});
});

test('control state handlers run through the same reactor transaction and roll back on loop budget',async()=>{
  const state=[{id:'count',type:'Number',initial:0}],registry=createStateRegistry(createCoreRegistry(),state);
  const bundle=lower('fn test(limit:Number)->Number { let mut n=0; while n<limit { state.count.write(state.count.read()+1); n=n+1; } return state.count.read(); }',registry);
  const session=new ReactorSession({schemaVersion:'ems-reactor/1',id:'test.control',version:'1',state,handlers:[{event:'update',program:bundle.ir}]},registry,{policy:{capabilities:['state.read','state.write'],allowedEffects:['state.read','state.write']}});
  assert.equal(await session.dispatch('update',{limit:3}),3);
  // The default shared control budget ends this event and rolls back its draft writes.
  await assert.rejects(session.dispatch('update',{limit:100000}),{code:'STEP_LIMIT'});assert.deepEqual(session.snapshot(),{count:3});await session.close();
});

test('standalone control output runs in a new process outside the EMS workspace',async()=>{
  const bundle=lower('fn test(n:Number)->Number { let mut result=1; while n>result { result=result+1; } return result; }');
  const directory=await mkdtemp(join(tmpdir(),'ems-control-'));
  try{await writeFile(join(directory,'program.mjs'),compileIRToJS(bundle.ir,bundle.registry));
    await writeFile(join(directory,'run.mjs'),"import {execute} from './program.mjs'; console.log(execute({n:7}));\n");
    assert.equal(execFileSync(process.execPath,[join(directory,'run.mjs')],{cwd:directory,encoding:'utf8'}).trim(),'7');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('CLI exports control IR, executes it and builds an independent module',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ems-control-cli-'));
  try{
    const source=new URL('../examples/factorial.ems',import.meta.url).pathname,cli=new URL('../tools/ems.mjs',import.meta.url).pathname;
    const file=join(directory,'program.ir.json'),module=join(directory,'program.mjs');
    execFileSync(process.execPath,[cli,'module-ir',source,'--entry','demo.Factorial','--out',file]);
    const result=JSON.parse(execFileSync(process.execPath,[cli,'ir-run',file,'{"n":5}'],{encoding:'utf8'}));assert.equal(result.result,120);
    execFileSync(process.execPath,[cli,'ir-build',file,'--out',module]);
    const output=await import(new URL('file://'+module).href);assert.equal(output.execute({n:6}),720);
    const artifact=JSON.parse(await readFile(file,'utf8'));assert.equal(artifact.schemaVersion,'ems-ir/2');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('deep recursive expressions hit the same semantic guard before native JS stack exhaustion',async()=>{
  const nested='1+('.repeat(25)+'test(n-1)'+')'.repeat(25);
  const bundle=lower(`fn test(n:Number)->Number { if n<=0 { return 0; } return ${nested}; }`),execute=await compiled(bundle);
  const actual=await outcome(()=>executeIR(bundle.ir,{n:50},bundle.registry,{maxDepth:256}));
  assert.equal(actual.error,'EVALUATION_DEPTH');assert.deepEqual(await outcome(()=>execute({n:50},{maxDepth:256})),actual);
});

test('input envelopes, cancellation and invalid budgets agree in pure control targets',async()=>{
  const bundle=lower('fn test(x:Number)->Number { if x>0 { return x; } return 0; }'),execute=await compiled(bundle);
  for(const [inputs,options] of [[{},{}],[{x:1,extra:2},{}],[{x:Infinity},{}],[null,{}],[{x:1},{maxSteps:0}]])
    assert.deepEqual(await outcome(()=>executeIR(bundle.ir,inputs,bundle.registry,options)),await outcome(()=>execute(inputs,options)));
  const controller=new AbortController();controller.abort();
  assert.deepEqual(await outcome(()=>executeIR(bundle.ir,{x:1},bundle.registry,{signal:controller.signal})),await outcome(()=>execute({x:1},{signal:controller.signal})));
});

test('unreachable control declarations do not change the entry lowering profile',async()=>{
  const registry=createCoreRegistry();
  const checked=typecheckModule(parseEMSModule('fn unused()->Number { while true {} return 0; } fn test()->Number { let ignored=1/0; return 1; }'),registry);
  const bundle=lowerCheckedModule(checked,'test',registry);
  const baseline=lowerCheckedModule(typecheckModule(parseEMSModule('fn test()->Number { let ignored=1/0; return 1; }'),registry),'test',registry);
  assert.equal(serializeIR(bundle.ir,registry),serializeIR(baseline.ir,registry));
  await assert.rejects(executeIR(bundle.ir,{},bundle.registry),{code:'DIV_BY_ZERO'});
  const legacy=lowerCheckedModule(checked,'test',registry,{profile:'call'});
  assert.equal(await executeIR(legacy.ir,{},legacy.registry),1);
});

test('adding control-flow does not change eager let errors in ordinary textual functions',async()=>{
  const registry=createCoreRegistry();
  for(const source of ['fn helper()->Number { let ignored=1/0; return 1; } fn test()->Number { return helper(); }',
    'fn helper()->Number { let ignored=1/0; return 1; } fn test()->Number { if true { return helper(); } return 0; }']){
    const bundle=lowerCheckedModule(typecheckModule(parseEMSModule(source),registry),'test',registry),execute=await compiled(bundle);
    await assert.rejects(executeIR(bundle.ir,{},bundle.registry),{code:'DIV_BY_ZERO'});assert.throws(()=>execute({}),{code:'DIV_BY_ZERO'});
  }
});
