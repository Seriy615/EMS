import test from 'node:test';import assert from 'node:assert/strict';
import {createCoreRegistry} from '../src/reference/registry.mjs';import {parseEMSModule} from '../src/frontend/index.mjs';import {typecheckModule} from '../src/frontend/check.mjs';import {lowerCheckedModule} from '../src/frontend/lower.mjs';
import {createBoundOriginPolicy,verifyBoundOriginPolicy,classifyBoundControlOrigins,classifyControlOrigins,normalizeOriginPolicy,executeIR} from '../src/ir/index.mjs';
const compile=text=>{const r=createCoreRegistry();return lowerCheckedModule(typecheckModule(parseEMSModule(text),r),'main',r,{profile:'control'});};
const policy={schemaVersion:'ems-origin-policy/1',sources:[{kind:'literal',function:'main',path:'/body/0/value',classification:'public'}]};

test('bound policy pins literal bytes including signed zero, survives field/function ordering, and reveals no literal payloads',async()=>{
 const b=compile('fn helper()->Number {return 1;}fn main()->String {let mut value="BOUND_PRIVATE_LITERAL";return value;}'),p=await createBoundOriginPolicy(b.ir,b.registry,policy);assert.equal(p.schemaVersion,'ems-origin-policy/2');assert.match(p.program.sha256,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(p).includes('BOUND_PRIVATE_LITERAL'));
 assert.deepEqual(await verifyBoundOriginPolicy(b.ir,b.registry,p),policy);const reordered=JSON.parse(JSON.stringify(b.ir,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).reverse().map(k=>[k,v[k]])):v));reordered.functions.reverse();assert.deepEqual(await verifyBoundOriginPolicy(reordered,b.registry,p),policy);
 const changed=compile('fn main()->String {let mut value="OTHER_PRIVATE_LITERAL";return value;}');await assert.rejects(verifyBoundOriginPolicy(changed.ir,changed.registry,p),{code:'STALE_ORIGIN_POLICY'});
 const zero=compile('fn main()->Number {let mut value=0;return value;}'),negative=compile('fn main()->Number {let mut value=-0;return value;}'),zeroPolicy=await createBoundOriginPolicy(zero.ir,zero.registry,policy);await assert.rejects(verifyBoundOriginPolicy(negative.ir,negative.registry,zeroPolicy),{code:'STALE_ORIGIN_POLICY'});
 assert.throws(()=>classifyControlOrigins(b.ir,b.registry,p),{code:'BOUND_ORIGIN_POLICY'});assert.equal((await classifyBoundControlOrigins(b.ir,b.registry,p)).policy.schemaVersion,'ems-origin-policy/2');
});

test('interpreter rejects stale binding before diagnostics or host execution and retains ordinary typed output for verified labels',async()=>{
 const b=compile('fn main()->Number {let mut value=7;return value;}'),p=await createBoundOriginPolicy(b.ir,b.registry,policy),events=[];assert.equal(await executeIR(b.ir,{},b.registry,{inspection:{allow:[{function:'main',names:['value']}],originPolicy:p},onControlExit:e=>events.push(e)}),7);assert.equal(events.find(e=>e.kind==='return').inspection.variables[0].value,7);
 const changed=compile('fn main()->Number {let mut value=9;return value;}'),bad=[];await assert.rejects(executeIR(changed.ir,{},changed.registry,{inspection:{allow:[{function:'main',names:['value']}],originPolicy:p},onControlExit:e=>bad.push(e)}),{code:'STALE_ORIGIN_POLICY'});assert.equal(bad.length,0);
 const forged=structuredClone(p);forged.program.sha256='0'.repeat(64);await assert.rejects(verifyBoundOriginPolicy(b.ir,b.registry,forged),{code:'STALE_ORIGIN_POLICY'});
});

test('closed binding schema rejects getters, malformed digest/domain and unverified synchronous inspection',async()=>{
 const b=compile('fn main()->Number {let mut value=7;return value;}'),p=await createBoundOriginPolicy(b.ir,b.registry,policy);
 for(const program of [{domain:p.program.domain,sha256:'x'},{domain:'other',sha256:p.program.sha256},{...p.program,extra:true}])assert.throws(()=>normalizeOriginPolicy({...p,program}),{code:'INVALID_ORIGIN_POLICY'});
 let reads=0;assert.throws(()=>normalizeOriginPolicy({...p,program:{domain:p.program.domain,get sha256(){reads++;return p.program.sha256;}}}),{code:'INVALID_ORIGIN_POLICY'});assert.equal(reads,0);
 const {createControlInspector}=await import('../src/runtime/inspection.mjs');assert.throws(()=>createControlInspector(b.ir,{allow:[],originPolicy:p},b.registry),{code:'BOUND_ORIGIN_POLICY'});
});

