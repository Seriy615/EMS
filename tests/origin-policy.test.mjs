import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {parseEMSModule} from '../src/frontend/index.mjs';
import {typecheckModule} from '../src/frontend/check.mjs';
import {lowerCheckedModule} from '../src/frontend/lower.mjs';
import {classifyControlOrigins,normalizeOriginPolicy,executeIR} from '../src/ir/index.mjs';
import {createControlInspector} from '../src/runtime/inspection.mjs';
const compile=(text,registry=createCoreRegistry())=>lowerCheckedModule(typecheckModule(parseEMSModule(text),registry),'main',registry,{profile:'control'});
const policy=sources=>({schemaVersion:'ems-origin-policy/1',sources});
const input=(index,classification,fn='main')=>({kind:'input',function:fn,path:'/inputs/'+index,classification});
const at=(a,fn,path)=>a.nodes.find(n=>n.function===fn&&n.path===path);
const source='fn main(open:Number,secret:String)->Number {let mut shown=open;let hidden=secret;return shown;}';
const labels=()=>policy([input(0,'public'),input(1,'private')]);

test('classification resolves actual roots, defaults unknown, joins private/control and exposes no literal payloads',()=>{
 const b=compile(source),a=classifyControlOrigins(b.ir,b.registry,labels());assert.equal(a.securityDecision,false);
 assert.equal(at(a,'main','/body/0').classification,'public');assert.equal(at(a,'main','/body/1').classification,'private');assert.equal(at(a,'main','/return').classification,'private');
 assert.equal(at(classifyControlOrigins(b.ir,b.registry,policy([])),'main','/body/0').classification,'unknown');
 const literal=compile('fn main()->String {return "CLASSIFICATION_PRIVATE_LITERAL";}'),p=policy([{kind:'literal',function:'main',path:'/body/0/value',classification:'private'}]),result=classifyControlOrigins(literal.ir,literal.registry,p);assert.equal(at(result,'main','/return').classification,'private');assert.ok(!JSON.stringify(result).includes('CLASSIFICATION_PRIVATE_LITERAL'));
 assert.deepEqual(classifyControlOrigins(b.ir,b.registry,labels()),a);
});

test('host public helper annotations cannot erase private actual values, assignments or implicit flow',()=>{
 for(const text of [
  'fn helper(x:Number)->Number {return x;}fn main(secret:Number)->Number {return helper(secret);}',
  'fn main(secret:Number,flag:Boolean)->Number {let mut x=0;if flag {x=secret;}return x;}',
  'fn main(secret:Boolean)->Number {if secret {return 0;}let x=1;return x;}'
 ]){
  const b=compile(text),p=policy([input(0,'private')]);if(text.includes('helper'))p.sources.push(input(0,'public','helper'));
  const a=classifyControlOrigins(b.ir,b.registry,p),output=at(a,'main','/return');assert.notEqual(output.classification,'public');assert.ok(output.reasons.some(r=>r.classification==='private'));
 }
});

test('closed annotation schema rejects getters, duplicates, unknown roots and fabricated declassification',()=>{
 let reads=0;const bad={schemaVersion:'ems-origin-policy/1',get sources(){reads++;throw Error('Getter');}};assert.throws(()=>normalizeOriginPolicy(bad),{code:'INVALID_ORIGIN_POLICY'});assert.equal(reads,0);
 const b=compile(source);for(const p of [policy([input(0,'public'),input(0,'private')]),policy([{...input(0,'public'),classification:'declassified'}]),policy([{...input(0,'public'),path:'/body/0'}]),policy([{...input(0,'public'),function:'missing'}]),{...labels(),unknown:'public'},policy([{...input(0,'public'),kind:'boundary'}])])assert.throws(()=>classifyControlOrigins(b.ir,b.registry,p),{code:'INVALID_ORIGIN_POLICY'});
 const sparse=policy(new Array(1));assert.throws(()=>normalizeOriginPolicy(sparse),{code:'INVALID_ORIGIN_POLICY'});
 const supplied=labels(),normalized=normalizeOriginPolicy(supplied);supplied.sources[0].classification='private';assert.equal(normalized.sources[0].classification,'public');
});

test('interpreted inspection closes private and unknown declarations while preserving public explicit grants and output',async()=>{
 const b=compile(source),events=[],originPolicy=labels(),inspection={allow:[{function:'main',declarations:['/inputs/0','/inputs/1','/body/0','/body/1']}],originPolicy};
 assert.equal(await executeIR(b.ir,{open:11,secret:'RUNTIME_PRIVATE_SENTINEL'},b.registry,{inspection,onControlExit:e=>events.push(e)}),11);
 const snapshot=events.find(e=>e.kind==='return').inspection;assert.deepEqual(snapshot.variables.map(v=>v.status),['value','protected-origins','value','protected-origins']);assert.equal(snapshot.variables[2].value,11);assert.ok(!JSON.stringify(events).includes('RUNTIME_PRIVATE_SENTINEL'));
 const denied=[],unclassified={allow:inspection.allow,originPolicy:policy([])};await executeIR(b.ir,{open:11,secret:'RUNTIME_PRIVATE_SENTINEL'},b.registry,{inspection:unclassified,onControlExit:e=>denied.push(e)});assert.ok(denied.every(e=>e.inspection.variables.every(v=>v.status==='protected-origins'&&v.type===null&&!Object.hasOwn(v,'value'))));
});

