import test from 'node:test';
import assert from 'node:assert/strict';
import {UIProjectEditor} from '../src/studio/ui-project.mjs';
import {handlerSourceGraph} from '../src/studio/control-graph.mjs';
import {editHandlerGraphNode} from '../src/studio/control-graph-ops.mjs';
import {UIRuntime} from '../src/ui/model.mjs';
import {compileUIJS} from '../src/compiler/ui.mjs';
import {fixture,policy} from './helpers/ui-fixture.mjs';
function editor(source='fn run(delta:Number)->Number {return state.count.write(delta+2);}') {const f=fixture({profile:'control'}),e=new UIProjectEditor(f.application,f.base);e.applyHandler('increment',source,'run');return e;}
function edit(e,predicate,operation){const graph=handlerSourceGraph(e,'increment'),node=graph.nodes.find(predicate);assert.ok(node);editHandlerGraphNode(e,'increment',graph.source,node.id,operation);}
async function value(e){const s=new UIRuntime(e.application,e.base,{policy});try{return await s.dispatch('increment','press');}finally{await s.close();}}
test('structured literal and operator edits preserve typed semantics including signed zero',async()=>{
 const e=editor();edit(e,n=>n.kind==='LiteralExpression',{kind:'literal',value:4});assert.equal(await value(e),5);edit(e,n=>n.kind==='BinaryExpression',{kind:'operator',operator:'*'});assert.equal(await value(e),4);
 const z=editor('fn run(delta:Number)->Number {return state.count.write(0);}');edit(z,n=>n.kind==='LiteralExpression',{kind:'literal',value:-0});assert.ok(Object.is(await value(z),-0));
 const output=await import(`data:text/javascript,${encodeURIComponent(compileUIJS(e.application,e.base))}`),s=output.createRuntime({policy});try{assert.equal(await s.dispatch('increment','press'),4);}finally{await s.close();}
});
test('typed call replacement resolves actual target/arguments and rejects wrong types or syntax injection',async()=>{
 const e=editor();edit(e,n=>n.contract?.id==='state.count.write',{kind:'call',target:'state.count.write',arguments:['delta*3']});assert.equal(await value(e),3);
 const before=e.source;assert.throws(()=>edit(e,n=>n.contract?.id==='state.count.write',{kind:'call',target:'state.count.write',arguments:['"wrong"']}),{code:'TYPE_MISMATCH'});assert.equal(e.source,before);
 assert.throws(()=>edit(e,n=>n.contract?.id==='state.count.write',{kind:'call',target:'state.count.write',arguments:['0);state.count.write(8);return (0']}));assert.equal(e.source,before);
});
test('block insertion/deletion shares lexical checks, updates real execution and supports undo',async()=>{
 const e=editor('fn run(delta:Number)->Number {return state.count.read();}');edit(e,n=>n.kind==='Block',{kind:'insert',index:0,statement:'state.count.write(delta*5);'});assert.equal(await value(e),5);
 edit(e,n=>n.kind==='ExpressionStatement',{kind:'delete'});assert.equal(await value(e),0);e.undo();assert.equal(await value(e),5);
 const before=e.source;assert.throws(()=>edit(e,n=>n.kind==='ReturnStatement',{kind:'delete'}),{code:'MISSING_RETURN'});assert.equal(e.source,before);
 assert.throws(()=>edit(e,n=>n.kind==='Block',{kind:'insert',index:1,statement:'let x=1;let y=2;'}),{code:'INVALID_GRAPH_EDIT'});assert.equal(e.source,before);
});
test('structured graph edit rejects wrong node category, fields, IDs and stale source without history changes',()=>{
 const e=editor(),g=handlerSourceGraph(e,'increment'),literal=g.nodes.find(n=>n.kind==='LiteralExpression'),before=e.source,history=e.history.length;
 for(const op of [{kind:'operator',operator:'='},{kind:'literal',value:true},{kind:'literal',value:3,extra:1},{kind:'delete'},{kind:'unknown'}])assert.throws(()=>editHandlerGraphNode(e,'increment',g.source,literal.id,op));
 assert.equal(e.source,before);assert.equal(e.history.length,history);editHandlerGraphNode(e,'increment',g.source,literal.id,{kind:'literal',value:3});assert.throws(()=>editHandlerGraphNode(e,'increment',g.source,literal.id,{kind:'literal',value:4}),{code:'STALE_GRAPH'});
});
