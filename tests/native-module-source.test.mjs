import {spawnSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseEMSModule} from '../src/frontend/index.mjs';
import {compileInstanceSource} from '../src/instances/ui-source.mjs';
import {printInstanceSource} from '../src/instances/source.mjs';
import {newInstanceProject,instanceProjectFlow,applyInstanceProjectFlow,serializeInstanceProject} from '../src/studio/instance-project.mjs';
import {FlowProjectEditor,parseFlowProject} from '../src/studio/flow-project.mjs';
import {renameInstanceField,addInstanceField} from '../src/studio/instance-fields.mjs';
import {createInstanceSession} from '../src/instances/runtime.mjs';
import {createInstanceUIRuntime} from '../src/instances/ui.mjs';
import {compileInstanceModuleJS} from '../src/instances/compiler.mjs';
import {compileInstanceUIJS} from '../src/compiler/instance-ui.mjs';
import {printControlProgram} from '../src/frontend/print-control.mjs';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {parseEMSModule as parse} from '../src/frontend/index.mjs';
import {typecheckModule} from '../src/frontend/check.mjs';
import {lowerCheckedModule} from '../src/frontend/lower.mjs';
import {executeIR} from '../src/ir/index.mjs';
import {createWorkBudget} from '../src/semantics/work-budget.mjs';
const source=await readFile(new URL('../examples/native-ui.ems',import.meta.url),'utf8'),policy={capabilities:['state.read','state.write','ui.render'],allowedEffects:['state.read','state.write','ui.render']};
async function standalone(code){const folder=await mkdtemp(join(tmpdir(),'ems-source-')),file=join(folder,'app.mjs');await writeFile(file,code);return import(pathToFileURL(file));}
const roundtrip=p=>compileInstanceSource(printInstanceSource(p.module,p.ui));

test('common located grammar represents interface operations and direct implementation/initializer/invariant bindings',async()=>{
 const text='package "My module"@"1.0.0";@C{x:Number=@initial;+Set("for":Number)->Number;?nonnegative=@guard;}@C #one{+Set=@store;}@initial()->Number{return #-0;}@guard(x:Number)->Boolean{return x>=0;}@store("for":Number)->Number{return one::x::write(#"for");}',ast=parseEMSModule(text);
 assert.equal(ast.declarations[0].transitions[0].body,null);assert.equal(ast.declarations[1].bindings[0].kind,'InstanceTransitionBinding');assert.equal(ast.declarations[0].invariants[0].kind,'InvariantBindingDeclaration');assert.equal(ast.declarations[0].fields[0].value.kind,'ContractReferenceExpression');assert.ok(ast.declarations[1].bindings[0].location.start.offset>0);
 const {module}=compileInstanceSource(text);assert.equal(module.id,'My module');assert.equal(module.instances[0].transitions[0].entry,'store');assert.equal(module.definitions[0].invariants[0].id,'nonnegative');assert.equal(module.definitions[0].fields[0].initializer.entry,'initial');
 const r=await createInstanceSession(module,undefined,{policy});assert.ok(Object.is(r.snapshot().one.x,-0));assert.equal(await r.dispatch('one','Set',{for:2}),2);await assert.rejects(r.dispatch('one','Set',{for:-1}),{code:'INVARIANT_VIOLATION'});assert.equal(r.snapshot().one.x,2);r.close();
});

