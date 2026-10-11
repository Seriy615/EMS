import test from 'node:test';
import assert from 'node:assert/strict';
import {controlInspectionDeclarations,normalizeInspectionPolicy} from '../src/runtime/inspection.mjs';
import {parseEMSModule} from '../src/frontend/index.mjs';
import {typecheckModule} from '../src/frontend/check.mjs';
import {lowerCheckedModule} from '../src/frontend/lower.mjs';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {executeIR,compileIRToJS} from '../src/ir/index.mjs';
import {prepareStudioInspection,validateInspectionPause} from '../src/studio/inspection-transport.mjs';
import {ProjectEditor} from '../src/studio/project.mjs';
import {runTextDraft} from '../src/studio/text.mjs';
const source='fn main(choose:Boolean)->Number {let mut answer=0;if choose {let x=7;answer=x;}else{let x="PRIVATE_SENTINEL";answer=99;}return answer;}';
const compile=s=>{const registry=createCoreRegistry();return lowerCheckedModule(typecheckModule(parseEMSModule(s),registry),'main',registry,{profile:'control'});};
const policy=declarations=>({allow:[{function:'main',declarations}]});
const catalog=b=>controlInspectionDeclarations(b.ir.functions.find(fn=>fn.id==='main'));

test('declaration grants separate repeated names and types across actual branches without changing IR or compiled behavior',async()=>{
 const b=compile(source),xs=catalog(b).filter(d=>d.name==='x'),before=JSON.stringify(b.ir);assert.deepEqual(xs.map(x=>x.type),['Number','String']);const allow=policy([xs[0].declaration]);
 for(const choose of [true,false]){const events=[];assert.equal(await executeIR(b.ir,{choose},b.registry,{inspection:allow,onControlEnter:e=>events.push(e)}),choose?7:99);assert.ok(!JSON.stringify(events).includes('PRIVATE_SENTINEL'));assert.ok(events.every(e=>e.inspection.schemaVersion==='ems-inspection/2'));assert.ok(events.every(e=>e.inspection.variables[0].declaration===xs[0].declaration));if(choose)assert.ok(events.some(e=>e.inspection.variables[0].value===7));else assert.ok(events.every(e=>e.inspection.variables[0].status==='not-in-scope'));}
 assert.equal(JSON.stringify(b.ir),before);const exported=await import('data:text/javascript,'+encodeURIComponent(compileIRToJS(b.ir,b.registry)));assert.equal(await exported.execute({choose:true}),7);assert.equal(await exported.execute({choose:false}),99);
});
test('parameter, loop, catch and pattern declarations retain actual lexical lifetime and declared types',async()=>{
 const s='fn main(n:Number)->Number {let mut answer=0;for item in [1,2] {answer=answer+item;}try {throw 4;}catch (e:Number) {answer=answer+e;}match Some(5) {Some(v)=>{answer=answer+v;} None=>{answer=0;}}return answer;}',b=compile(s),declarations=catalog(b),events=[];
 assert.deepEqual(declarations.map(d=>d.name),['n','answer','item','e','v']);assert.equal(await executeIR(b.ir,{n:1},b.registry,{inspection:policy(declarations.map(d=>d.declaration)),onControlEnter:e=>events.push(e)}),12);
 for(const name of ['n','item','e','v'])assert.ok(events.some(e=>e.inspection.variables.some(v=>v.name===name&&v.status==='value')));
 const last=events.findLast(e=>e.kind==='return').inspection.variables;assert.ok(last.filter(v=>['item','e','v'].includes(v.name)).every(v=>v.status==='not-in-scope'));assert.equal(last.find(v=>v.name==='answer').value,12);
});
test('new address grants reject unknown/mixed/duplicate/oversized/accessor fields before execution; inherited flags never activate',async()=>{
 const b=compile(source);let calls=0;
 for(const p of [policy(['/body/999']),{allow:[{function:'main',names:['choose'],declarations:['/inputs/0']}]},policy(['/inputs/0','/inputs/0']),policy(['/body/'+'a'.repeat(1025)])])await assert.rejects(executeIR(b.ir,{choose:true},b.registry,{inspection:p,onControlEnter:()=>calls++}),{code:'INVALID_INSPECTION_POLICY'});assert.equal(calls,0);
 let reads=0;const p=policy(['/inputs/0']);Object.defineProperty(p.allow[0],'declarations',{get(){reads++;return ['/inputs/0'];}});assert.throws(()=>normalizeInspectionPolicy(p),{code:'INVALID_INSPECTION_POLICY'});assert.equal(reads,0);
 const previous=Object.getOwnPropertyDescriptor(Object.prototype,'declarations');try{Object.defineProperty(Object.prototype,'declarations',{value:['/inputs/0'],configurable:true});const events=[];await executeIR(b.ir,{choose:true},b.registry,{inspection:{allow:[{function:'main',names:['choose']}]},onControlEnter:e=>events.push(e)});assert.ok(events.every(e=>e.inspection.schemaVersion==='ems-inspection/1'));}finally{if(previous)Object.defineProperty(Object.prototype,'declarations',previous);else delete Object.prototype.declarations;}
});
test('transport checks declaration identity and per-declaration type, including inactive names and downgrade refusal',async()=>{
 const draft={source,entry:'main',lowering:'auto'},editor=new ProjectEditor(),b=compile(source),xs=catalog(b).filter(d=>d.name==='x'),prepared=prepareStudioInspection({action:'text',debug:true,project:editor.serialize(),draft,inspection:{schemaVersion:'ems-source-inspection/1',...draft,policy:policy(xs.map(d=>d.declaration))}}),events=[];
 assert.equal(await runTextDraft(draft,editor,{choose:true},{inspection:prepared.policy,onControlEnter:e=>events.push(e)}),7);const pause={...events.find(e=>e.inspection.variables[0].status==='value'),token:1};assert.equal(validateInspectionPause(pause,prepared).inspection.variables[0].value,7);assert.equal(pause.inspection.variables[1].status,'not-in-scope');
 for(const change of [{declaration:xs[1].declaration},{type:'String',value:'PRIVATE_SENTINEL'}]){const bad=structuredClone(pause);Object.assign(bad.inspection.variables[0],change);assert.throws(()=>validateInspectionPause(bad,prepared),{code:'INVALID_INSPECTION_SNAPSHOT'});}
 assert.throws(()=>validateInspectionPause({...pause,inspection:{...pause.inspection,schemaVersion:'ems-inspection/1'}},prepared),{code:'INVALID_INSPECTION_SNAPSHOT'});
});

