import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Worker} from 'node:worker_threads';
import {typecheckModule} from '../src/frontend/check.mjs';
import {linkEMSModules,compileEMSModules,moduleSourceLocation,modulePath} from '../src/frontend/modules.mjs';
import {compileWorkspaceModule,compileWorkspaceApplication,parseSourceProject} from '../src/studio/workspace-modules.mjs';
import {compileInstanceModules} from '../src/instances/modules.mjs';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {Registry} from '../src/reference/registry.mjs';
import {executeIR,compileIRToJS,serializeIR} from '../src/ir/index.mjs';
import {serializeInstanceProject} from '../src/studio/instance-project.mjs';
import {createInstanceSession} from '../src/instances/runtime.mjs';
import {createInstanceUIRuntime} from '../src/instances/ui.mjs';
import {compileInstanceUIJS} from '../src/compiler/instance-ui.mjs';
import {createUIWorkerRuntime} from '../src/ui/worker-client.mjs';
import {workspaceSource} from '../src/studio/manager.mjs';
import {newProject,serializeProject} from '../src/studio/project.mjs';
const base=createCoreRegistry(),policy={capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']};
const sources=(root,library)=>new Map([['app/main.ems',root],['lib/math.ems',library]]);
const compile=(files,options)=>compileEMSModules(files,'app/main.ems','Main',base,options);
const execute=async(bundle,inputs={})=>executeIR(bundle.ir,inputs,bundle.registry);
const generated=async bundle=>(await import('data:text/javascript,'+encodeURIComponent(compileIRToJS(bundle.ir,bundle.registry)))).execute;

test('source modules link exported generic types, private recursive helpers and diamond imports without shared names or mutated source',async()=>{
 const files=new Map([
  ['main.ems','import "lib/a.ems" as a; import "lib/b.ems" as b; @Main(x:Number)->Number{return a.Run(x)+b.Run(x);}'],
  ['lib/a.ems','import "common.ems" as c; export @Run(x:c.Value<Number>)->Number{return c.Identity(factorial(x));} @factorial(x:Number)->Number{if x<=1{return 1;}return x*factorial(x-1);}'],
  ['lib/b.ems','import "common.ems" as c; export @Run(x:Number)->Number{return c.Identity(factorial(x));} @factorial(x:Number)->Number{return x+1;}'],
  ['lib/common.ems','export type Value<T>=T; export @Identity<T>(x:T)->T{return x;}']
 ]),before=structuredClone(files),bundle=compileEMSModules(files,'main.ems','Main',base),again=compileEMSModules(new Map([...files].reverse()),'main.ems','Main',base);
 assert.equal(await execute(bundle,{x:4}),29);assert.equal(await(await generated(bundle))({x:4}),29);assert.equal(serializeIR(bundle.ir,bundle.registry),serializeIR(again.ir,again.registry));assert.deepEqual(files,before);assert.equal(bundle.modules.files.length,4);assert.equal(bundle.modules.symbols.filter(s=>s.name==='factorial').length,2);
});
test('module rewriting preserves value bindings, record members, field names and static collection callbacks',async()=>{
 const library='export @Use(value:Number)->Number{return value;} export @Transform(values:Number[])->Number[]{return std.array.map(values,double);} @double(x:Number)->Number{return x*2;}';
 const bundle=compile(sources('import "../lib/math.ems" as math; @Main(value:Number)->Number{let double=math.Use(value);let math=double;return math;}',library));assert.equal(await execute(bundle,{value:7}),7);
 const records=linkEMSModules(sources('@Main(value:Number)->Number{let math={value:value};return math.value;}',''),'app/main.ems');typecheckModule(records.ast,base);const returned=records.ast.declarations[0].body.statements[1].value;assert.equal(returned.kind,'MemberExpression');assert.equal(returned.value.name,'math');assert.equal(returned.member,'value');
 const mapped=compile(sources('import "../lib/math.ems" as lib; @Main(values:Number[])->Number[]{return lib.Transform(values);}',library));assert.deepEqual(await execute(mapped,{values:[-0,3]}),[-0,6]);assert.deepEqual(await(await generated(mapped))({values:[-0,3]}),[-0,6]);
 const callback=compile(sources('import "../lib/math.ems" as lib; @Main(values:Number[])->Number[]{return std.array.map(values,lib.Use);}',library));assert.deepEqual(await execute(callback,{values:[1,2]}),[1,2]);
});
test('local callable shadowing is rejected in parameters, sequential blocks, for, catch and match scopes',()=>{
 const bodies=['@Main(F:Number)->Number{return F(1);}', '@Main()->Number{let F=1;return F(1);}', '@Main()->Number{for F in [1]{return F(1);}return 0;}', '@Main()->Number{try{throw 1;}catch(F:Number){return F(1);}return 0;}', '@Main()->Number{let x:Option<Number>=Some(1);match x{Some(F)=>{return F(1);},None()=>{return 0;}}}'];
 for(const body of bodies)assert.throws(()=>compile(sources(body+' @F(x:Number)->Number{return x;}','')),e=>e.code==='UNSUPPORTED_CALL'&&e.details.file==='app/main.ems');
 assert.throws(()=>compile(sources('import "../lib/math.ems" as lib; @Main(lib:Number)->Number[]{return std.array.map([1],lib);}','')),{code:'CONTRACT_REF_REQUIRED'});
});
test('source graph calls resolve imported contracts while node IDs, literals and activation edges stay authored',async()=>{
 const library='export @Double(x:Number)->Number graph { @core::mul #value {a<=input::x;b:2;} @std::program::Result #result {value<=#value;} + #value; #value.next ~> #result.enter; }',root='import "../lib/math.ems" as lib; @Main(x:Number)->Number graph { @lib::Double #lib {x<=input::x;} @std::program::Result #result {value<=#lib;} + #lib; #lib.next ~> #result.enter; }';
 const linked=linkEMSModules(sources(root,library),'app/main.ems'),main=linked.ast.declarations.find(d=>d.name===linked.entry('Main'));assert.equal(main.body.nodes[0].name,'lib');assert.equal(main.body.connections[0].from,'lib');const bundle=compile(sources(root,library));assert.equal(await execute(bundle,{x:9}),18);assert.equal(await(await generated(bundle))({x:9}),18);
});
test('module privacy, absent namespaces, generated identity guessing and unsupported library top-level owners fail explicitly',()=>{
 for(const library of ['@Secret()->Number{return 1;}','export @Other()->Number{return 2;}'])assert.throws(()=>compile(sources('import "../lib/math.ems" as lib;@Main()->Number{return lib.Secret();}',library)),e=>e.code==='NOT_EXPORTED'&&e.details.file==='app/main.ems');
 const files=sources('@Main()->Number{return 1;}','@Secret()->Number{return 2;}'),secret=linkEMSModules(files,'app/main.ems').entry('Main');assert.throws(()=>compile(sources('@Main()->Number{return '+secret+'();}','')),{code:'RESERVED_SYMBOL'});
 for(const library of ['@Counter{value:Number=1;+Run()->Number{return value;}} @Counter #x;','@UI.Text #label{text:"x";}','@App{@UI.Text #label{text:"x";}}'])assert.throws(()=>compile(sources('import "../lib/math.ems" as lib;@Main()->Number{return 1;}',library)),{code:'MODULE_LIBRARY_SCOPE'});
 assert.throws(()=>compile(sources('import "../lib/math.ems" as lib;@Main()->Number{return lib();}','export @F()->Number{return 1;}')),{code:'MODULE_MEMBER_REQUIRED'});
});
test('relative source imports are bounded data-only inputs and never resolve URLs, missing files or host paths',()=>{
 for(const path of ['/tmp/a.ems','../../../a.ems','https://example.test/a.ems','C:\\a.ems','../lib/%2e.ems','a//b.ems'])assert.throws(()=>compile(sources('import '+JSON.stringify(path)+' as lib;@Main()->Number{return 1;}','')),{code:'INVALID_MODULE_PATH'});
 assert.equal(modulePath('../math.ems','lib/sub/a.ems'),'lib/math.ems');assert.throws(()=>compile(sources('import "missing.ems" as lib;@Main()->Number{return 1;}','')),{code:'MISSING_MODULE'});
 assert.throws(()=>compile(sources('import "../lib/math.ems" as lib;@Main()->Number{return lib.F();}','import "../app/main.ems" as root;export @F()->Number{return 1;}')),{code:'MODULE_CYCLE'});
 for(const options of [{maxModules:0},{maxModules:65},{maxBytes:0},{maxBytes:4194305}])assert.throws(()=>compile(sources('@Main()->Number{return 1;}',''),options),{code:'INVALID_MODULE_OPTION'});
 assert.throws(()=>compile(sources('@Main()->Number{return 1;}',''),{maxModules:1}),{code:'MODULE_LIMIT'});assert.throws(()=>compile(sources('@Main()->Number{return 1;}',''),{maxBytes:4}),{code:'MODULE_LIMIT'});
 assert.throws(()=>compile(new Map([['./app/main.ems','@Main()->Number{return 1;}']])) ,{code:'INVALID_MODULE_SET'});
});
test('explicit host namespace bindings keep typed calls and effects instead of loading foreign source',async()=>{
 const files=sources('import "ems:core" as math; @Main()->Number{return math.add(3,4);}','');const bundle=compile(files,{bindings:new Map([['ems:core','core']])});assert.equal(await execute(bundle),7);
 assert.throws(()=>compile(files),{code:'INVALID_MODULE_PATH'});assert.throws(()=>compile(sources('import "../lib/math.ems" as math;@Main()->Number{return math.add(1,2);}',''),{bindings:new Map([['../lib/math.ems','core']])}),{code:'AMBIGUOUS_MODULE'});
 const registry=new Registry();for(const [id,item]of base.items)registry.items.set(id,item);let calls=0;registry.registerAtomic({kind:'atomic',id:'device.read',version:'1.0.0',inputs:{},output:'Number',effects:['device.read'],capabilities:['device.read'],errors:[],execute:()=>{calls++;return 7;}});
 const linked=compileEMSModules(sources('import "../lib/math.ems" as lib;@Main()->Number{return lib.Read();}','export @Read()->Number{return device.read();}'),'app/main.ems','Main',registry);assert.equal(calls,0);await assert.rejects(executeIR(linked.ir,{},linked.registry),{code:'PERMISSION_DENIED'});assert.equal(calls,0);
});
test('cross-file syntax and type errors map to original UTF-16 offsets and filename, with sidecar provenance outside IR',()=>{
 const root='import "../lib/math.ems" as lib;\n@Main()->Number{return lib.Bad();}\n',library='// Unicode: текст\nexport @Bad()->Number {\n  return true;\n}\n';
 assert.throws(()=>compile(sources(root,library)),error=>error.code==='TYPE_MISMATCH'&&error.details.file==='lib/math.ems'&&error.details.location.start.line===3&&library.slice(error.details.location.start.offset,error.details.location.end.offset).includes('true'));
 assert.throws(()=>compile(sources(root,'export @Bad( {')),error=>error.code==='SYNTAX'&&error.details.file==='lib/math.ems');
 const linked=linkEMSModules(sources(root,library),'app/main.ems'),declaration=linked.ast.declarations.find(d=>d.name.endsWith('.Bad'));assert.equal(moduleSourceLocation(linked.modules,declaration.location).file,'lib/math.ems');assert.equal(moduleSourceLocation(linked.modules,{}),null);
});
test('generic, async and typed-error modules retain shared interpreter/compiler behavior',async()=>{
 const files=sources('import "../lib/math.ems" as lib;async @Main(x:Number)->Number{return await lib.Double(lib.Identity(x));}','export @Identity<T>(x:T)->T{return x;}export async @Double(x:Number)->Number{return x*2;}'),bundle=compile(files);assert.equal(await execute(bundle,{x:5}),10);assert.equal(await(await generated(bundle))({x:5}),10);
 const errors=compile(sources('import "../lib/math.ems" as lib;@Main()->Number{try{return lib.Fail();}catch(e:String){return std.text.length(e);}}','export @Fail()->Number{throw "boom";}'));assert.equal(await execute(errors),4);assert.equal(await(await generated(errors))({}),4);
});
test('native imported definition, imported graph body, UI state and rollback agree with persistent Worker and independent output',async()=>{
 const source=await readFile(new URL('../examples/modules/counter.source-project.json',import.meta.url),'utf8'),compiled=compileWorkspaceApplication(source),document=serializeInstanceProject(compiled.project);assert.equal(compiled.project.sourceArchive,null);assert.ok(compiled.authoredGraphs.length);assert.equal(compiled.modules.files.length,3);
 const local=await createInstanceUIRuntime(compiled.module,compiled.ui,base,{policy}),workerFactory=()=>{const w=new Worker(new URL('./helpers/ui-ready-worker.mjs',import.meta.url)),a={postMessage:m=>w.postMessage(m),terminate:()=>w.terminate()};w.on('message',data=>a.onmessage?.({data}));w.on('error',e=>a.onerror?.(e));return a;},worker=await createUIWorkerRuntime(document,{policy,workerFactory,waitForReady:true}),independent=await(await import('data:text/javascript,'+encodeURIComponent(compileInstanceUIJS(compiled.module,compiled.ui)))).createRuntime({policy});
 try{for(const runtime of [local,worker,independent]){assert.equal(await runtime.dispatch('up','press'),2);assert.equal(await runtime.dispatch('down','press'),1);assert.equal(await runtime.dispatch('down','press'),0);await assert.rejects(runtime.dispatch('down','press'),{code:'INVARIANT_VIOLATION'});assert.deepEqual(runtime.snapshot(),{'counter.value':0});assert.equal(runtime.view().children[0].props.text,'0');}}finally{await Promise.all([local.close(),worker.close(),independent.close()]);}
});
test('native source compilation runs no initializer and rejects an implicit application owner in an imported library',async()=>{
 const files=sources('import "../lib/math.ems" as lib;@lib::Counter #counter;','export @Counter{value:Number=1/0;+Read()->Number{return value;}}'),compiled=compileInstanceModules(files,'app/main.ems',base);assert.ok(compiled.module);await assert.rejects(createInstanceUIRuntime(compiled.module,{schemaVersion:'ems-ui/1',root:{id:'root',kind:'text',props:{text:{literal:'x'}},events:{},children:[]}},base,{policy}),{code:'DIV_BY_ZERO'});
 assert.throws(()=>compileInstanceModules(sources('import "../lib/math.ems" as lib;@Counter{value:Number=0;+Run()->Number{return lib.Run();}}@Counter #counter;','export @Run()->Number{return counter.Run();}'),'app/main.ems',base),{code:'MODULE_UNBOUND_OWNER'});
});
test('existing workspace text snapshots compile their actual drafts and never substitute a graph or archival source',async()=>{
 const file=(id,path,code,entry)=>{const graph=newProject(id,path);return {path,record:{id,name:path,kind:'graph',source:serializeProject(graph),draft:{schemaVersion:'ems-studio-text/1',source:code,entry,inputs:'{}',lowering:'auto'}}};},source=workspaceSource([file('root','main.ems','import "lib.ems" as lib;@Main()->Number{return lib.F();}','Main'),file('lib','lib.ems','export @F()->Number{return 42;}','F')]);
 assert.equal(await execute(compileWorkspaceModule(source,'main.ems')),42);assert.equal(await execute(compileWorkspaceModule(JSON.stringify({schemaVersion:'ems-project-bundle/1',project:{kind:'workspace',source}}),'main.ems')),42);
 assert.throws(()=>parseSourceProject('{'),{code:'INVALID_SOURCE_PROJECT'});assert.throws(()=>parseSourceProject(JSON.stringify({schemaVersion:'ems-source-project/1',entry:'main.ems',files:[{path:'main.ems',source:'x'},{path:'main.ems',source:'y'}]})),{code:'INVALID_SOURCE_PROJECT'});
});
test('workspace CLI runs and builds the real multi-file program and a native DOM package for a fresh process',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'ems-modules-'));try{
 const run=(...args)=>spawnSync(process.execPath,args,{encoding:'utf8'}),series=new URL('../examples/modules/series.source-project.json',import.meta.url).pathname,counter=new URL('../examples/modules/counter.source-project.json',import.meta.url).pathname;
 const interpreted=run('tools/workspace.mjs','run',series,'--inputs','{"epsilon":0.001}');assert.equal(interpreted.status,0,interpreted.stderr);assert.equal(Number(interpreted.stdout),1.4980214723682874);
 const file=join(folder,'series.mjs'),built=run('tools/workspace.mjs','build',series,'--out',file);assert.equal(built.status,0,built.stderr);const fresh=run('--input-type=module','-e',`const {execute}=await import(${JSON.stringify('file://'+file)});console.log(await execute({epsilon:0.001}));`);assert.equal(fresh.status,0,fresh.stderr);assert.equal(Number(fresh.stdout),Number(interpreted.stdout));
 const app=join(folder,'ui'),build=run('tools/workspace.mjs','application-build',counter,'--out',app);assert.equal(build.status,0,build.stderr);const actual=run('--input-type=module','-e',`const {createRuntime}=await import(${JSON.stringify('file://'+join(app,'application.mjs'))});const r=await createRuntime({policy:${JSON.stringify(policy)}});console.log(await r.dispatch('up','press'));await r.close();`);assert.equal(actual.status,0,actual.stderr);assert.equal(actual.stdout.trim(),'2');assert.ok((await readFile(join(app,'index.html'),'utf8')).includes('./bootstrap.mjs'));
 const invalid=run('tools/workspace.mjs','run',series,'--events','[]');assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/Invalid workspace CLI options/);
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('module symbols preserve the common checker type/value namespaces and algebraic constructors',async()=>{
 const files=sources('@Number(value:Number)->Number{return value;} type Some=Number; @Main(x:Number)->Number{let item:Option<Number>=Some(Number(x));match item{Some(value)=>{return value;},None()=>{return 0;}}}','');
 const bundle=compile(files);assert.equal(await execute(bundle,{x:7}),7);assert.equal(await(await generated(bundle))({x:7}),7);
 const native=compileInstanceModules(sources('@Some{value:Number=1;+Read()->Number{let item:Option<Number>=Some(value);match item{Some(x)=>{return x;},None()=>{return 0;}}}}@Some #counter;',''),'app/main.ems',base);assert.equal(native.module.instances[0].id,'counter');
});

