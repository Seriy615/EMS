import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {addInstanceField,renameInstanceField,removeInstanceField,instanceFieldDependencies} from '../src/studio/instance-fields.mjs';
import {newInstanceProject,serializeInstanceProject,parseInstanceProject,instanceProjectFlow,applyInstanceProjectFlow,instanceInitial} from '../src/studio/instance-project.mjs';
import {FlowProjectEditor,parseFlowProject} from '../src/studio/flow-project.mjs';
import {createInstanceSession} from '../src/instances/runtime.mjs';
import {createInstanceUIRuntime} from '../src/instances/ui.mjs';
import {compileInstanceModuleJS} from '../src/instances/compiler.mjs';
import {compileInstanceUIJS} from '../src/compiler/instance-ui.mjs';
import {validateInstanceProject} from '../src/studio/instance-project.mjs';
import {instanceSlot} from '../src/instances/names.mjs';
const source=await readFile(new URL('../examples/native-ui.ems',import.meta.url),'utf8');
const policy={capabilities:['state.read','state.write','ui.render'],allowedEffects:['state.read','state.write','ui.render']};
const literal=(type,value)=>({kind:'literal',type,value}),local=(name,type='Number')=>({kind:'local',type,name});
const binary=(operator,left,right,type='Boolean')=>({kind:'binary',type,operator,left,right});
function guard(p){return p.module.definitions[0].invariants[0].program;}
function entry(p){const ir=guard(p);return ir.functions.find(f=>f.id===ir.entry);}
async function standalone(code){const dir=await mkdtemp(join(tmpdir(),'ems-fields-')),file=join(dir,'app.mjs');await writeFile(file,code);return import(pathToFileURL(file));}
function saveGraph(p,target,edit=()=>{}){const view=instanceProjectFlow(p,target),editor=new FlowProjectEditor(parseFlowProject(view.source,view.registry,view.options),view.registry,view.options);if(view.activeContract)editor.openContract(view.activeContract);edit(editor);return applyInstanceProjectFlow(p,target,editor.serialize());}

test('adding typed fields updates every instance without executing initials or predicates and retains independent values',async()=>{
 let p=newInstanceProject('@C{value:Number=1;+Run()->Number{return value;}?value>=0;}@C #left;@C #right{value:5;}');const before=serializeInstanceProject(p);
 p=addInstanceField(p,'C','bag','Map<String,Option<NumberArray>>',{tag:'Map',value:[['zero',{tag:'Some',value:[-0]}]]});
 assert.equal(p.sourceArchive,JSON.parse(before).sourceArchive);assert.equal(p.module.definitions[0].fields.length,2);assert.deepEqual(entry(p).inputs.map(p=>p.name),['value','bag']);
 p=instanceInitial(p,'right','bag',{tag:'Map',value:[]});p=parseInstanceProject(serializeInstanceProject(p));
 const r=await createInstanceSession(p.module,undefined,{policy});assert.ok(Object.is(r.snapshot().left.bag.value[0][1].value[0],-0));assert.deepEqual(r.snapshot().right.bag,{tag:'Map',value:[]});r.close();
 const invalid=newInstanceProject('@C{x:Number=-1;+Run()->Number{return 0;}?x>=0;}@C #one;');const changed=addInstanceField(invalid,'C','title','String','hello');assert.ok(serializeInstanceProject(changed));await assert.rejects(createInstanceSession(changed.module,undefined,{policy}),{code:'INVARIANT_VIOLATION'});
 const badInitial=addInstanceField(newInstanceProject('@C{value:Number=core.div(1,0);+Run()->Number{return value;}}@C #one;'),'C','extra','Number',2);assert.ok(serializeInstanceProject(badInitial));assert.ok(compileInstanceModuleJS(badInitial.module));await assert.rejects(createInstanceSession(badInitial.module,undefined,{policy}),{code:'DIV_BY_ZERO'});
});