test('current source retains per-instance graph body edits, renamed fields, saved invariants and exact UI bindings',async()=>{
 let p=renameInstanceField(newInstanceProject(source),'Counter','value','amount');p=addInstanceField(p,'Counter','bag','Map<String,Option<NumberArray>>',{tag:'Map',value:[]});
 const target={kind:'transition',instance:'right',name:'Change'},view=instanceProjectFlow(p,target),e=new FlowProjectEditor(parseFlowProject(view.source,view.registry,view.options),view.registry,view.options);e.openContract(view.activeContract);const sum=e.workspace.graph.nodes.find(n=>n.uses==='core.add');e.literal(sum.id,'b',2);p=applyInstanceProjectFlow(p,target,e.serialize());
 const text=printInstanceSource(p.module,p.ui),q=compileInstanceSource(text);assert.deepEqual(q.ui,p.ui);assert.notEqual(text,p.sourceArchive);assert.match(text,/right::amount::write/);assert.doesNotMatch(text,/FunctionDeclaration|sourceArchive|ems-ir\//);
 for(const module of [p.module,q.module])for(const create of [o=>createInstanceSession(module,undefined,o),(await standalone(compileInstanceModuleJS(module))).createSession]){const r=await create({policy});assert.equal(await r.dispatch('right','Change',{delta:100}),7);assert.equal(await r.dispatch('left','Change',{delta:3}),4);await assert.rejects(r.dispatch('left','Change',{delta:-8}),{code:'INVARIANT_VIOLATION'});assert.deepEqual(r.snapshot(),{left:{amount:4,bag:{tag:'Map',value:[]}},right:{amount:7,bag:{tag:'Map',value:[]}}});r.close();}
 for(const create of [o=>createInstanceUIRuntime(q.module,q.ui,undefined,o),(await standalone(compileInstanceUIJS(q.module,q.ui))).createRuntime]){const r=await create({policy});assert.equal(await r.dispatch('up','press'),2);assert.equal(r.view().children[0].props.text,'2');r.close();}
 assert.equal(printInstanceSource(q.module,q.ui),text);
});

test('finite control source preserves recursion, lexical loop/catch/pattern scope and existing expression work charges',async()=>{
 const base=createCoreRegistry(),text='@Step(n:Number)->Number{if n<=0{return 0;}return n+Step(n-1);}@main("for":Number)->Result<Option<NumberArray>,String>{let mut sum:Number=0;for item in #[1,-0,2]{if item==0{continue;}sum=sum+item;}while sum<5{sum=sum+1;if sum==5{break;}}try{throw "bad";}catch(err:String){if err=="bad"{sum=sum+Step(#"for");}}finally{sum=sum+1;}let out:Option<NumberArray>=Some(#[#-0]);match out{Some(values)=>{return Ok(Some(values));}None()=>{return Err("none");}}}';
 // Constant arrays contain signed numbers; the outer # already denotes literal data.
 const checked=typecheckModule(parse(text.replace('#[#-0]','#[-0]')),base),ir=lowerCheckedModule(checked,'main',base,{profile:'control'}).ir,printed=printControlProgram(ir,base),again=lowerCheckedModule(typecheckModule(parse(printed.source),base),printed.entry,base,{profile:'control'}).ir;
 let remaining;for(const program of [ir,again]){const budget=createWorkBudget(10000),value=await executeIR(program,{for:3},base,{workBudget:budget});assert.ok(Object.is(value.value.value[0],-0));if(program===ir)remaining=budget.snapshot().remaining;else assert.equal(budget.snapshot().remaining,remaining);}
});

test('typed ascriptions preserve empty and nested finite constructors without adding runtime calls',async()=>{
 const p=newInstanceProject('@C{value:Result<Option<Array<String>>,String>=Ok(None());+Take()->Result<Option<Array<String>>,String>{return Ok(Some([]));}}@C #one;'),q=roundtrip(p);
 for(const module of [p.module,q.module]){const r=await createInstanceSession(module,undefined,{policy});assert.deepEqual(await r.dispatch('one','Take',{}),{tag:'Ok',value:{tag:'Some',value:[]}});r.close();}
 assert.throws(()=>compileInstanceSource('@C{x:Number=0;+Run()->Number{return ("wrong":Number);}}@C #one;'),{code:'TYPE_MISMATCH'});
});

test('source printing and rebinding never execute initializers or invariant predicates',async()=>{
 for(const source of ['@C{x:Number=core.div(1,0);+Run()->Number{return x;}}@C #one;','@C{x:Number=-1;+Run()->Number{return x;}?x>=0;}@C #one;']){const p=newInstanceProject(source),q=roundtrip(p);assert.ok(compileInstanceModuleJS(q.module));await assert.rejects(createInstanceSession(q.module,undefined,{policy}));}
});

test('bindings reject missing implementations, wrong signatures, duplicate/unknown operations and impure initialization',()=>{
 for(const text of [
 '@C{+Run()->Number;}@C #one;',
 '@C{+Run()->Number;}@C #one{+Run=@missing;}',
 '@C{+Run(n:Number)->Number;}@C #one{+Run=@impl;}@impl(x:String)->String{return x;}',
 '@C{+Run()->Number;}@C #one{+Run=@impl;+Run=@impl;}@impl()->Number{return 0;}',
 '@C{+Run()->Number;}@C #one{+Other=@impl;}@impl()->Number{return 0;}',
 '@C{x:Number=@impl;+Run()->Number{return x;}}@C #one;@impl()->Number{return one::x::read();}',
 '@C{x:Number=@impl;+Run()->Number{return x;}}@C #one;@impl(n:Number)->Number{return n;}',
 '@C{x:Number=0;+Run()->Number{return x;}?guard=@impl;}@C #one;@impl()->Boolean{return true;}'
 ])assert.throws(()=>compileInstanceSource(text));
 assert.throws(()=>parseEMSModule('@main()->NumberArray{return #[1,core.add(1,2)];}'),{code:'SYNTAX'});
 const bad='@C{+Run(n:Number)->Number;}@C #one{+Run=@impl;}@impl(x:String)->String{return x;}';assert.throws(()=>compileInstanceSource(bad),error=>error.code==='BINDING_SIGNATURE'&&Number.isInteger(error.details?.location?.start.line));
 const p=newInstanceProject('@C{+Run()->Number{return 0;}}@C #one;');p.module.definitions[0].id='ems_Reserved';p.module.instances[0].contract='ems_Reserved';assert.throws(()=>printInstanceSource(p.module),{code:'INSTANCE_SOURCE_PROFILE'});
 const collision=newInstanceProject('@_ems_text_body_0000{+Run()->Number{return 4;}}@_ems_text_body_0000 #_ems_text_pure_0000_0000;');assert.ok(roundtrip(collision).module);
 assert.throws(()=>newInstanceProject('@C{value:Number=0;+Run()->Number{return (value=value+1)::value::read();}}@C #null;'));
 assert.throws(()=>typecheckModule(parse('@null::Run()->Number{return 4;}@main()->Number{return (1+2)::Run();}'),createCoreRegistry()),{code:'UNSUPPORTED_CALL'});
});

test('actual CLI exports current native programs, accepts edited output and builds an independent UI application',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'ems-current-cli-')),file=join(folder,'project.json'),output=join(folder,'current.ems'),app=join(folder,'app'),cli=new URL('../tools/ems.mjs',import.meta.url).pathname,p=renameInstanceField(newInstanceProject(source),'Counter','value','amount');await writeFile(file,serializeInstanceProject(p));
 for(const command of ['instance-source','application-source']){const result=spawnSync(process.execPath,[cli,command,file,'--out',output],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.match(await readFile(output,'utf8'),/left::amount::write/);}
 const text=await readFile(output,'utf8');await writeFile(output,text.replace('left::amount::read() + delta','left::amount::read() + (delta * 2)'));
 const run=spawnSync(process.execPath,[cli,'application-run',output,'--events','[{"node":"up","event":"press"}]'],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).final['left.amount'],3);
 const build=spawnSync(process.execPath,[cli,'application-build',output,'--out',app],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);const {createRuntime}=await import(pathToFileURL(join(app,'application.mjs'))),runtime=await createRuntime({policy});assert.equal(await runtime.dispatch('up','press'),3);runtime.close();
});

test('named implementation binding preserves public positional argument order, left-to-right effects and shared work',async()=>{
 const p=newInstanceProject('@C{value:Number=0;+Store(a:Number,b:Number)->Number;+Run()->Number{return self::Store(value=value+1,value=value+1);}}@C #one{+Store=@Store;}@Store(b:Number,a:Number)->Number{return a*10+b;}');
 for(const module of [p.module,roundtrip(p).module])for(const create of [o=>createInstanceSession(module,undefined,o),(await standalone(compileInstanceModuleJS(module))).createSession]){const r=await create({policy});assert.equal(await r.dispatch('one','Run',{}),12);assert.equal(r.snapshot().one.value,2);assert.equal(await r.dispatch('one','Store',{a:3,b:4}),34);r.close();}
 const q=newInstanceProject('@C{+Mix(a:Number,b:String)->String;+Run()->String{return self::Mix(7,"x");}}@C #one{+Mix=@Mix;}@Mix(b:String,a:Number)->String{return std.text.concat(std.text.fromNumber(a),b);}');
 const r=await createInstanceSession(q.module,undefined,{policy});assert.equal(await r.dispatch('one','Run',{}),'7x');r.close();
});