test('native logical owner and self operations retain precedence over similarly named ordinary helpers',async()=>{
 const root='import "../lib/math.ems" as lib; @lib::Counter #counter; @counter.Change(delta:Number)->Number{return 999;} @Invoke()->Number{return counter.Change(1);}';
 const library='export @Counter{value:Number=1;+Change(delta:Number)->Number{value=value+delta;return value;}+Run()->Number{return self.Change(2);}} @self.Change(delta:Number)->Number{return 999;}';
 const compiled=compileInstanceModules(sources(root,library),'app/main.ems',base),owner=await createInstanceSession(compiled.module,base,{policy});try{assert.equal(await owner.dispatch('counter','Run',{}),3);assert.equal(owner.snapshot().counter.value,3);}finally{await owner.close();}
 const local='@Counter{value:Number=1;+Change(delta:Number)->Number{value=value+delta;return value;}+Run()->Number{return Invoke();}} @Counter #counter; @counter.Change(delta:Number)->Number{return 999;} @Invoke()->Number{return counter.Change(1);}';
 const second=compileInstanceModules(sources(local,''),'app/main.ems',base),session=await createInstanceSession(second.module,base,{policy});try{assert.equal(await session.dispatch('counter','Run',{}),2);}finally{await session.close();}
});

test('canonical graph kernel contracts retain the same semantics when a source helper has a similar qualified name',async()=>{
 const bundle=compile(sources('@std.program.Result(value:Number)->Number{return 999;} @Main()->Number graph{@std::program::Result #result{value:2;}+ #result;}',''));assert.equal(await execute(bundle),2);assert.equal(await(await generated(bundle))({}),2);
});

