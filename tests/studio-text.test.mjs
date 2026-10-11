import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectEditor,parseProject,workspaceProfile} from '../src/studio/project.mjs';
import {compileTextDraft,runTextDraft,projectFromText,textFromWorkspace,compileTextJS,TextDraftStorage} from '../src/studio/text.mjs';
import {lowerGraphToIR,serializeIR} from '../src/ir/index.mjs';
const draft=(source,lowering='auto',entry='test')=>({source,entry,lowering});
test('graph to dataflow text and back preserves exact semantic IR, signed zero and unused failure semantics',async()=>{
 const editor=new ProjectEditor();editor.addInput('x','Number',-0);const node=editor.addNode('core.mul');editor.connect({input:'x'},node,'a');editor.literal(node,'b',1);editor.connect({node},'output','return');editor.addNode('core.div');const text=textFromWorkspace(editor);
 const bundle=compileTextDraft(text,editor),original=serializeIR(lowerGraphToIR(editor.project.graph,editor.registry),editor.registry);assert.equal(serializeIR(bundle.ir,bundle.registry),original);assert.ok(Object.is(await runTextDraft(text,editor,{x:-0}),-0));const applied=new ProjectEditor(projectFromText(text,editor,{x:-0}).project);assert.equal(applied.serialize(),editor.serialize());assert.ok(Object.is(await applied.run(),-0));
});
test('ordinary text preserves eager failure when transferred to graph and persisted',async()=>{
 const editor=new ProjectEditor(),text=draft('fn test()->Number {let unused=core.div(1,0);return 5;}');await assert.rejects(runTextDraft(text,editor,{}),{code:'DIV_BY_ZERO'});const applied=new ProjectEditor(projectFromText(text,editor,{}).project);assert.equal(workspaceProfile(applied.project.graph,applied.registry),'ems-effects-finite/1');await assert.rejects(applied.run(),{code:'DIV_BY_ZERO'});await assert.rejects(new ProjectEditor(parseProject(applied.serialize())).run(),{code:'DIV_BY_ZERO'});
 const constant=new ProjectEditor(projectFromText(draft('fn test()->Number {return 5;}'),editor,{}).project);assert.equal(textFromWorkspace(constant).lowering,'auto');assert.equal(await runTextDraft(textFromWorkspace(constant),constant,{}),5);
 const exported=textFromWorkspace(applied);assert.equal(exported.lowering,'auto');assert.equal(serializeIR(compileTextDraft(exported,applied).ir,compileTextDraft(exported,applied).registry),serializeIR(compileTextDraft(text,editor).ir,compileTextDraft(text,editor).registry));
});
test('text helpers preserve sequence and provenance in composite transport without a second executor',async()=>{
 const editor=new ProjectEditor(),text=draft('fn twice(x:Number)->Number {let result=x*2;return result;} fn test(x:Number)->Number {let value=twice(x);return value+1;}');const bundle=compileTextDraft(text,editor);assert.ok(bundle.provenance.functions.test.nodes.value.start.line);const applied=new ProjectEditor(projectFromText(text,editor,{x:3}).project);assert.equal(await applied.run(),7);assert.equal(await new ProjectEditor(parseProject(applied.serialize())).run(),7);const generated=await import('data:text/javascript,'+encodeURIComponent(compileTextJS(text,editor)));assert.equal(generated.execute({x:3}),7);
});
test('control loops async and errors execute in text mode and reject fake visual conversion',async()=>{
 const editor=new ProjectEditor(),text=draft('async fn next(x:Number)->Number {return x+1;} async fn test(x:Number)->Number {let mut n=0;while n<x {n=await next(n);}return n;}');assert.equal(await runTextDraft(text,editor,{x:4}),4);assert.throws(()=>projectFromText(text,editor,{x:4}),{code:'UNSUPPORTED_VISUAL_PROFILE'});await assert.rejects(runTextDraft(draft('fn test()->Number {while true {}return 1;}'),editor,{}),{code:'STEP_LIMIT'});
});
test('frontend diagnostics retain source location, unknown effects/fields fail and bindings cannot collide',()=>{
 const editor=new ProjectEditor();assert.throws(()=>compileTextDraft(draft('fn test()->Number {return "bad";}'),editor),error=>error.code==='TYPE_MISMATCH'&&error.details.location.start.line===1);assert.throws(()=>compileTextDraft(draft('fn test()->Number {return host.exec();}'),editor),{code:'UNKNOWN_SYMBOL'});const text=draft('fn test(x:Number)->Number {let value_1=x+1;return core.add(value_1,x*2);}');const bundle=compileTextDraft(text,editor);assert.equal(new Set(bundle.ir.operations.map(node=>node.id)).size,bundle.ir.operations.length);
});
test('selected composite source edits apply to definition and preserve caller type preflight',async()=>{
 const editor=new ProjectEditor();editor.addInput('x','Number',2);editor.connect({input:'x'},'output','return');editor.createComposite('user.Identity');const call=editor.addNode('user.Identity');editor.connect({input:'x'},call,'x');editor.connect({node:call},'output','return');editor.openContract('user.Identity');const text=textFromWorkspace(editor);text.source=text.source.replace('return x;','return core.add(x,3);');const applied=new ProjectEditor(projectFromText(text,editor,{x:2}).project);assert.equal(await applied.run(),5);assert.throws(()=>projectFromText(draft('fn test()->Number {return 1;}'),editor,{}),{code:'ENTRY_MISMATCH'});
});
test('bounded text draft persistence survives invalid source and quota errors without deleting previous draft',()=>{
 const map=new Map(),storage={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)},saved=new TextDraftStorage(storage),text={...draft('incomplete source'),inputs:'{}'};saved.save('main',text);assert.equal(saved.load('main').source,text.source);storage.setItem=()=>{throw new Error('quota');};assert.throws(()=>saved.save('main',{...text,source:'changed'}),/quota/);assert.equal(saved.load('main').source,'incomplete source');
});

