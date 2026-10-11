import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoreRegistry } from '../src/reference/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import { executeIR, compileIRToJS, parseIR, serializeIR } from '../src/ir/index.mjs';
import { validateControlIR, CONTROL_PROFILE, CONTROL_ERROR_PROFILE } from '../src/ir/control.mjs';
import { createStateRegistry, ReactorSession, replayEvents } from '../src/runtime/reactor.mjs';

const lower = (source, registry=createCoreRegistry()) => lowerCheckedModule(typecheckModule(parseEMSModule(source),registry),'test',registry);
const compiled = async bundle => (await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(bundle.ir,bundle.registry))}`)).execute;
const outcome = async fn => { try { return { value:await fn() }; } catch(error) { return { error:error?.code ?? 'HOST_ERROR', name:error?.name, details:error?.details,
  valueType:error?.valueType, thrown:error?.value }; } };

for(const [label,source,expected] of [
  ['typed string catch','fn test()->String { try { throw "failure"; } catch(error:String){ return error; } }','failure'],
  ['typed number catch','fn test()->Number { try { throw 2; } catch(error:Number){ return error+1; } }',3],
  ['boolean catch','fn test()->Boolean { try { throw true; } catch(error:Boolean){ return error; } }',true],
  ['array catch','fn test()->Number { try { throw [2,3]; } catch(error:Number[]){ return error[1]; } }',3],
  ['catch alias','type Failure=String; fn test()->String { try { throw "alias"; } catch(error:Failure){ return error; } }','alias'],
  ['generic catch specialization','fn recover<T>(value:T)->T { try { throw value; } catch(error:T){ return error; } } fn test()->Number { let flag=recover(true); if flag { return recover(5); } return 0; }',5],
  ['normal finally','fn test()->Number { let mut n=1; try { n=2; } finally { n=n+3; } return n; }',5],
  ['return value evaluated before finally','fn test()->Number { let mut n=1; try { return n; } finally { n=2; } }',1],
  ['finally return replaces return','fn test()->Number { try { return 1; } finally { return 2; } }',2],
  ['finally return replaces user throw','fn test()->Number { try { throw "failure"; } finally { return 2; } }',2],
  ['finally return replaces arithmetic error','fn test()->Number { try { return 1/0; } finally { return 2; } }',2],
  ['catch shadowing','fn test(error:Number)->Number { try { throw "inner"; } catch(error:String) { if error=="inner" { return 7; } return 0; } }',7],
  ['continue and break run finally','fn test()->Number { let mut n=0; let mut value=0; while n<4 { n=n+1; try { if n==1 { continue; } if n==3 { break; } value=value+10; } finally { value=value+1; } } return value; }',13],
  ['finally break replaces user throw','fn test()->Number { let mut n=0; while n<3 { try { throw "stop"; } finally { n=n+1; break; } } return n; }',1],
  ['nested rethrow caught by outer handler','fn test()->Number { try { try { throw 3; } catch(error:Number){ throw error+1; } } catch(error:Number){ return error; } }',4],
  ['signed zero payload','fn test()->Number { try { throw -0; } catch(error:Number){ return error; } }',-0]
]) test(`error runtime/standalone: ${label}`,async()=>{
  const bundle=lower(source),execute=await compiled(bundle);
  assert.equal(bundle.ir.profile,CONTROL_ERROR_PROFILE);
  const ir=parseIR(serializeIR(bundle.ir,bundle.registry),bundle.registry),inputs=label==='catch shadowing'?{error:2}:{};
  assert.deepEqual(await executeIR(ir,inputs,bundle.registry),expected);assert.deepEqual(execute(inputs),expected);
});

for(const [label,source,code,thrown] of [
  ['unhandled payload','fn test()->Number { throw "secret-value"; }','USER_THROW','secret-value'],
  ['unmatched catch type','fn test()->Number { try { throw 2; } catch(error:String){ return 1; } }','USER_THROW',2],
  ['host arithmetic is not a string payload','fn test()->Number { try { return 1/0; } catch(error:String){ return 1; } }','DIV_BY_ZERO',undefined],
  ['finalizer throw replaces pending throw','fn test()->Number { try { throw 1; } finally { throw 2; } }','USER_THROW',2]
]) test(`matching error propagation: ${label}`,async()=>{
  const bundle=lower(source),execute=await compiled(bundle);
  const interpreted=await outcome(()=>executeIR(bundle.ir,{},bundle.registry));
  assert.equal(interpreted.error,code);assert.deepEqual(interpreted.thrown,thrown);
  assert.deepEqual(await outcome(()=>execute({})),interpreted);
});

test('terminal step and call-depth errors cannot be suppressed by finally returns',async()=>{
  const nested='1+('.repeat(25)+'recurse(n-1)'+')'.repeat(25);
  for(const [source,options,expected] of [
    [`fn recurse(n:Number)->Number { if n<=0 { return 0; } return ${nested}; } fn test()->Number { try { return recurse(50); } finally { return 2; } }`,{maxDepth:256},'EVALUATION_DEPTH'],
    ['fn test()->Number { try { while true {} return 1; } finally { return 2; } }',{maxSteps:20},'STEP_LIMIT'],
    ['fn recurse()->Number { return recurse(); } fn test()->Number { try { return recurse(); } finally { return 2; } }',{maxDepth:3},'CALL_DEPTH']
  ]){const bundle=lower(source),execute=await compiled(bundle);const actual=await outcome(()=>executeIR(bundle.ir,{},bundle.registry,options));
    assert.equal(actual.error,expected);assert.deepEqual(await outcome(()=>execute({},options)),actual);}
});

test('try/catch/finally preserves exact shared budget thresholds',async()=>{
  const bundle=lower('fn test()->Number { let mut n=0; while n<2 { try { throw n; } catch(error:Number){ n=error+1; } finally { n=n+0; } } return n; }'),execute=await compiled(bundle);
  for(let maxSteps=1;maxSteps<90;maxSteps++) assert.deepEqual(await outcome(()=>executeIR(bundle.ir,{},bundle.registry,{maxSteps})),await outcome(()=>execute({},{maxSteps})));
});

test('IR rejects error instructions under the older profile and immutable catch assignment',()=>{
  const bundle=lower('fn test()->Number { try { throw 1; } catch(error:Number){ return error; } }');
  const older=structuredClone(bundle.ir);older.profile=CONTROL_PROFILE;assert.throws(()=>validateControlIR(older,bundle.registry),{code:'UNSUPPORTED_PROFILE'});
  const invalid=structuredClone(bundle.ir);invalid.functions[0].body[0].handler.body=[{kind:'return',value:{kind:'assign',name:'error',type:'Number',value:{kind:'literal',type:'Number',value:2}}}];
  assert.throws(()=>validateControlIR(invalid,bundle.registry),{code:'IMMUTABLE_ASSIGNMENT'});
  const missing=structuredClone(bundle.ir);missing.functions[0].body[0].handler=null;missing.functions[0].body[0].finalizer=null;
  assert.throws(()=>validateControlIR(missing,bundle.registry),{code:'INVALID_IR'});
});

test('state finalizers commit after handled throw and roll back after unhandled throw; traces omit payload',async()=>{
  const state=[{id:'count',type:'Number',initial:0}],registry=createStateRegistry(createCoreRegistry(),state);
  const source='fn test(handled:Boolean)->Number { try { try { throw "secret-value"; } finally { state.count.write(state.count.read()+1); } } catch(error:String){ if handled { return state.count.read(); } throw error; } }';
  const bundle=lower(source,registry);
  const manifest={schemaVersion:'ems-reactor/1',id:'test.errors',version:'1',state,handlers:[{event:'update',program:bundle.ir}]};
  const options={policy:{capabilities:['state.read','state.write'],allowedEffects:['state.read','state.write']},recordTrace:true};
  const session=new ReactorSession(manifest,registry,options);
  assert.equal(await session.dispatch('update',{handled:true}),1);
  await assert.rejects(session.dispatch('update',{handled:false}),{code:'USER_THROW'});assert.deepEqual(session.snapshot(),{count:1});
  assert.equal(session.trace()[1].error,'USER_THROW');assert.equal(JSON.stringify(session.trace()).includes('secret-value'),false);
  const replay=new ReactorSession(manifest,registry,options);await replayEvents(replay,session.trace());assert.deepEqual(session.trace(),replay.trace());
  assert.throws(()=>compileIRToJS(bundle.ir,registry),{code:'UNSUPPORTED_TARGET'});await session.close();await replay.close();
});

test('active cancellation is not caught or hidden by finally',async()=>{
  let began,finalized=0;const started=new Promise(resolve=>{began=resolve;});
  const registry=createCoreRegistry().registerAtomic({id:'host.wait',inputs:{},output:'Number',execute:()=>{began();return new Promise(()=>{});}})
    .registerAtomic({id:'host.finalize',inputs:{},output:'Number',execute:()=>{finalized++;return 1;}});
  const bundle=lower('fn test()->Number { try { return host.wait(); } catch(error:String){ return 3; } finally { host.finalize(); return 2; } }',registry);
  const controller=new AbortController(),pending=executeIR(bundle.ir,{},registry,{signal:controller.signal});
  const denied=assert.rejects(pending,{code:'CANCELLED'});await started;controller.abort();await denied;assert.equal(finalized,0);
});

test('catch-only constructs do not intercept raw host throw values',async()=>{
  const registry=createCoreRegistry().registerAtomic({id:'host.fail',inputs:{},output:'Number',execute:()=>{throw null;}});
  const bundle=lower('fn test()->Number { try { return host.fail(); } catch(error:String){ return 1; } }',registry);
  const result=await executeIR(bundle.ir,{},registry).then(()=>assert.fail('expected host failure'),error=>error);assert.equal(result,null);
});

test('finalizer effects are permission checked before any handler call',async()=>{
  const calls=[];
  const registry=createCoreRegistry().registerAtomic({id:'host.before',inputs:{},output:'Number',execute:()=>{calls.push('before');return 1;}})
    .registerAtomic({id:'host.log',inputs:{},output:'Number',effects:['log.write'],capabilities:['log.access'],execute:()=>{calls.push('finally');return 2;}});
  const bundle=lower('fn test()->Number { try { return host.before(); } finally { host.log(); } }',registry);
  await assert.rejects(executeIR(bundle.ir,{},registry),{code:'PERMISSION_DENIED'});assert.deepEqual(calls,[]);
  assert.equal(await executeIR(bundle.ir,{},registry,{capabilities:['log.access'],allowedEffects:['log.write']}),1);
  assert.deepEqual(calls,['before','finally']);assert.throws(()=>compileIRToJS(bundle.ir,registry),{code:'UNSUPPORTED_TARGET'});
});

test('error-profile standalone builds via CLI and runs outside the EMS workspace',async()=>{
  const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFileSync}=await import('node:child_process');
  const directory=await mkdtemp(join(tmpdir(),'ems-error-export-'));
  try{
    const cli=new URL('../tools/ems.mjs',import.meta.url).pathname,source=new URL('../examples/error-recovery.ems',import.meta.url).pathname;
    const irFile=join(directory,'program.ir.json'),output=join(directory,'program.mjs');
    execFileSync(process.execPath,[cli,'module-ir',source,'--entry','demo.ErrorRecovery','--out',irFile]);
    assert.equal(JSON.parse(execFileSync(process.execPath,[cli,'ir-run',irFile,'{"value":-5}'],{encoding:'utf8'})).result,5);
    execFileSync(process.execPath,[cli,'ir-build',irFile,'--out',output]);
    await writeFile(join(directory,'run.mjs'),"import {execute} from './program.mjs'; console.log(execute({value:-5}));\n");
    assert.equal(execFileSync(process.execPath,[join(directory,'run.mjs')],{cwd:directory,encoding:'utf8'}).trim(),'5');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('inherited envelope-like metadata does not turn a raw host exception into a typed throw',async()=>{
  const error=Object.create({emsThrow:'ems-user-throw/1',code:'USER_THROW',valueType:'String',value:'unexpected'});
  const registry=createCoreRegistry().registerAtomic({id:'host.raw',inputs:{},output:'Number',execute:()=>{throw error;}});
  const bundle=lower('fn test()->Number { try { return host.raw(); } catch(value:String){ return 1; } }',registry);
  await assert.rejects(executeIR(bundle.ir,{},registry),actual=>actual===error);
});
