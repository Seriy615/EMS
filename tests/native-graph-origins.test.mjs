import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseEMSModule} from '../src/frontend/index.mjs';
import {typecheckModule} from '../src/frontend/check.mjs';
import {lowerCheckedModule} from '../src/frontend/lower.mjs';
import {printControlProgram} from '../src/frontend/print-control.mjs';
import {controlFunctionIdentity} from '../src/ir/control-alpha.mjs';
import {verifyAuthoredProgramGraphs,assertAuthoredData} from '../src/frontend/authored-graphs.mjs';
import {authoredGraphsFor} from '../src/studio/authored-graphs.mjs';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {applyInvariantFlow} from '../src/instances/graph.mjs';
import {compileInstanceSource} from '../src/instances/ui-source.mjs';
import {serializeInstanceModule} from '../src/instances/module.mjs';
import {newInstanceProject,parseInstanceProject,serializeInstanceProject,validateInstanceProject,instanceProjectFlow,applyInstanceProjectFlow,instanceInitial,addInstanceTransition} from '../src/studio/instance-project.mjs';
import {FlowProjectEditor,parseFlowProject} from '../src/studio/flow-project.mjs';
import {renameInstanceField,addInstanceField,removeInstanceField,instanceFieldDependencies} from '../src/studio/instance-fields.mjs';
import {createInstanceUIRuntime} from '../src/instances/ui.mjs';
import {createInstanceSession} from '../src/instances/runtime.mjs';
import {compileInstanceUIJS} from '../src/compiler/instance-ui.mjs';
const base=createCoreRegistry(),policy={capabilities:['state.read','state.write','ui.render'],allowedEffects:['state.read','state.write','ui.render']};
const nativeGraphSource=await readFile(new URL('../examples/native-graph-ui.ems',import.meta.url),'utf8');
const target={kind:'transition',instance:'left',name:'Change'},guard={kind:'invariant',contract:'Counter',id:'nonnegative'};
function editor(p,t=target){const v=instanceProjectFlow(p,t);return new FlowProjectEditor(parseFlowProject(v.source,v.registry,v.options),v.registry,v.options);}
function compile(source,entry='Main'){return lowerCheckedModule(typecheckModule(parseEMSModule(source),base),entry,base,{profile:'control'}).ir;}

