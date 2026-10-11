import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectEditor} from '../src/studio/project.mjs';
import {prepareStudioInspection,graphInspectionWitness,validateInspectionPause} from '../src/studio/inspection-transport.mjs';
import {runTextDraft} from '../src/studio/text.mjs';
const make=()=>{const editor=new ProjectEditor();editor.addInput('x','Number');editor.setInput('x',3);const a=editor.addNode('core.add');editor.connect({input:'x'},a,'a');editor.literal(a,'b',2);const b=editor.addNode('core.mul');editor.connect({node:a},b,'a');editor.connect({node:a},b,'b');editor.connect({node:b},'output','return');return {editor,a,b};};
const req=(editor,paths)=>({action:'graph',debug:true,project:editor.serialize(),inspection:graphInspectionWitness(editor,{allow:[{function:editor.workspace.graph.id,declarations:paths}]})});

test('visual witness binds semantic project/library/selected graph while inputs/layout/name changes keep the grant',()=>{
 const {editor,a}=make(),request=req(editor,['/graph/nodes/'+a]);assert.ok(prepareStudioInspection(request).graphs);editor.setInput('x',8);editor.edit(p=>p.graph.nodes.reverse());editor.move(a,100,150);editor.edit(p=>{p.name='renamed';});assert.ok(prepareStudioInspection({...request,project:editor.serialize()}).graphs);
 editor.literal(a,'b',9);assert.throws(()=>prepareStudioInspection({...request,project:editor.serialize()}),{code:'STALE_INSPECTION_SOURCE'});assert.throws(()=>prepareStudioInspection({...request,inspection:{...request.inspection,selected:'wrong'}}),{code:'STALE_INSPECTION_SOURCE'});assert.throws(()=>prepareStudioInspection({...request,debug:false}),{code:'UNSUPPORTED_INSPECTION_TRANSPORT'});
});
test('visual transport checks actual cached outputs, pending current output, metadata, and closed value shapes',async()=>{
 const {editor,a,b}=make(),prepared=prepareStudioInspection(req(editor,['/graph/inputs/x','/graph/nodes/'+a,'/graph/nodes/'+b])),events=[];
 assert.equal(await editor.run({graphInspection:prepared.policy,onNodeEnter:e=>events.push(e)}),25);const pause={...events[1],location:null,token:1};assert.equal(validateInspectionPause(pause,prepared).inspection.variables[1].value,5);
 for(const change of [{inputs:{bad:'String'}},{output:'String'},{location:{bad:true}},{frames:[1,1]},{extra:'PRIVATE_SENTINEL'}])assert.throws(()=>validateInspectionPause({...pause,...change},prepared),{code:'INVALID_INSPECTION_SNAPSHOT'});
 const current=structuredClone(pause);current.inspection.variables[2]={name:b,declaration:'/graph/nodes/'+b,type:'Number',status:'value',value:25};assert.throws(()=>validateInspectionPause(current,prepared),{code:'INVALID_INSPECTION_SNAPSHOT'});
 const forged=structuredClone(pause);forged.inspection.variables[1].type='String';forged.inspection.variables[1].value='PRIVATE_SENTINEL';assert.throws(()=>validateInspectionPause(forged,prepared),{code:'INVALID_INSPECTION_SNAPSHOT'});
 let reads=0;const bad=structuredClone(pause);Object.defineProperty(bad.inspection.variables[1],'value',{get(){reads++;return 5;},enumerable:true});assert.throws(()=>validateInspectionPause(bad,prepared),{code:'INVALID_INSPECTION_SNAPSHOT'});assert.equal(reads,0);
});
test('call text uses its checked registry and exact source locations for graph-value pauses',async()=>{
 const editor=new ProjectEditor(),draft={source:'fn main(x:Number)->Number {let sum=core.add(x,2);return core.mul(sum,sum);}',entry:'main',lowering:'call'},witness={schemaVersion:'ems-source-inspection/1',...draft,policy:{allow:[{function:'main',declarations:['/graph/inputs/x']}]}};
 const prepared=prepareStudioInspection({action:'text',debug:true,project:editor.serialize(),draft,inspection:witness}),events=[];assert.equal(await runTextDraft(draft,editor,{x:3},{graphInspection:prepared.policy,onNodeEnter:e=>events.push(e)}),25);assert.equal(validateInspectionPause({...events[0],token:1},prepared).inspection.variables[0].value,3);assert.ok(events[0].location);
 assert.throws(()=>prepareStudioInspection({action:'text',debug:true,project:editor.serialize(),draft:{...draft,source:'//shift\n'+draft.source},inspection:witness}),{code:'STALE_INSPECTION_SOURCE'});
});
test('protected graph payload is rejected and a wrong root call path cannot authorize otherwise valid metadata',async()=>{
 const {editor,a}=make(),request=req(editor,['/graph/nodes/'+a]);request.inspection.policy.protectedFunctions=[editor.workspace.graph.id];const prepared=prepareStudioInspection(request),events=[];await editor.run({graphInspection:prepared.policy,onNodeEnter:e=>events.push(e)});const pause={...events[0],location:null,token:1};assert.equal(validateInspectionPause(pause,prepared).inspection.variables[0].status,'protected-program');const forged=structuredClone(pause);forged.inspection.variables[0]={name:a,declaration:'/graph/nodes/'+a,type:'Number',status:'value',value:5};assert.throws(()=>validateInspectionPause(forged,prepared),{code:'INVALID_INSPECTION_SNAPSHOT'});
 const wrong=structuredClone(pause);wrong.callPath[0].graph='unknown';assert.throws(()=>validateInspectionPause(wrong,prepared),{code:'INVALID_INSPECTION_SNAPSHOT'});
});

test('graph client rejects forged and replayed values before callbacks and closes the Worker',async()=>{
 const {startStudioExecution}=await import('../src/studio/execution-client.mjs'),{editor,a}=make(),request=req(editor,['/graph/nodes/'+a]),prepared=prepareStudioInspection(request),events=[];await editor.run({graphInspection:prepared.policy,onNodeEnter:e=>events.push(e)});const pause={...events[1],location:null,token:1},Native=globalThis.Worker;let instance,exposed=0;
 globalThis.Worker=class{constructor(){instance=this;this.ended=false;}postMessage(){}terminate(){this.ended=true;}emit(pause){this.onmessage({data:{type:'paused',pause}});}};
 try{const job=startStudioExecution(request,{onPause:()=>exposed++});const bad=structuredClone(pause);bad.inspection.variables[0].value='PRIVATE_SENTINEL';instance.emit(bad);await assert.rejects(job.promise,{code:'INVALID_INSPECTION_SNAPSHOT'});assert.equal(exposed,0);assert.equal(instance.ended,true);const replay=startStudioExecution(request,{onPause:()=>exposed++});instance.emit(pause);instance.emit(pause);await assert.rejects(replay.promise,{code:'INVALID_INSPECTION_SNAPSHOT'});assert.equal(exposed,1);}finally{globalThis.Worker=Native;}
});