test('shared in-memory IR node objects cannot alias grants for a different structural declaration',async()=>{
 const b=compile('fn main(secret:String)->Number {if true {let x=secret;return 1;}else{let x=secret;return 2;}}'),fn=b.ir.functions.find(fn=>fn.id==='main'),branch=fn.body[0];branch.otherwise[0]=branch.then[0];const selected=catalog(b).filter(d=>d.name==='x')[1].declaration,events=[];
 assert.equal(await executeIR(b.ir,{secret:'ALIAS_PRIVATE_SENTINEL'},b.registry,{inspection:policy([selected]),onControlEnter:e=>events.push(e)}),1);assert.ok(!JSON.stringify(events).includes('ALIAS_PRIVATE_SENTINEL'));assert.ok(events.every(e=>e.inspection.variables[0].status==='not-in-scope'));
});

test('address grants preserve protection, handle exclusions and bounded whole-value snapshots',async()=>{
 const b=compile('async fn child()->Number {return 3;} fn peek(f:Future<Number>,s:Stream<Number>)->Number {return 0;} async fn main()->Number {let f=child();let s:Stream<Number>=stream.channel(1);let ignored=peek(f,s);return await f;}'),events=[];
 assert.equal(await executeIR(b.ir,{},b.registry,{inspection:{allow:[{function:'peek',declarations:['/inputs/0','/inputs/1']}]},onControlEnter:e=>events.push(e)}),3);const peek=events.filter(e=>e.function==='peek');assert.ok(peek.length);assert.ok(peek.every(e=>e.inspection.variables.every(v=>v.status==='excluded-type'&&!Object.hasOwn(v,'value'))));
 const bounded=compile('fn main(a:Number[])->Number {return core.sum(a);}'),limited=[];await executeIR(bounded.ir,{a:[1,2]},bounded.registry,{inspection:{...policy(['/inputs/0']),maxArrayItems:1},onControlEnter:e=>limited.push(e)});assert.ok(limited.every(e=>e.inspection.variables[0].status==='limit'));
 const closed=[];await executeIR(bounded.ir,{a:[1,2]},bounded.registry,{inspection:{...policy(['/inputs/0']),protectedFunctions:['main']},onControlEnter:e=>closed.push(e)});assert.ok(closed.every(e=>e.inspection.variables[0].status==='protected-program'&&!Object.hasOwn(e.inspection.variables[0],'value')));
});