test('checking graph bodies does not consume a reusable located AST',()=>{
 const ast=parseEMSModule('@Main()->Number graph {@std.program.Result #answer{value:7;}+ #answer;}'),before=structuredClone(ast);
 const a=typecheckModule(ast,base),b=typecheckModule(ast,base);assert.deepEqual(ast,before);assert.deepEqual(a.graphBodies,b.graphBodies);assert.equal(a.graphBodies.get('Main').nodes[0].id,'answer');
});
test('function witness comparison preserves lexical captures, public ABI and every operation while accepting private alpha renaming',()=>{
 const source='@Main(x:Number)->Number{let mut sum:Number=x;for x in #[1,2]{sum=sum+x;}try{throw "bad";}catch(x:String){if x=="bad"{sum=sum+1;}}finally{sum=sum+1;}let opt:Option<Number>=Some(sum);match opt{Some(found)=>{return found;}None()=>{return 0;}}}';
 const ir=compile(source),printed=printControlProgram(ir,base,{functionNames:new Map(ir.functions.map(f=>[f.id,f.id]))}),again=compile(printed.source);assert.equal(controlFunctionIdentity(ir.functions[0]),controlFunctionIdentity(again.functions[0]));
 for(const change of [f=>f.inputs[0].type='String',f=>f.body[0].mutable=false,f=>f.body[1].body[0].value.value.right.name='sum',f=>f.body[1].iterable.value=[2,1]]){const altered=structuredClone(ir.functions[0]);change(altered);assert.notEqual(controlFunctionIdentity(ir.functions[0]),controlFunctionIdentity(altered));}
 const named=compile('@"for"(b:Number,a:Number)->Number{return b-a;}@Main()->Number{return #"for"(9,4);}');const result=printControlProgram(named,base,{functionNames:new Map(named.functions.map(f=>[f.id,f.id]))});assert.deepEqual(compile(result.source).functions.map(controlFunctionIdentity),named.functions.map(controlFunctionIdentity));
});
test('native source origins retain every authored ID on first open, document reload and both instance implementations without changing semantic IR',()=>{
 const direct=compileInstanceSource(nativeGraphSource),p=newInstanceProject(nativeGraphSource);assert.equal(p.schemaVersion,'ems-instance-project/3');assert.deepEqual(serializeInstanceModule(p.module),serializeInstanceModule(direct.module));assert.deepEqual(p.authoredGraphs.map(r=>r.scope.kind),['body','initializer','invariant','override']);
 const before=serializeInstanceProject(p);for(const q of [p,parseInstanceProject(before)]){const e=editor(q);assert.deepEqual(e.project.graph.nodes.map(n=>n.id),['read','add','write','out']);assert.deepEqual(e.project.contracts.find(c=>c.graph.id===q.module.instances[1].transitions[0].entry).graph.nodes.map(n=>n.id),['read','add','write','out']);assert.deepEqual(editor(q,guard).project.graph.nodes.map(n=>n.id),['compare','out']);assert.doesNotMatch(e.sourceText,/__ems_flow_pc/);}assert.equal(serializeInstanceProject(p),before);
});
test('authoring witnesses reject stale implementations, signatures, pins, connections, duplicate scopes and executable metadata',()=>{
 const p=newInstanceProject(nativeGraphSource);
 for(const mutate of [q=>q.authoredGraphs[0].graphs[0].nodes[1].args.b={literal:9},q=>q.authoredGraphs[0].graphs[0].nodes[1].version='9.0.0',q=>q.authoredGraphs[0].graphs[0].connections.pop(),q=>q.authoredGraphs[0].graphs[0].output.type='String',q=>q.authoredGraphs.push(structuredClone(q.authoredGraphs[0])),q=>q.authoredGraphs[0].scope={kind:'initializer',definition:'Counter',field:'missing'}]){const q=structuredClone(p);mutate(q);assert.throws(()=>validateInstanceProject(q));}
 let calls=0;const q=structuredClone(p);Object.defineProperty(q.authoredGraphs[0].graphs[0],'nodes',{enumerable:true,get(){calls++;return [];}});assert.throws(()=>validateInstanceProject(q),{code:'INVALID_AUTHORED_GRAPH'});assert.equal(calls,0);
 for(const value of [Array(1),(()=>{const a=[];a.push(a);return a;})(),{x:Infinity},new Date()])assert.throws(()=>assertAuthoredData(value));
 const actual=p.module.program,graphs=p.authoredGraphs[0].graphs;assert.equal(verifyAuthoredProgramGraphs(actual,graphs,instanceProjectFlow(p,target).registry,{allowState:true}).size,2);
});
test('field rename/add/removal keeps authored body, guard, initializer and override scopes and rejects removing live references',async()=>{
 let p=newInstanceProject(nativeGraphSource);const archive=p.sourceArchive;p=renameInstanceField(p,'Counter','value','amount');p=addInstanceField(p,'Counter','spare','String','hello');p=removeInstanceField(p,'Counter','spare');p=parseInstanceProject(serializeInstanceProject(p));assert.equal(p.sourceArchive,archive);assert.deepEqual(editor(p).project.graph.nodes.map(n=>n.id),['read','add','write','out']);assert.equal(editor(p,guard).project.graph.nodes[0].args.a.input,'amount');assert.ok(p.authoredGraphs.some(r=>r.scope.kind==='initializer'&&r.scope.field==='amount'));assert.ok(p.authoredGraphs.some(r=>r.scope.kind==='override'&&r.scope.field==='amount'));assert.ok(instanceFieldDependencies(p,'Counter','amount').some(d=>d.kind==='body-graph'));assert.throws(()=>removeInstanceField(p,'Counter','amount'),{code:'FIELD_IN_USE'});
 const r=await createInstanceUIRuntime(p.module,p.ui,base,{policy});assert.equal(await r.dispatch('up','press'),7);await assert.rejects(r.dispatch('fail','press'),{code:'INVARIANT_VIOLATION'});assert.equal(r.snapshot()['left.amount'],7);r.close();
 const changed=instanceInitial(p,'right','amount',8);assert.ok(!changed.authoredGraphs.some(r=>r.scope.kind==='override'));assert.ok(changed.authoredGraphs.some(r=>r.scope.kind==='initializer'));
});
test('field signature capture bridges retain original authored guard IDs in a helper and keep unused data dependencies',async()=>{
 let p=newInstanceProject(nativeGraphSource);const g=p.authoredGraphs.find(r=>r.scope.kind==='invariant').graphs[0];
 // The emitted graph machine contains mutable locals; this name would capture one.
 const ir=p.module.definitions[0].invariants[0].program,fn=ir.functions.find(f=>f.id===ir.entry),capture=fn.body.find(n=>n.kind==='let').name;
 p=addInstanceField(p,'Counter',capture,'Number',99);const record=p.authoredGraphs.find(r=>r.scope.kind==='invariant');assert.equal(record.graphs[0].id,'ems_field_previous');assert.deepEqual(record.graphs[0].nodes,g.nodes);assert.deepEqual(editor(p,guard).project.contracts.find(c=>c.graph.id==='ems_field_previous').graph.nodes,g.nodes);const r=await createInstanceSession(p.module,base,{policy});assert.equal(await r.dispatch('left','Change',{delta:1}),6);r.close();
});
test('normal graph save owns exact nodes and geometry while retaining all other source scopes and independently executable UI behavior',async()=>{
 let p=newInstanceProject(nativeGraphSource),e=editor(p);e.literal('add','b',3);e.move('add',{x:-710,y:241});p=applyInstanceProjectFlow(p,target,e.serialize());assert.ok(!p.authoredGraphs.some(r=>r.scope.kind==='body'));assert.equal(p.authoredGraphs.length,3);p=parseInstanceProject(serializeInstanceProject(p));assert.deepEqual(editor(p).project.canvas.positions.add,{x:-710,y:241});assert.equal(editor(p).project.graph.nodes[1].id,'add');assert.equal(editor(p,guard).project.graph.nodes[0].id,'compare');
 const folder=await mkdtemp(join(tmpdir(),'ems-origin-')),file=join(folder,'application.mjs');await writeFile(file,compileInstanceUIJS(p.module,p.ui));const compiled=await import(pathToFileURL(file));
 for(const create of [o=>createInstanceUIRuntime(p.module,p.ui,base,o),compiled.createRuntime]){const r=await create({policy});assert.equal(await r.dispatch('up','press'),8);assert.equal(r.view().children[0].props.text,'8');r.close();}
 p=addInstanceTransition(p,'Counter','Extra',[],'Number');assert.deepEqual(editor(p).project.graph.nodes.map(n=>n.id),['read','add','write','out']);
});
test('legacy projects remain unchanged and rich signed data in authored native documents survives reload',()=>{
 const legacy=newInstanceProject('@C{x:Number=0;+Run()->Number{return x;}}@C #one;');assert.equal(legacy.schemaVersion,'ems-instance-project/1');assert.deepEqual(parseInstanceProject(serializeInstanceProject(legacy)),legacy);
 const source='@C{+Run()->Map<String,Option<Number>> graph{@std.program.Result #answer{value:Map([["zero",Some(#-0)]]);}+ #answer;}}@C #one;',p=parseInstanceProject(serializeInstanceProject(newInstanceProject(source)));assert.ok(Object.is(p.authoredGraphs[0].graphs[0].nodes[0].args.value.literal.value[0][1].value,-0));assert.equal(editor(p,{kind:'transition',instance:'one',name:'Run'}).project.graph.nodes[0].id,'answer');
});

