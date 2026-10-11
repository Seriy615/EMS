import test from 'node:test';
import assert from 'node:assert/strict';
import {UIProjectEditor,UIProjectStorage} from '../src/studio/ui-project.mjs';
import {handlerSourceGraph,replaceHandlerGraphNode} from '../src/studio/control-graph.mjs';
import {compileUIJS} from '../src/compiler/ui.mjs';
import {UIRuntime} from '../src/ui/model.mjs';
import {fixture,policy} from './helpers/ui-fixture.mjs';
const source='fn scale(x:Number)->Number {return x*2;} fn run(delta:Number)->Number {let mut next=state.count.read();if delta>0 {for n in [delta] {next=next+scale(n);}}else {next=next+delta;}return state.count.write(next);}';
function editor(){const {application,base}=fixture({profile:'control'}),e=new UIProjectEditor(application,base);e.applyHandler('increment',source,'run');return e;}
test('control graph projects typed scopes/branches/sequences/local calls and atomic interfaces',()=>{
 const e=editor(),g=handlerSourceGraph(e,'increment');assert.equal(g.source,source);assert.ok(g.nodes.some(n=>n.kind==='IfStatement'));assert.ok(g.nodes.some(n=>n.kind==='ForStatement'));assert.ok(g.edges.some(edge=>edge.kind==='next'));assert.ok(g.edges.some(edge=>edge.kind==='call'&&edge.label==='scale'));
 const read=g.nodes.find(n=>n.contract?.id==='state.count.read');assert.equal(read.contract.kind,'atomic');assert.equal(read.type,'Number');assert.deepEqual(read.contract.effects,['state.read']);assert.equal(g.edges.filter(edge=>edge.to===read.id&&edge.kind==='data').length,0);assert.ok(g.edges.some(edge=>edge.from===read.id&&edge.kind==='data'));
 for(const node of g.nodes)assert.equal(source.slice(node.location.start.offset,node.location.end.offset),node.text);
});
test('visual node edit recompiles actual helper IR, persists witness, undoes and exports equivalent behavior',async()=>{
 const e=editor(),graph=handlerSourceGraph(e,'increment'),node=graph.nodes.find(n=>n.kind==='LiteralExpression'&&n.text==='2');replaceHandlerGraphNode(e,'increment',graph.source,node.id,'3');assert.match(e.sources.increment.source,/x\*3/);
 const output=await import(`data:text/javascript,${encodeURIComponent(compileUIJS(e.application,e.base))}`),compiled=output.createRuntime({policy}),runtime=new UIRuntime(e.application,e.base,{policy});assert.equal(await runtime.dispatch('increment','press'),3);assert.equal(await compiled.dispatch('increment','press'),3);await runtime.close();await compiled.close();
 const data=new Map(),storage=new UIProjectStorage({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},e.base);storage.save(e.application,{sources:e.sources});const w=storage.loadWorkspace(),reopened=new UIProjectEditor(w.application,e.base,{sources:w.sources});assert.equal(handlerSourceGraph(reopened,'increment').source,e.sources.increment.source);
 e.undo();assert.equal(e.sources.increment.source,source);e.redo();assert.match(e.sources.increment.source,/x\*3/);
});
test('invalid or stale graph node edits preserve source/history/IR and reject supplied fake IDs',()=>{
 const e=editor(),graph=handlerSourceGraph(e,'increment'),node=graph.nodes.find(n=>n.kind==='LiteralExpression'&&n.text==='2'),before=e.source,history=e.history.length;
 assert.throws(()=>replaceHandlerGraphNode(e,'increment',graph.source,node.id,'"wrong"'),{code:'TYPE_MISMATCH'});assert.equal(e.source,before);assert.equal(e.history.length,history);
 assert.throws(()=>replaceHandlerGraphNode(e,'increment',graph.source,'../../source','3'),{code:'UNKNOWN_GRAPH_NODE'});
 replaceHandlerGraphNode(e,'increment',graph.source,node.id,'4');const changed=e.source;assert.throws(()=>replaceHandlerGraphNode(e,'increment',graph.source,node.id,'5'),{code:'STALE_GRAPH'});assert.equal(e.source,changed);
});
test('graphs preserve nested errors and async source while refusing synthetic collection projections and missing witnesses',()=>{
 const e=editor();e.applyHandler('increment','async fn run(delta:Number)->Number {try{return state.count.write(delta);}catch(error:String){throw error;}finally{state.count.read();}}','run');const g=handlerSourceGraph(e,'increment');for(const kind of ['TryStatement','CatchClause','ThrowStatement'])assert.ok(g.nodes.some(n=>n.kind===kind));
 e.applyHandler('increment','fn square(x:Number)->Number{return x*x;} fn run(delta:Number)->Number {let values=std.array.map([delta],square);return state.count.write(values[0]);}','run');assert.throws(()=>handlerSourceGraph(e,'increment'),{code:'UNSUPPORTED_VISUAL_PROFILE'});
 const missing=fixture({profile:'control'});assert.throws(()=>handlerSourceGraph(new UIProjectEditor(missing.application,missing.base),'increment'),{code:'SOURCE_REQUIRED'});
});
