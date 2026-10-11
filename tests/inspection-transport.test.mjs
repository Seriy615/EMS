import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectEditor} from '../src/studio/project.mjs';
import {runTextDraft} from '../src/studio/text.mjs';
import {prepareStudioInspection,validateInspectionPause,validateInspectionSnapshot} from '../src/studio/inspection-transport.mjs';
const draft={source:'fn main(a:Number[])->Number {let mut x=-0;x=x+1;return core.sum(a)+x;}',entry:'main',lowering:'auto'};
function request(names=['x'],extra={}){return {action:'text',debug:true,project:new ProjectEditor().serialize(),draft,inspection:{schemaVersion:'ems-source-inspection/1',...draft,policy:{allow:[{function:'main',names}],...extra}}};}
async function observation(req=request()){const prepared=prepareStudioInspection(req),events=[];const result=await runTextDraft(req.draft,prepared.editor,{a:[2,3]},{inspection:prepared.policy,onControlEnter:e=>events.push(e)});return {prepared,result,events,pause:{...events.find(e=>e.kind==='return'),token:1}};}
const invalid=fn=>assert.throws(fn,{code:'INVALID_INSPECTION_SNAPSHOT'});

test('source-owned grant reconstructs actual typed scopes; detached transport retains signed zero and unchanged result',async()=>{
 const {prepared,result,events,pause}=await observation(request(['a','x']));assert.equal(result,6);
 assert.equal(validateInspectionPause({...events[0],token:1},prepared).inspection.variables[1].status,'not-in-scope');
 assert.ok(events.some(e=>Object.is(e.inspection.variables.find(v=>v.name==='x')?.value,-0)));
 const copied=validateInspectionPause(pause,prepared);assert.equal(copied.inspection.variables[1].value,1);copied.inspection.variables[0].value[0]=100;assert.deepEqual(pause.inspection.variables[0].value,[2,3]);
});
test('inspection is refused for stale source, disabled debugging, wrong profiles and unknown or ambiguous grants',()=>{
 const req=request();const ordinary={...req};delete ordinary.inspection;assert.equal(prepareStudioInspection(ordinary),null);
 for(const change of [{debug:false}])assert.throws(()=>prepareStudioInspection({...req,...change}),{code:'UNSUPPORTED_INSPECTION_TRANSPORT'});
 assert.throws(()=>prepareStudioInspection({...req,draft:{...draft,source:'// shift\n'+draft.source}}),{code:'STALE_INSPECTION_SOURCE'});
 assert.throws(()=>prepareStudioInspection(request(['unknown'])),{code:'INVALID_INSPECTION_POLICY'});
 const shadow={source:'fn main()->Number {if true {let x=1;}else {let x=2;}return 0;}',entry:'main',lowering:'auto'};assert.throws(()=>prepareStudioInspection({...req,draft:shadow,inspection:{...req.inspection,...shadow}}),{code:'INVALID_INSPECTION_POLICY'});
 const pure={source:'fn main()->Number {return 1;}',entry:'main',lowering:'call'};assert.ok(prepareStudioInspection({...req,draft:pure,inspection:{...req.inspection,...pure,policy:{allow:[]}}}).graphs);

});
test('unauthorized fields, names, types, statuses and protected payloads are rejected without echoing data',async()=>{
 const {prepared,pause}=await observation();for(const record of [{name:'a',type:'NumberArray',status:'value',value:[1]},{name:'x',type:'String',status:'value',value:'PRIVATE_SENTINEL'},{name:'x',type:'Number',status:'protected-program'},{name:'x',type:'Number',status:'value',value:Infinity},{name:'x',type:'Number',status:'value',value:1,extra:2}]){
  try{validateInspectionSnapshot({...pause.inspection,variables:[record]},'main',prepared);assert.fail('Accepted invalid record');}catch(e){assert.equal(e.code,'INVALID_INSPECTION_SNAPSHOT');assert.ok(!JSON.stringify(e).includes('PRIVATE_SENTINEL'));}
 }
 const protectedRun=await observation(request(['a','x'],{protectedFunctions:['main']}));assert.ok(validateInspectionPause(protectedRun.pause,protectedRun.prepared).inspection.variables.every(v=>v.status==='protected-program'));
 invalid(()=>validateInspectionSnapshot({...protectedRun.pause.inspection,variables:[{name:'a',type:'NumberArray',status:'value',value:[2,3]}]},'main',protectedRun.prepared));
});
test('exact operation provenance, stack, frame and token metadata are validated before exposing values',async()=>{
 const {prepared,pause}=await observation();for(const change of [{node:'/body/missing'},{kind:'literal'},{type:'String'},{location:null},{frames:[1,1]},{callStack:['unknown']},{step:0},{token:0},{extra:'PRIVATE_SENTINEL'}])invalid(()=>validateInspectionPause({...pause,...change},prepared));
});
test('malformed DTO accessors are never invoked, and snapshots obey whole-value and total budgets',async()=>{
 const {prepared,pause}=await observation(request(['a'],{maxArrayItems:1}));assert.equal(validateInspectionPause(pause,prepared).inspection.variables[0].status,'limit');
 invalid(()=>validateInspectionSnapshot({...pause.inspection,variables:[{name:'a',type:'NumberArray',status:'value',value:[2,3]}]},'main',prepared));let invoked=0;
 for(const key of ['frames','inspection','location']){const bad={...pause};Object.defineProperty(bad,key,{get(){invoked++;return pause[key];},enumerable:true});invalid(()=>validateInspectionPause(bad,prepared));}
 const badLocation={...pause.location};Object.defineProperty(badLocation,'start',{get(){invoked++;return pause.location.start;},enumerable:true});invalid(()=>validateInspectionPause({...pause,location:badLocation},prepared));assert.equal(invoked,0);
});