test('inactive authored state and guard references remain dependencies and survive renaming and capture adaptation',()=>{
 const source='@C{value:Number=1;+Run()->Number graph{@self::value::read #unused{}@std.program.Result #out{value:0;}+ #out;}? guard=@Guard;}@C #one;@Guard(value:Number)->Boolean graph{@std.number.greater #unused{a<=input::value;b:0;}@std.program.Result #out{value:true;}+ #out;}';
 let p=newInstanceProject(source);assert.ok(instanceFieldDependencies(p,'C','value').some(d=>d.kind==='body-graph'&&d.node==='unused'));assert.ok(instanceFieldDependencies(p,'C','value').some(d=>d.kind==='invariant'));assert.throws(()=>removeInstanceField(p,'C','value'),{code:'FIELD_IN_USE'});p=renameInstanceField(p,'C','value','amount');const program=p.module.definitions[0].invariants[0].program,fn=program.functions.find(f=>f.id===program.entry),capture=fn.body.find(n=>n.kind==='let').name;p=addInstanceField(p,'C',capture,'Number',42);assert.ok(instanceFieldDependencies(p,'C','amount').some(d=>d.kind==='invariant'));const graph=authoredGraphsFor(p,{kind:'invariant',definition:'C',id:'guard'})[0];assert.equal(graph.nodes[0].args.a.input,'amount');assert.deepEqual(editor(p,{kind:'transition',instance:'one',name:'Run'}).project.graph.nodes.map(n=>n.id),['unused','out']);assert.ok(serializeInstanceProject(p));
});
test('recursive graph guard arity adaptation keeps its original helper graph and updates exact recursive targets',async()=>{
 const source='@C{value:Number=2;+Run()->Number{return value;}? guard=@Guard;}@C #one;@Guard(value:Number)->Boolean graph{@std.number.lessEqual #check{a<=input::value;b:0;}@std.control.If #fork{condition<=#check;}@std.program.Result #yes{value:true;}@core.sub #decrement{a<=input::value;b:1;}@Guard #again{value<=#decrement;}@std.program.Result #no{value<=#again;}+ #check;#check.next ~> #fork.enter;#fork.yes ~> #yes.enter;#fork.no ~> #decrement.enter;#decrement.next ~> #again.enter;#again.next ~> #no.enter;}';
 let p=newInstanceProject(source);p=addInstanceField(p,'C','spare','String','hello');const graph=authoredGraphsFor(p,{kind:'invariant',definition:'C',id:'guard'})[0];assert.equal(graph.id,'ems_field_previous');assert.equal(graph.nodes.find(n=>n.id==='again').uses,graph.id);p=removeInstanceField(p,'C','spare');assert.ok(serializeInstanceProject(p));const r=await createInstanceSession(p.module,base,{policy});assert.equal(await r.dispatch('one','Run',{}),2);r.close();
});
test('project-level authoring accessors are rejected before getter execution',()=>{
 const p=newInstanceProject(nativeGraphSource);let calls=0;Object.defineProperty(p,'authoredGraphs',{enumerable:true,get(){calls++;return [];}});assert.throws(()=>validateInstanceProject(p),{code:'INVALID_INSTANCE_PROJECT'});assert.equal(calls,0);
});

