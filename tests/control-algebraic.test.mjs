import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createCoreRegistry } from '../src/reference/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import { executeIR, compileIRToJS, parseIR, serializeIR } from '../src/ir/index.mjs';
import { validateControlIR, CONTROL_ALGEBRAIC_PROFILE, CONTROL_ERROR_PROFILE } from '../src/ir/control.mjs';
import { makeControlThrow, controlCatchValue } from '../src/semantics/control-errors.mjs';
import { parseControlType, assertControlValueType } from '../src/semantics/control-algebraic.mjs';
import { createStateRegistry, ReactorSession, replayEvents } from '../src/runtime/reactor.mjs';

const lower = (source, registry=createCoreRegistry()) => lowerCheckedModule(typecheckModule(parseEMSModule(source),registry),'test',registry);
const compiled = async bundle => (await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(bundle.ir,bundle.registry))}`)).execute;
const outcome = async fn => { try { return {value:await fn()}; } catch(error) {return {code:error?.code,details:error?.details,value:error?.value};} };
for (const [label,source,inputs,expected] of [
  ['algebraic catch type alone selects profile','fn test()->Number { try { return 1; } catch(error:Option<Number>) { return 0; } }',{},1],
  ['some','fn test()->Option<Number> { return Some(5); }',{}, {tag:'Some',value:5}],
  ['none','fn test()->Option<Number> { return None(); }',{}, {tag:'None'}],
  ['ok','fn test()->Result<Number,String> { return Ok(5); }',{}, {tag:'Ok',value:5}],
  ['err','fn test()->Result<Number,String> { return Err("bad"); }',{}, {tag:'Err',value:'bad'}],
  ['nested result','fn test()->Option<Result<Number,String>> { return Some(Err("bad")); }',{}, {tag:'Some',value:{tag:'Err',value:'bad'}}],
  ['option match','fn test(value:Option<Number>)->Number { match value { Some(n)=>{return n+1;}, None=>{return 0;} } }',{value:{tag:'Some',value:4}},5],
  ['none match','fn test(value:Option<Number>)->Number { match value { Some(n)=>{return n;}, None()=>{return 0;} } }',{value:{tag:'None'}},0],
  ['literal then full variant','fn test(value:Option<Number>)->Number { match value { Some(1)=>{return 9;}, Some(n)=>{return n;}, None=>{return 0;} } }',{value:{tag:'Some',value:2}},2],
  ['nested match','fn test(value:Option<Option<Number>>)->Number { match value { Some(Some(n))=>{return n;}, Some(_)=>{return 2;}, None=>{return 0;} } }',{value:{tag:'Some',value:{tag:'None'}}},2],
  ['boolean coverage','fn test(value:Boolean)->Number { match value { true=>{return 1;}, false=>{return 0;} } }',{value:false},0],
  ['string fallback','fn test(value:String)->String { match value { "first"=>{return "one";}, other=>{return other;} } }',{value:'last'},'last'],
  ['generic binding','fn identity<T>(value:T)->T { return value; } fn test()->Option<Number> { return identity(Some(3)); }',{}, {tag:'Some',value:3}],
  ['aliases','type Outcome=Result<Number,String>; fn test()->Outcome { let value:Outcome=Err("alias"); match value { Ok(n)=>{return Ok(n);}, Err(error)=>{return Err(error);} } }',{}, {tag:'Err',value:'alias'}],
  ['match mutates outer local','fn test()->Number { let mut n=0; match Some(3) { Some(v)=>{n=v;}, None=>{n=1;} } return n; }',{},3],
  ['loop exit','fn test()->Number { let mut n=0; while n<4 { n=n+1; match Some(n) { Some(1)=>{continue;}, Some(_)=>{break;}, None=>{} } } return n; }',{},2],
  ['algebraic catch','fn test()->Result<Number,String> { try { let value:Result<Number,String>=Err("caught"); throw value; } catch(error:Result<Number,String>){return error;} }',{}, {tag:'Err',value:'caught'}],
  ['structural equality','fn test()->Boolean { let a:Option<Number[]>=Some([1,2]); let b:Option<Number[]>=Some([1,2]); return a==b; }',{},true],
  ['signed zero','fn test()->Result<Number,String> { return Ok(-0); }',{}, {tag:'Ok',value:-0}],
  ['None is a binding outside Option','fn test(value:Number)->Number { match value { None=>{return None;} } }',{value:7},7]
]) test(`algebraic runtime/standalone: ${label}`,async()=>{
  const bundle=lower(source),execute=await compiled(bundle);
  assert.equal(bundle.ir.profile,CONTROL_ALGEBRAIC_PROFILE);
  const ir=parseIR(serializeIR(bundle.ir,bundle.registry),bundle.registry);
  assert.deepEqual(await executeIR(ir,inputs,bundle.registry),expected);assert.deepEqual(execute(inputs),expected);
});

test('tagged values never coerce null, malformed tags or payloads; inputs agree across targets',async()=>{
  const bundle=lower('fn test(value:Option<Number>)->Option<Number> { return value; }'),execute=await compiled(bundle);
  const inherited=Object.create({tag:'Some',value:1});
  const accessor={get tag(){throw new Error('getter must not execute');},value:1};
  for(const value of [null,undefined,1,{},[],{tag:'None',value:1},{tag:'Some'},{tag:'Some',value:'1'},{tag:'Some',value:Infinity},{tag:'Other'},inherited,accessor,{tag:'Some',value:1,extra:0}]){
    const actual=await outcome(()=>executeIR(bundle.ir,{value},bundle.registry));assert.equal(actual.code,'TYPE_MISMATCH');assert.deepEqual(await outcome(()=>execute({value})),actual);
  }
  for(const inputs of [{},{value:{tag:'None'},extra:1},[],new Date()]) assert.deepEqual(await outcome(()=>executeIR(bundle.ir,inputs,bundle.registry)),await outcome(()=>execute(inputs)));
});

test('type grammar is canonical, bounded and rejects unsupported constructors',()=>{
  for(const type of ['Option','Option<Number,Number>','Result<Number>','Option< Number>','Future<Number>','Option<Number>[]','Number<String>'])assert.throws(()=>parseControlType(type),{code:'UNKNOWN_TYPE'});
  assert.throws(()=>parseControlType('Option<'.repeat(34)+'Number'+'>'.repeat(34)),{code:'IR_LIMIT'});
  assert.throws(()=>assertControlValueType({tag:'Ok',value:false},'Result<Number,String>','test'),{code:'TYPE_MISMATCH'});
});

test('IR independently rejects missing coverage and malformed patterns',()=>{
  const bundle=lower('fn test(value:Option<Number>)->Number { match value { Some(n)=>{return n;}, None=>{return 0;} } }');
  const mutate=(change,code)=>{const ir=structuredClone(bundle.ir);change(ir.functions[0].body[0]);assert.throws(()=>validateControlIR(ir,bundle.registry),{code});};
  mutate(match=>match.arms.pop(),'NON_EXHAUSTIVE_MATCH');
  mutate(match=>match.arms[0].pattern.tag='Ok','TYPE_MISMATCH');
  mutate(match=>match.arms[0].pattern.arguments=[],'CALL_ARITY');
  mutate(match=>match.arms[0].pattern.arguments[0].name='value','DUPLICATE_SYMBOL');
  mutate(match=>match.arms[0].body[0].value={kind:'assign',type:'Number',name:'n',value:{kind:'literal',type:'Number',value:2}},'IMMUTABLE_ASSIGNMENT');
  mutate(match=>match.arms.push(structuredClone(match.arms[0])),'UNREACHABLE_CODE');
  mutate(match=>{match.arms[0].pattern.arguments[0]={kind:'literal',type:'Number',value:1};match.arms[0].body[0].value={kind:'literal',type:'Number',value:1};},'NON_EXHAUSTIVE_MATCH');
  const old=structuredClone(bundle.ir);old.profile=CONTROL_ERROR_PROFILE;assert.throws(()=>validateControlIR(old,bundle.registry),{code:'UNKNOWN_TYPE'});
});

test('constructors verify payload type, arity, profile and exact node fields',()=>{
  const bundle=lower('fn test()->Option<Number> { return Some(3); }');
  for(const [change,code] of [
    [node=>node.tag='Ok','TYPE_MISMATCH'],[node=>node.arguments=[],'CALL_ARITY'],
    [node=>node.arguments[0]={kind:'literal',type:'String',value:'bad'},'TYPE_MISMATCH'],
    [node=>node.extra=true,'INVALID_IR'],[node=>{node.kind='literal';node.value={tag:'Some',value:3};delete node.tag;delete node.arguments;},'INVALID_IR']
  ]){const ir=structuredClone(bundle.ir);change(ir.functions[0].body[0].value);assert.throws(()=>validateControlIR(ir,bundle.registry),{code});}
});

test('nested constructor payload literals cannot imply full coverage in checker or IR',()=>{
  assert.throws(()=>lower('fn test(value:Option<Option<Number>>)->Number { match value { Some(Some(n))=>{return n;}, None=>{return 0;} } }'),{code:'NON_EXHAUSTIVE_MATCH'});
  const bundle=lower('fn test(value:Option<Option<Number>>)->Number { match value { Some(Some(n))=>{return n;}, Some(_)=>{return 2;}, None=>{return 0;} } }');
  bundle.ir.functions[0].body[0].arms.splice(1,1);assert.throws(()=>validateControlIR(bundle.ir,bundle.registry),{code:'NON_EXHAUSTIVE_MATCH'});
});

test('selected arm only executes and scrutinee evaluates once; all arms still require policy',async()=>{
  let reads=0,writes=[];const registry=createCoreRegistry();
  registry.registerAtomic({id:'source',inputs:{},output:'Number',effects:['io.read'],execute:()=>++reads});
  registry.registerAtomic({id:'sink',inputs:{n:'Number'},output:'Number',effects:['io.write'],execute:({n})=>{writes.push(n);return n;}});
  const bundle=lower('fn test()->Number { match Some(source()) { Some(1)=>{return 9;}, Some(n)=>{return sink(n);}, None=>{return sink(0);} } }',registry);
  await assert.rejects(executeIR(bundle.ir,{},registry,{allowedEffects:['io.read']}),{code:'EFFECT_DENIED'});assert.equal(reads,0);
  assert.equal(await executeIR(bundle.ir,{},registry,{allowedEffects:['io.read','io.write']}),9);assert.equal(reads,1);assert.deepEqual(writes,[]);
  assert.throws(()=>compileIRToJS(bundle.ir,registry),{code:'UNSUPPORTED_TARGET'});
});

test('matching consumes identical shared step budget, including failed nested patterns',async()=>{
  const bundle=lower('fn test()->Number { match Some(Some(3)) { Some(Some(1))=>{return 1;}, Some(Some(n))=>{return n;}, Some(_)=>{return 2;}, None=>{return 0;} } }'),execute=await compiled(bundle);
  for(let maxSteps=1;maxSteps<=24;maxSteps++)assert.deepEqual(await outcome(()=>executeIR(bundle.ir,{},bundle.registry,{maxSteps})),await outcome(()=>execute({},{maxSteps})));
});

test('generic algebraic entry selects control even without match or constructor in body',async()=>{
  const bundle=lower('fn identity<T>(value:T)->T { return value; } fn test(value:Result<Number,String>)->Result<Number,String> { return identity(value); }');
  const inputs={value:{tag:'Err',value:'test'}};
  assert.deepEqual(await executeIR(bundle.ir,inputs,bundle.registry),inputs.value);assert.deepEqual((await compiled(bundle))(inputs),inputs.value);
});

test('algebraic matching handles state events and rollback after unmatched throw',async()=>{
  const state=[{id:'count',type:'Number',initial:0}],registry=createStateRegistry(createCoreRegistry(),state);
  const bundle=lower('fn test(value:Option<Number>)->Number { match value { Some(n)=>{return state.count.write(n);}, None=>{state.count.write(9);throw "failed";} } }',registry);
  const manifest={schemaVersion:'ems-reactor/1',id:'algebraic',version:'1',state,handlers:[{event:'update',program:bundle.ir}]};
  const options={policy:{capabilities:['state.write'],allowedEffects:['state.write']},recordTrace:true};
  const session=new ReactorSession(manifest,registry,options);
  assert.equal(await session.dispatch('update',{value:{tag:'Some',value:3}}),3);
  await assert.rejects(session.dispatch('update',{value:{tag:'None'}}),{code:'USER_THROW'});assert.deepEqual(session.snapshot(),{count:3});
  const replay=new ReactorSession(manifest,registry,options);await replayEvents(replay,session.trace());assert.deepEqual(replay.trace(),session.trace());await session.close();await replay.close();
});

test('standalone algebraic module runs in a new process outside EMS',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ems-algebraic-'));
  try{
    const cli=new URL('../tools/ems.mjs',import.meta.url).pathname;
    await writeFile(join(directory,'source.ems'),'fn test(value:Option<Number>)->Result<Number,String> { match value { Some(n)=>{return Ok(n+1);}, None=>{return Err("missing");} } }');
    for(const args of [['module-ir','source.ems','--entry','test','--out','program.ir.json'],['ir-build','program.ir.json','--out','program.mjs']]){
      const result=spawnSync(process.execPath,[cli,...args],{cwd:directory,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
    }
    const run=spawnSync(process.execPath,[cli,'ir-run','program.ir.json','{"value":{"tag":"None"}}'],{cwd:directory,encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(run.stdout).result,{tag:'Err',value:'missing'});
    await writeFile(join(directory,'run.mjs'),'import {execute} from "./program.mjs"; console.log(JSON.stringify(execute({value:{tag:"Some",value:4}})));');
    const result=spawnSync(process.execPath,['run.mjs'],{cwd:directory,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{tag:'Ok',value:5});
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('generic type close adjoining initializer preserves source spans and numeric >=',async()=>{
  const source='fn test(n:Number)->Option<Number> { let value:Option<Number>=Some(n); if n>=1 { return value; } return None(); }';
  const ast=parseEMSModule(source),declaration=ast.declarations[0].body.statements[0];
  assert.equal(source.slice(declaration.type.location.start.offset,declaration.type.location.end.offset),'Option<Number>');
  const bundle=lower(source);assert.deepEqual(await executeIR(bundle.ir,{n:1},bundle.registry),{tag:'Some',value:1});
  assert.deepEqual((await compiled(bundle))({n:0}),{tag:'None'});
});

test('algebraic throw payload and catch copies do not alias nested arrays',()=>{
  const value={tag:'Some',value:{tag:'Ok',value:[1,2]}};
  const error=makeControlThrow(value,'Option<Result<NumberArray,String>>');
  value.value.value[0]=9;assert.deepEqual(error.value,{tag:'Some',value:{tag:'Ok',value:[1,2]}});
  const caught=controlCatchValue(error,error.valueType);caught.value.value[1]=8;assert.deepEqual(error.value.value.value,[1,2]);
});

test('cancellation in algebraic profile preserves terminal failure and suppresses later calls',async()=>{
  const registry=createCoreRegistry(),controller=new AbortController();let later=0;
  registry.registerAtomic({id:'waiting',inputs:{},output:'Number',effects:['io.wait'],execute:()=>{queueMicrotask(()=>controller.abort());return new Promise(()=>{});}});
  registry.registerAtomic({id:'later',inputs:{},output:'Number',effects:['io.write'],execute:()=>++later});
  const bundle=lower('fn test()->Option<Number> { try { return Some(waiting()); } finally { later(); return None(); } }',registry);
  await assert.rejects(executeIR(bundle.ir,{},registry,{signal:controller.signal,allowedEffects:['io.wait','io.write']}),{code:'CANCELLED'});assert.equal(later,0);
  const pure=lower('fn test()->Option<Number> { return Some(3); }'),execute=await compiled(pure);
  assert.throws(()=>execute({},{signal:controller.signal}),{code:'CANCELLED'});
});