test('mixed control-to-composite calls retain real graph pauses without inspection values',async()=>{
 const editor=new ProjectEditor();editor.addInput('a','Number');editor.addInput('b','Number');const node=editor.addNode('core.add');editor.connect({input:'a'},node,'a');editor.connect({input:'b'},node,'b');editor.connect({node},'output','return');editor.createComposite('user.Sum');
 const current={source:'fn main()->Number {let mut x=user.Sum(2,3);return x;}',entry:'main',lowering:'auto'},req={...request(),project:editor.serialize(),draft:current,inspection:{...request().inspection,...current}},prepared=prepareStudioInspection(req),events=[];
 assert.equal(await runTextDraft(current,editor,{}, {inspection:prepared.policy,onNodeEnter:e=>events.push(e),onControlEnter:e=>events.push(e)}),5);
 const graph=events.find(e=>!e.profile);assert.ok(graph);const checked=validateInspectionPause({...graph,token:1},prepared);assert.ok(!Object.hasOwn(checked,'inspection'));
 invalid(()=>validateInspectionPause({...graph,token:1,inspection:{schemaVersion:'ems-inspection/1',variables:[],truncated:false}},prepared));
});

test('client rejects unauthorized, forged and replayed value messages before callbacks and terminates the Worker',async()=>{
 const {startStudioExecution}=await import('../src/studio/execution-client.mjs'),{prepared,pause}=await observation();const Native=globalThis.Worker;let instance,created=0;
 globalThis.Worker=class{constructor(){instance=this;created++;this.ended=false;}postMessage(message){this.sent=message;}terminate(){this.ended=true;}emit(p){this.onmessage({data:{type:'paused',pause:p}});}};
 try{
  let exposed=0;const logs=[],badJob=startStudioExecution(request(),{onPause:()=>exposed++,onLog:r=>logs.push(r)});instance.emit({...pause,inspection:{...pause.inspection,variables:[{name:'x',type:'String',status:'value',value:'PRIVATE_SENTINEL'}]}});await assert.rejects(badJob.promise,{code:'INVALID_INSPECTION_SNAPSHOT'});assert.equal(instance.ended,true);assert.equal(exposed,0);assert.ok(!JSON.stringify(logs).includes('PRIVATE_SENTINEL'));
  const ordinary={...request()};delete ordinary.inspection;const plain=startStudioExecution(ordinary,{onPause:()=>exposed++});instance.emit(pause);await assert.rejects(plain.promise,{code:'INVALID_INSPECTION_SNAPSHOT'});assert.equal(exposed,0);
  const replay=startStudioExecution(request(),{onPause:()=>exposed++});instance.emit(pause);assert.equal(exposed,1);instance.emit(pause);await assert.rejects(replay.promise,{code:'INVALID_INSPECTION_SNAPSHOT'});assert.equal(exposed,1);
  const count=created,stale=startStudioExecution({...request(),draft:{...draft,source:'//changed\n'+draft.source}});await assert.rejects(stale.promise,{code:'STALE_INSPECTION_SOURCE'});assert.equal(created,count);
 }finally{globalThis.Worker=Native;}
});

test('nested algebraic DTOs enforce declared payload types, exact shapes, byte budgets and detachment',async()=>{
 const current={source:'fn main(o:Option<Result<Number,String>>,s:String)->Number {let mut x=-0;return x;}',entry:'main',lowering:'auto'},req={...request(),draft:current,inspection:{...request().inspection,...current,policy:{allow:[{function:'main',names:['o','s','x']}],maxStringBytes:4}}},prepared=prepareStudioInspection(req),events=[];
 await runTextDraft(current,prepared.editor,{o:{tag:'Some',value:{tag:'Ok',value:-0}},s:'ééé'},{inspection:prepared.policy,onControlEnter:e=>events.push(e)});const pause={...events.find(e=>e.kind==='return'),token:1},copied=validateInspectionPause(pause,prepared);assert.ok(Object.is(copied.inspection.variables[0].value.value.value,-0));assert.equal(copied.inspection.variables[1].status,'limit');copied.inspection.variables[0].value.value.value=999;assert.ok(Object.is(pause.inspection.variables[0].value.value.value,-0));
 const bad=structuredClone(pause);bad.inspection.variables[0].value.value.value='PRIVATE_SENTINEL';invalid(()=>validateInspectionPause(bad,prepared));
 const extra=structuredClone(pause);extra.inspection.variables[0].value.value.extra=true;invalid(()=>validateInspectionPause(extra,prepared));
 invalid(()=>validateInspectionSnapshot({...pause.inspection,truncated:true},'main',prepared));
 const names=['a'.repeat(128),'b'.repeat(128)],large={source:'fn main()->Number {let mut '+names[0]+'=1;let '+names[1]+'=2;return 0;}',entry:'main',lowering:'auto'},bounded=prepareStudioInspection({...request(),draft:large,inspection:{...request().inspection,...large,policy:{allow:[{function:'main',names}],maxBytes:256}}}),seen=[];
 await runTextDraft(large,bounded.editor,{}, {inspection:bounded.policy,onControlEnter:e=>seen.push(e)});const snapshot=seen.find(e=>e.kind==='return').inspection;assert.equal(snapshot.truncated,true);assert.ok(validateInspectionSnapshot(snapshot,'main',bounded).variables.length<2);invalid(()=>validateInspectionSnapshot({...snapshot,truncated:false},'main',bounded));
});