test('rename preserves saved body geometry, guard graph ports, per-instance overrides and UI connections in runtime and independent output',async()=>{
 let p=newInstanceProject(source);p.ui.root.children.find(n=>n.id==='up').events.press.inputs.delta={state:'right.value'};
 p=saveGraph(p,{kind:'transition',instance:'left',name:'Change'},e=>{const n=e.workspace.graph.nodes.find(n=>n.uses==='core.add');e.move(n.id,{x:-420,y:350});e.describe(n.id,'Изменить счётчик');});
 p=saveGraph(p,{kind:'invariant',contract:'Counter',id:'invariant_0'},e=>e.move('input:value',{x:-200,y:430}));
 const before=serializeInstanceProject(p),body=JSON.parse(p.bodyGraph),archive=p.sourceArchive;
 p=renameInstanceField(p,'Counter','value','amount');p=parseInstanceProject(serializeInstanceProject(p));
 assert.equal(p.sourceArchive,archive);assert.deepEqual(JSON.parse(p.bodyGraph).canvas,body.canvas);
 const invariant=JSON.parse(p.invariantGraphs[0].flow);assert.deepEqual(invariant.canvas.positions['input:amount'],{x:-200,y:430});assert.ok(!Object.hasOwn(invariant.graph.inputs,'value'));assert.ok(Object.hasOwn(invariant.graph.inputs,'amount'));
 assert.equal(p.module.instances.find(i=>i.id==='right').initials[0].field,'amount');assert.equal(p.ui.root.children.find(n=>n.id==='up').events.press.inputs.delta.state,'right.amount');
 assert.equal(p.ui.root.children.find(n=>n.id==='count').props.text.state,'left.amount');
 for(const create of [o=>createInstanceUIRuntime(p.module,p.ui,undefined,o),(await standalone(compileInstanceUIJS(p.module,p.ui))).createRuntime]){
  const r=await create({policy});assert.equal(await r.dispatch('up','press'),6);assert.deepEqual(r.snapshot(),{'left.amount':6,'right.amount':5});assert.equal(r.view().children[0].props.text,'6');r.close();
 }
 assert.equal(JSON.parse(before).module.definitions[0].fields[0].name,'value');
 assert.deepEqual(new Set(instanceFieldDependencies(p,'Counter','amount').map(d=>d.kind)),new Set(['operation','body-graph','invariant','ui-property','ui-input']));
});

test('removal reports actual dependencies without changing the document and never removes existing graph nodes',()=>{
 const p=newInstanceProject(source),before=serializeInstanceProject(p),deps=instanceFieldDependencies(p,'Counter','value');
 assert.ok(deps.some(d=>d.kind==='operation'&&d.action==='write'&&d.instance==='left'));assert.ok(deps.some(d=>d.kind==='invariant'));assert.ok(deps.some(d=>d.kind==='ui-property'&&d.widget==='count'));
 assert.throws(()=>removeInstanceField(p,'Counter','value'),e=>e.code==='FIELD_IN_USE'&&e.details.dependencies.some(d=>d.state==='left.value'));
 assert.equal(serializeInstanceProject(p),before);
});

test('unused fields can be removed, including the last field, while saved pure guard inputs and existing graphs remain valid',async()=>{
 let p=newInstanceProject('@C{spare:Number=4;+Run()->Number{return 9;}?true;}@C #one;');p=instanceInitial(p,'one','spare',7);
 p=saveGraph(p,{kind:'invariant',contract:'C',id:'invariant_0'});const nodes=JSON.parse(p.invariantGraphs[0].flow).graph.nodes;
 p=removeInstanceField(p,'C','spare');assert.deepEqual(p.module.definitions[0].fields,[]);assert.deepEqual(p.module.instances[0].initials,[]);assert.deepEqual(JSON.parse(p.invariantGraphs[0].flow).graph.nodes,nodes);
 for(const create of [o=>createInstanceSession(p.module,undefined,o),(await standalone(compileInstanceModuleJS(p.module))).createSession]){const r=await create({policy:{capabilities:[],allowedEffects:[]}});assert.equal(await r.dispatch('one','Run',{}),9);assert.deepEqual(r.snapshot(),{one:{}});r.close();}
});