test('UI widget identities remain distinct from ordinary module function names',async()=>{
 const root='@Some(value:Number)->Number{return value;} @up()->Number{return 9;} @Counter{value:Number=1;+Read()->Number{return value;}} @Counter #counter; @UI.Column #root{@UI.Button #up{text:"Run";} @UI.Text #label{text:"1";}} up.clicked ~> counter.Read();';
 const compiled=compileInstanceModules(sources(root,''),'app/main.ems',base),runtime=await createInstanceUIRuntime(compiled.module,compiled.ui,base,{policy});try{assert.equal(await runtime.dispatch('up','press'),1);assert.equal(runtime.view().children[0].id,'up');}finally{await runtime.close();}
});

test('source-only externs and oversized native identities fail before execution with a precise source file',()=>{
 assert.throws(()=>compile(sources('extern @core.add(a:Number,b:Number)->Number;@Main()->Number{return core.add(1,2);}','')),{code:'MODULE_EXTERN_PROFILE'});
 const path='a'.repeat(100)+'.ems';assert.throws(()=>compileInstanceModules(new Map([[path,'@Counter{value:Number=0;+Read()->Number{return value;}}@Counter #counter;']]),path,base),e=>e.code==='MODULE_SYMBOL_LIMIT'&&e.details.file===path);
});