test('native loop graph keeps the same variable, Boolean fork and value-less iteration contracts across reload and independent execution',async()=>{
 const body=await readFile(new URL('../examples/graph-body.ems',import.meta.url),'utf8'),expected=JSON.parse(await readFile(new URL('../examples/flow-counter.graph.json',import.meta.url),'utf8')),p=parseInstanceProject(serializeInstanceProject(newInstanceProject('@C{+Run(limit:Number)->Number;}@C #one{+Run=@demo::CounterFlow;}'+body))),e=editor(p,{kind:'transition',instance:'one',name:'Run'});assert.deepEqual(e.project.graph,expected);
 const {compileInstanceModuleJS}=await import('../src/instances/compiler.mjs'),folder=await mkdtemp(join(tmpdir(),'ems-origin-loop-')),file=join(folder,'loop.mjs');await writeFile(file,compileInstanceModuleJS(p.module));const compiled=await import(pathToFileURL(file));for(const create of [o=>createInstanceSession(p.module,base,o),compiled.createSession]){const r=await create({policy:{capabilities:[],allowedEffects:[]}});for(const limit of [0,1,4])assert.equal(await r.dispatch('one','Run',{limit}),limit);r.close();}
});
test('origin validation and independent compilation never evaluate graph initializers or invariant predicates',async()=>{
 const {compileInstanceModuleJS}=await import('../src/instances/compiler.mjs');for(const [source,code]of [['@C{x:Number=@Initial;+Run()->Number{return 0;}}@C #one;@Initial()->Number graph{@core.div #divide{a:1;b:0;}@std.program.Result #out{value<=#divide;}+ #divide;#divide.next ~> #out.enter;}','DIV_BY_ZERO'],['@C{+Run()->Number{return 0;}?guard=@Guard;}@C #one;@Guard()->Boolean graph{@std.program.Result #out{value:false;}+ #out;}','INVARIANT_VIOLATION']]){const p=newInstanceProject(source);assert.ok(serializeInstanceProject(p));assert.ok(compileInstanceModuleJS(p.module));await assert.rejects(createInstanceSession(p.module,base,{policy}),{code});}
});
test('rich new fields upgrade legacy guard graph ports while invalid invariant destinations retain typed refusal',()=>{
 let p=newInstanceProject('@C{x:Number=1;+Run()->Number{return x;}?guard=@Guard;}@C #one;@Guard(x:Number)->Boolean graph "ems-contract-flow/1"{@std.program.Result #out{value:true;}+ #out;}');p=addInstanceField(p,'C','bag','Map<String,Number>',{tag:'Map',value:[['zero',-0]]});assert.equal(p.authoredGraphs.find(r=>r.scope.kind==='invariant').graphs[0].schemaVersion,'ems-contract-flow/2');assert.ok(serializeInstanceProject(p));const flow=editor(p,{kind:'invariant',contract:'C',id:'guard'}).serialize();for(const [contract,id]of [['missing','guard'],['C','missing']])assert.throws(()=>applyInvariantFlow(p.module,contract,id,flow),{code:'UNKNOWN_INVARIANT'});
});

test('inactive graph calls retain real helper definitions and their generic specializations without execution or ID collisions',async()=>{
 const source='@C{+Run()->Number graph{@Helper #unused{}@Other #unusedOther{}@std.program.Result #out{value:0;}+ #out;}}@C #one;@Helper()->Number{return core.div(Id(1),Id(0));}@Other()->String{return Id("kept");}@Id<T>(value:T)->T{return value;}';const p=parseInstanceProject(serializeInstanceProject(newInstanceProject(source)));assert.ok(p.module.program.functions.some(f=>f.id==='Helper'));assert.ok(p.module.program.functions.some(f=>f.id==='Other'));assert.equal(new Set(p.module.program.functions.map(f=>f.id)).size,p.module.program.functions.length);const e=editor(p,{kind:'transition',instance:'one',name:'Run'});assert.deepEqual(e.project.graph.nodes.map(n=>n.id),['unused','unusedOther','out']);assert.ok(e.project.contracts.some(c=>c.graph.id==='Helper'));const r=await createInstanceSession(p.module,base,{policy});assert.equal(await r.dispatch('one','Run',{}),0);r.close();
});