test('new or renamed guard parameters cannot capture pre-existing local bindings',async()=>{
 let p=newInstanceProject('@C{value:Number=1;+Run()->Number{return value;}?value>=0;}@C #one;');
 entry(p).body.unshift({kind:'let',name:'extra',type:'Number',mutable:false,value:literal('Number',7)});entry(p).body[1].value=binary('&&',entry(p).body[1].value,binary('==',local('extra'),literal('Number',7)));
 validateInstanceProject(p);const old=structuredClone(entry(p).body);
 for(const changed of [addInstanceField(p,'C','extra','Number',-99),renameInstanceField(p,'C','value','extra')]){
  const helper=guard(changed).functions.find(f=>f.id!==guard(changed).entry);assert.deepEqual(helper.body,old);
  const r=await createInstanceSession(changed.module,undefined,{policy});assert.equal(await r.dispatch('one','Run',{}),1);r.close();
 }
});

function recursiveFixture(){const p=newInstanceProject('@C{value:Number=3;spare:Number=99;+Run()->Number{return value;}?true;}@C #one;'),ir=guard(p),fn=entry(p);fn.body=[{kind:'if',condition:binary('<=',local('value'),literal('Number',0)),then:[{kind:'return',value:literal('Boolean',true)}],otherwise:[{kind:'return',value:{kind:'call',type:'Boolean',target:{kind:'function',id:ir.entry},arguments:[binary('-',local('value'),literal('Number',1),'Number'),literal('Number',42)]}}]}];validateInstanceProject(p);return p;}

test('field signature changes preserve recursive guard calls and share the existing runtime/compiler budget',async()=>{
 let p=recursiveFixture();p=addInstanceField(p,'C','caption','String','new');p=removeInstanceField(p,'C','spare');p=renameInstanceField(p,'C','value','amount');
 for(const create of [o=>createInstanceSession(p.module,undefined,o),(await standalone(compileInstanceModuleJS(p.module))).createSession]){const r=await create({policy});assert.equal(await r.dispatch('one','Run',{}),3);assert.deepEqual(r.snapshot(),{one:{amount:3,caption:'new'}});r.close();await assert.rejects(create({policy,maxSteps:1}),{code:'STEP_LIMIT'});}
});

test('unused saved helper graph state calls remain dependencies and can be renamed without geometry loss',()=>{
 let p=newInstanceProject('@C{spare:Number=1;+Run()->Number{return 0;}}@C #one;');let target;
 p=saveGraph(p,{kind:'transition',instance:'one',name:'Run'},e=>{e.createContract('user.Unused');e.openContract('user.Unused');const node=e.add('state.'+instanceSlot('one','spare')+'.read');e.move(node,{x:702,y:-401});target=node;});
 assert.ok(instanceFieldDependencies(p,'C','spare').some(d=>d.kind==='body-graph'&&d.graph==='user.Unused'&&d.node===target));assert.throws(()=>removeInstanceField(p,'C','spare'),{code:'FIELD_IN_USE'});
 p=renameInstanceField(p,'C','spare','saved');const graph=JSON.parse(p.bodyGraph).contracts.find(c=>c.graph.id==='user.Unused');assert.deepEqual(graph.canvas.positions[target],{x:702,y:-401});assert.equal(graph.graph.nodes.find(n=>n.id===target).uses,'state.'+instanceSlot('one','saved')+'.read');
});

test('field operations reject invalid names, conflicting members and wrong values atomically',()=>{
 const p=newInstanceProject(source),before=serializeInstanceProject(p);
 for(const name of ['value','Change','self','ems_private','for','a.b',''])assert.throws(()=>addInstanceField(p,'Counter',name,'Number',0));
 assert.throws(()=>addInstanceField(p,'Counter','newValue','Number','text'),{code:'TYPE_MISMATCH'});assert.throws(()=>addInstanceField(p,'Counter','newValue','Unknown',0));
 assert.throws(()=>renameInstanceField(p,'Counter','value','Change'));assert.throws(()=>renameInstanceField(p,'Counter','missing','newValue'));assert.throws(()=>removeInstanceField(p,'Missing','value'));
 assert.equal(serializeInstanceProject(p),before);assert.deepEqual(renameInstanceField(p,'Counter','value','value'),p);
});