test('origin refusal precedes scope getters and original effect/protected-program barriers retain priority',()=>{
 const b=compile(source),scope=new Map();let reads=0;scope.has=()=>{reads++;throw Error('Must not read');};scope.get=()=>{reads++;throw Error('Must not read');};
 const inspect=createControlInspector(b.ir,{allow:[{function:'main',names:['secret']}],originPolicy:labels()},b.registry);assert.equal(inspect('main',scope).variables[0].status,'protected-origins');assert.equal(reads,0);
 const effect=compile('fn main(open:Number)->Number {using h=resource.cell(open);return open;}'),p=policy([input(0,'public')]);assert.equal(createControlInspector(effect.ir,{allow:[{function:'main',names:['open']}],originPolicy:p},effect.registry)('main',scope).variables[0].status,'protected-effects');
 assert.equal(createControlInspector(b.ir,{allow:[{function:'main',names:['open']}],protectedFunctions:['main'],originPolicy:labels()},b.registry)('main',scope).variables[0].status,'protected-program');assert.equal(reads,0);
});

test('pure foreign boundaries remain unknown without running implementations during classification',async()=>{
 let calls=0;const r=createCoreRegistry().registerAtomic({id:'host.value',inputs:{},output:'Number',execute:()=>{calls++;return 7;}}),b=compile('fn main()->Number {let mut x=host.value();return x;}',r),p=policy([]),a=classifyControlOrigins(b.ir,b.registry,p);assert.equal(calls,0);assert.equal(at(a,'main','/body/0').classification,'unknown');const events=[];assert.equal(await executeIR(b.ir,{},b.registry,{inspection:{allow:[{function:'main',names:['x']}],originPolicy:p},onControlExit:e=>events.push(e)}),7);assert.equal(calls,1);assert.ok(events.every(e=>e.inspection.variables[0].status==='protected-origins'));
});

test('fresh source transport recomputes classifications and refuses forged private payloads or unsupported graph policy',async()=>{
 const {ProjectEditor}=await import('../src/studio/project.mjs'),{prepareStudioInspection,validateInspectionPause}=await import('../src/studio/inspection-transport.mjs'),{runTextDraft}=await import('../src/studio/text.mjs'),editor=new ProjectEditor(),draft={source,entry:'main',lowering:'auto'},inspection={schemaVersion:'ems-source-inspection/2',...draft,afterOperations:true,policy:{allow:[{function:'main',declarations:['/inputs/0','/inputs/1','/body/0','/body/1']}],originPolicy:labels()}},request={action:'text',debug:true,project:editor.serialize(),draft,inspection},prepared=prepareStudioInspection(request),events=[];
 assert.equal(await runTextDraft(draft,editor,{open:13,secret:'TRANSPORT_PRIVATE_SENTINEL'},{inspection:prepared.policy,onControlExit:e=>events.push(e)}),13);
 const event=events.find(e=>e.kind==='return'),pause={...event,token:1},copy=validateInspectionPause(pause,prepared);assert.equal(copy.inspection.variables[1].status,'protected-origins');assert.equal(copy.inspection.variables[2].value,13);
 for(const record of [{name:'secret',declaration:'/inputs/1',type:'String',status:'value',value:'TRANSPORT_PRIVATE_SENTINEL'},{name:'secret',declaration:'/inputs/1',type:null,status:'not-in-scope'}]){const forged=structuredClone(pause);forged.inspection.variables[1]=record;assert.throws(()=>validateInspectionPause(forged,prepared),{code:'INVALID_INSPECTION_SNAPSHOT'});}
 assert.throws(()=>prepareStudioInspection({...request,draft:{...draft,source:'// changed\n'+source}}),{code:'STALE_INSPECTION_SOURCE'});
 const pure={source:'fn main(open:Number)->Number {return open;}',entry:'main',lowering:'auto'};assert.throws(()=>prepareStudioInspection({...request,draft:pure,inspection:{schemaVersion:'ems-source-inspection/1',...pure,policy:{allow:[{function:'main',names:['open']}],originPolicy:policy([input(0,'public')])}}}),{code:'UNSUPPORTED_PROFILE'});
});

test('CLI classifies from the actual program and rejects attempts to label a missing root',async()=>{
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{execFile}=await import('node:child_process'),{promisify}=await import('node:util'),run=promisify(execFile),dir=await mkdtemp(join(tmpdir(),'ems-classification-'));
 try{
  const file=join(dir,'program.ems'),p=join(dir,'policy.json'),out=join(dir,'classification.json');await writeFile(file,source);await writeFile(p,JSON.stringify(labels()));
  await run(process.execPath,['tools/ems.mjs','module-classify',file,'--entry','main','--policy',p,'--out',out]);const b=compile(source);assert.deepEqual(JSON.parse(await readFile(out,'utf8')),classifyControlOrigins(b.ir,b.registry,labels()));
  await writeFile(p,JSON.stringify(policy([{...input(0,'public'),path:'/inputs/99'}])));await assert.rejects(run(process.execPath,['tools/ems.mjs','module-classify',file,'--entry','main','--policy',p,'--out',out]),error=>error.code===1&&error.stderr.includes('INVALID_ORIGIN_POLICY'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