test('partial eager graphs refuse lossy text export and draft records reject corrupt shapes',()=>{
 const editor=new ProjectEditor();const first=editor.addNode('core.add');editor.addNode('core.mul');editor.edit(project=>{project.graph.sequence=[first];});assert.throws(()=>textFromWorkspace(editor),{code:'UNSUPPORTED_TEXT_EXPORT'});
 const storage={getItem:()=> 'null'},drafts=new TextDraftStorage(storage);assert.throws(()=>drafts.load('test'),{code:'INVALID_DRAFT'});storage.getItem=()=>JSON.stringify({schemaVersion:'ems-studio-text/1',source:'',entry:'test',inputs:'{}',lowering:'auto',extra:1});assert.throws(()=>drafts.load('test'),{code:'INVALID_DRAFT'});assert.throws(()=>drafts.save('test',null),{code:'INVALID_DRAFT'});
});

test('text bridge rejects compact exponential composite expansion before execution or export',()=>{
 const editor=new ProjectEditor();let source='fn f0(x:Number)->Number {return x+1;}';for(let i=1;i<16;i++)source+=`fn f${i}(x:Number)->Number {return f${i-1}(x)+f${i-1}(x);}`;source+='fn test()->Number {return f15(1);}';assert.throws(()=>compileTextDraft(draft(source),editor),{code:'PROJECT_LIMIT'});assert.throws(()=>compileTextJS(draft(source),editor),{code:'PROJECT_LIMIT'});
});

test('graph numeric and string literals roundtrip without synthetic arithmetic operations',async()=>{
 const editor=new ProjectEditor();const node=editor.addNode('core.add');editor.literal(node,'a',-0);editor.literal(node,'b',-2);editor.connect({node},'output','return');const text=textFromWorkspace(editor);assert.equal(new ProjectEditor(projectFromText(text,editor,{}).project).serialize(),editor.serialize());assert.equal(await runTextDraft(text,editor,{}),-2);
 const strings=new ProjectEditor();strings.edit(project=>{project.graph.output.type='String';project.graph.returns={literal:'line\n"quoted"'};});const candidate=textFromWorkspace(strings);assert.equal(new ProjectEditor(projectFromText(candidate,strings,{}).project).serialize(),strings.serialize());
});
