import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {createStateRegistry} from '../src/runtime/reactor.mjs';
import {parseEMSModule} from '../src/frontend/index.mjs';
import {typecheckModule} from '../src/frontend/check.mjs';
import {lowerCheckedModule} from '../src/frontend/lower.mjs';
import {executeControlIR} from '../src/runtime/control.mjs';
import {compileControlJS,compileStateControlJS} from '../src/compiler/control.mjs';
const policy={capabilities:['state.read','state.write'],allowedEffects:['state.read','state.write']};
const registry=()=>createStateRegistry(createCoreRegistry(),[{id:'count',type:'Number',initial:0}]);
const lower=(source,r)=>lowerCheckedModule(typecheckModule(parseEMSModule(source),r),'test',r,{profile:'control'}).ir;
const load=async(ir,r)=>(await import(`data:text/javascript,${encodeURIComponent(compileStateControlJS(ir,r))}`)).execute;
const outcome=async fn=>{try{return {value:await fn()};}catch(error){return {error:error.code,details:error.details};}};
function context(initial=0){let value=initial;const calls=[];return {state:{read(id){calls.push(['read',id]);return value;},write(id,next){calls.push(['write',id,next]);value=next;return next;}},snapshot:()=>value,calls};}
for(const [name,source,inputs,options] of [
 ['loop/helper','fn add(x:Number)->Number{return state.count.write(state.count.read()+x);} fn test(n:Number)->Number{let mut i=0;while i<n{add(i);i=i+1;}return state.count.read();}',{n:4},{}],
 ['signed zero','fn test()->Number{return state.count.write(-0);}',{},{}],
 ['typed throw/finally','fn test()->Number{try{state.count.write(5);throw "failure";}finally{state.count.write(8);}}',{},{}],
 ['step exhaustion','fn test()->Number{state.count.write(1);while true{}return 0;}',{},{maxSteps:20}],
 ['async helper','async fn add()->Number{return state.count.write(state.count.read()+1);} async fn test()->Number{let task=add();return await task;}',{},{}]
])test(`state compiler differential: ${name}`,async()=>{
 const r=registry(),ir=lower(source,r),execute=await load(ir,r),a=context(),b=context();
 const interpreted=await outcome(()=>executeControlIR(ir,inputs,r,{...policy,...options,state:a.state}));
 const compiled=await outcome(()=>execute(inputs,{...policy,...options,state:b.state}));
 assert.deepEqual(compiled,interpreted);assert.deepEqual(b.calls,a.calls);assert.deepEqual(b.snapshot(),a.snapshot());
});
test('state output requires explicit grants/context and validates before state calls',async()=>{
 const r=registry(),ir=lower('fn test(delta:Number)->Number{return state.count.write(state.count.read()+delta);}',r),execute=await load(ir,r);
 for(const [options,inputs,code] of [[{}, {delta:1},'PERMISSION_DENIED'],[{capabilities:policy.capabilities},{delta:1},'EFFECT_DENIED'],[{capabilities:'state.read'},{delta:1},'INVALID_POLICY'],[policy,{delta:'1'},'TYPE_MISMATCH'],[policy,{delta:1},'STATE_CONTEXT']]){
  const a=context(),b=context();const supplied=code==='STATE_CONTEXT'?{}:{state:a.state};const suppliedB=code==='STATE_CONTEXT'?{}:{state:b.state};
  const expected=await outcome(()=>executeControlIR(ir,inputs,r,{...supplied,...options}));assert.equal(expected.error,code);
  assert.deepEqual(await outcome(()=>execute(inputs,{...suppliedB,...options})),expected);assert.equal(b.calls.length,0);
 }
 const controller=new AbortController();controller.abort();const c=context();assert.equal((await outcome(()=>execute({delta:1},{...policy,state:c.state,signal:controller.signal}))).error,'CANCELLED');assert.equal(c.calls.length,0);
 assert.throws(()=>compileControlJS(ir,r),{code:'UNSUPPORTED_TARGET'});
});
test('compiler rejects forged state IDs and modified genuine metadata without execution',()=>{
 for(const mutation of ['callback','version','signature','policy']){
  const r=registry(),original=r.resolve('state.count.read');let calls=0;
  const replacement={...original};if(mutation==='callback')replacement.execute=()=>++calls;
  if(mutation==='version')replacement.version='2.0.0';if(mutation==='signature')replacement.inputs={x:'Number'};if(mutation==='policy')replacement.effects=[];
  r.items.set(original.id,Object.freeze(replacement));const args=mutation==='signature'?'0':'';
  const ir=lower(`fn test()->Number{return state.count.read(${args});}`,r);
  assert.throws(()=>compileStateControlJS(ir,r),{code:'UNSUPPORTED_TARGET'});assert.equal(calls,0);
 }
 const r=registry();let calls=0;r.registerAtomic({id:'host.write',inputs:{},output:'Number',effects:['io.write'],capabilities:['io.write'],execute:()=>++calls});
 assert.throws(()=>compileStateControlJS(lower('fn test()->Number{return host.write();}',r),r),{code:'UNSUPPORTED_TARGET'});assert.equal(calls,0);
});
test('generated state handler runs in fresh Node process with no EMS imports',async()=>{
 const r=registry(),ir=lower('fn test(delta:Number)->Number{return state.count.write(state.count.read()+delta);}',r),dir=await mkdtemp(join(tmpdir(),'ems-state-standalone-'));
 try{await writeFile(join(dir,'handler.mjs'),compileStateControlJS(ir,r));await writeFile(join(dir,'run.mjs'),`import {execute} from './handler.mjs';let value=7;const state={read:()=>value,write:(_,next)=>(value=next)};const policy=${JSON.stringify(policy)};console.log(JSON.stringify([execute({delta:3},{...policy,state}),value]));`);assert.equal(execFileSync(process.execPath,[join(dir,'run.mjs')],{cwd:dir,encoding:'utf8'}).trim(),'[10,10]');}finally{await rm(dir,{recursive:true,force:true});}
});