test('reordered public/private input slots cannot inherit persisted public annotations',async()=>{
 const original=compile('fn main(open:Number,secret:String)->Number {let mut value=open;return value;}'),p=await createBoundOriginPolicy(original.ir,original.registry,{schemaVersion:'ems-origin-policy/1',sources:[{kind:'input',function:'main',path:'/inputs/0',classification:'public'},{kind:'input',function:'main',path:'/inputs/1',classification:'private'}]}),changed=compile('fn main(secret:String,open:Number)->Number {let mut value=open;return value;}'),events=[];
 await assert.rejects(executeIR(changed.ir,{open:13,secret:'REORDERED_PRIVATE_INPUT'},changed.registry,{inspection:{allow:[{function:'main',names:['secret']}],originPolicy:p},onControlEnter:e=>events.push(e)}),{code:'STALE_ORIGIN_POLICY'});assert.equal(events.length,0);
 await assert.rejects(createBoundOriginPolicy(changed.ir,changed.registry,p),{code:'INVALID_ORIGIN_POLICY'});
});

test('binding detects program mutation during digest and asynchronous runtime snapshots detach caller IR',async()=>{
 const b=compile('fn main()->Number {let mut value=7;return value;}'),digest=crypto.subtle.digest,real=digest.bind(crypto.subtle);
 try{crypto.subtle.digest=async(...args)=>{b.ir.functions[0].body[0].value.value=9;return real(...args);};await assert.rejects(createBoundOriginPolicy(b.ir,b.registry,policy),{code:'STALE_ORIGIN_POLICY'});}finally{crypto.subtle.digest=digest;}
 const stable=compile('fn main()->Number {let mut value=7;return value;}'),p=await createBoundOriginPolicy(stable.ir,stable.registry,policy),events=[];
 try{crypto.subtle.digest=async(...args)=>{stable.ir.functions[0].body[0].value.value=9;return real(...args);};assert.equal(await executeIR(stable.ir,{},stable.registry,{inspection:{allow:[{function:'main',names:['value']}],originPolicy:p},onControlExit:e=>events.push(e)}),7);assert.equal(events.find(e=>e.kind==='return').inspection.variables[0].value,7);}finally{crypto.subtle.digest=digest;}
});

test('CLI explicitly binds reviewed annotations and refuses changed source with the persisted file',async()=>{
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{execFile}=await import('node:child_process'),{promisify}=await import('node:util'),run=promisify(execFile),dir=await mkdtemp(join(tmpdir(),'ems-bound-origin-'));
 try{
  const source=join(dir,'program.ems'),annotations=join(dir,'annotations.json'),bound=join(dir,'bound.json'),out=join(dir,'report.json');await writeFile(source,'fn main()->Number {let mut value=7;return value;}');await writeFile(annotations,JSON.stringify(policy));
  await run(process.execPath,['tools/ems.mjs','module-bind-origins',source,'--entry','main','--policy',annotations,'--out',bound]);assert.equal(JSON.parse(await readFile(bound,'utf8')).schemaVersion,'ems-origin-policy/2');
  await run(process.execPath,['tools/ems.mjs','module-classify',source,'--entry','main','--policy',bound,'--out',out]);assert.equal(JSON.parse(await readFile(out,'utf8')).policy.schemaVersion,'ems-origin-policy/2');
  await writeFile(source,'fn main()->Number {let mut value=9;return value;}');await assert.rejects(run(process.execPath,['tools/ems.mjs','module-classify',source,'--entry','main','--policy',bound,'--out',out]),error=>error.code===1&&error.stderr.includes('STALE_ORIGIN_POLICY'));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('bound source preparation pins the request and rejects a reused label file for changed literal source',async()=>{
 const {ProjectEditor}=await import('../src/studio/project.mjs'),{prepareBoundStudioInspection,validateInspectionPause}=await import('../src/studio/inspection-transport.mjs'),{runTextDraft}=await import('../src/studio/text.mjs'),editor=new ProjectEditor(),draft={source:'fn main()->Number {let mut value=7;return value;}',entry:'main',lowering:'auto'},b=compile(draft.source),p=await createBoundOriginPolicy(b.ir,b.registry,policy),request={action:'text',debug:true,project:editor.serialize(),draft,inputs:{},inspection:{schemaVersion:'ems-source-inspection/2',...draft,afterOperations:true,policy:{allow:[{function:'main',names:['value']}],originPolicy:p}}},pending=prepareBoundStudioInspection(request);
 request.draft={...draft,source:'fn main()->Number {let mut value=9;return value;}'};
 const prepared=await pending;assert.equal(prepared.request.draft.source,draft.source);assert.equal(prepared.witness.policy.originPolicy.schemaVersion,'ems-origin-policy/2');const events=[];assert.equal(await runTextDraft(prepared.request.draft,prepared.editor,{}, {inspection:prepared.policy,onControlExit:e=>events.push(e)}),7);assert.equal(validateInspectionPause({...events.find(e=>e.kind==='return'),token:1},prepared).inspection.variables[0].value,7);
 await assert.rejects(prepareBoundStudioInspection({...request,inspection:{...request.inspection,source:request.draft.source}}),{code:'STALE_ORIGIN_POLICY'});
});