test('shadowed loop and catch bindings do not create false field dependencies or change meaning on rename',async()=>{
 for(const body of [
  [{kind:'for',binding:'spare',iterable:literal('NumberArray',[2]),body:[{kind:'expression',value:local('spare')}]},{kind:'return',value:literal('Boolean',true)}],
  [{kind:'try',body:[{kind:'throw',value:literal('Number',2)}],handler:{binding:'spare',type:'Number',body:[{kind:'return',value:binary('==',local('spare'),literal('Number',2))}]},finalizer:null}]
 ]){
  let p=newInstanceProject('@C{spare:Number=99;+Run()->Number{return 0;}?true;}@C #one;');entry(p).body=body;guard(p).profile='ems-control-algebraic/1';validateInstanceProject(p);
  assert.deepEqual(instanceFieldDependencies(p,'C','spare'),[]);
  for(const changed of [removeInstanceField(p,'C','spare'),renameInstanceField(p,'C','spare','other')]){const r=await createInstanceSession(changed.module,undefined,{policy});assert.equal(await r.dispatch('one','Run',{}),0);r.close();}
 }
});

test('prototype-shaped field names remain ordinary data and renaming one definition does not affect another',async()=>{
 let p=newInstanceProject('@C{value:Number=1;+Run()->Number{return value;}}@C #one;@D{value:Number=8;+Run()->Number{return value;}}@D #two;');
 p=renameInstanceField(p,'C','value','__proto__');p=addInstanceField(p,'C','constructor','Number',4);p=parseInstanceProject(serializeInstanceProject(p));
 for(const create of [o=>createInstanceSession(p.module,undefined,o),(await standalone(compileInstanceModuleJS(p.module))).createSession]){const r=await create({policy});assert.equal(await r.dispatch('one','Run',{}),1);assert.equal(await r.dispatch('two','Run',{}),8);assert.ok(Object.hasOwn(r.snapshot().one,'__proto__'));assert.equal(r.snapshot().one.__proto__,1);assert.equal(r.snapshot().two.value,8);r.close();}
});

test('saved recursive guard call ports track field changes and explicit computed argument links remain deletion dependencies',async()=>{
 let p=newInstanceProject('@C{spare:Number=4;+Run()->Number{return 0;}?true;}@C #one;');let call;
 p=saveGraph(p,{kind:'invariant',contract:'C',id:'invariant_0'},e=>{call=e.add(e.workspace.graph.id);e.literal(call,'spare',8);e.move(call,{x:640,y:480});});
 p=addInstanceField(p,'C','bag','Array<String>',[]);p=renameInstanceField(p,'C','spare','other');
 let graph=JSON.parse(p.invariantGraphs[0].flow),node=graph.graph.nodes.find(n=>n.id===call);assert.ok(!Object.hasOwn(node.args,'spare'));assert.deepEqual(node.args.bag,{literal:[]});assert.equal(node.args.other.literal,8);
 p=removeInstanceField(p,'C','other');graph=JSON.parse(p.invariantGraphs[0].flow);node=graph.graph.nodes.find(n=>n.id===call);assert.deepEqual(Object.keys(node.args),['bag']);assert.deepEqual(graph.canvas.positions[call],{x:640,y:480});
 const r=await createInstanceSession(p.module,undefined,{policy});assert.equal(await r.dispatch('one','Run',{}),0);r.close();
 p=saveGraph(p,{kind:'invariant',contract:'C',id:'invariant_0'},e=>e.connect({kind:'value',ref:{input:'bag'}},{kind:'value',node:call,port:'bag'}));
 assert.throws(()=>removeInstanceField(p,'C','bag'),{code:'FIELD_IN_USE'});
});
