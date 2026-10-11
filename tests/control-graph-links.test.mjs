import test from 'node:test';
import assert from 'node:assert/strict';
import {UIProjectEditor} from '../src/studio/ui-project.mjs';
import {handlerSourceGraph} from '../src/studio/control-graph.mjs';
import {handlerGraphCatalog,connectHandlerGraphPort} from '../src/studio/control-graph-links.mjs';
import {UIRuntime} from '../src/ui/model.mjs';
import {compileUIJS} from '../src/compiler/ui.mjs';
import {fixture,policy} from './helpers/ui-fixture.mjs';
function editor(source){const f=fixture({profile:'control'}),e=new UIProjectEditor(f.application,f.base);e.applyHandler('increment',source,'run');return e;}
function connect(e,source,target,port='value'){const g=handlerSourceGraph(e,'increment');connectHandlerGraphPort(e,'increment',g.source,g.nodes.find(source).id,g.nodes.find(target).id,port);}
async function result(e,grants=policy){const s=new UIRuntime(e.application,e.base,{policy:grants});try{return await s.dispatch('increment','press');}finally{await s.close();}}
test('catalog reports actual installed signatures, policies, kinds and source helper functions without execution',()=>{
 const e=editor('fn helper(x:Number)->Number{return x*2;} fn run(delta:Number)->Number{return state.count.write(helper(delta));}');let calls=0;e.base.registerResource({id:'host.cell',inputs:{value:'Number'},valueType:'Number',acquire:()=>++calls,read:x=>x,release:()=>{}});
 const catalog=handlerGraphCatalog(e,'increment');assert.equal(catalog.find(item=>item.id==='state.count.write').inputs[0].type,'Number');assert.deepEqual(catalog.find(item=>item.id==='state.count.read').capabilities,['state.read']);assert.equal(catalog.find(item=>item.id==='helper').kind,'function');assert.equal(catalog.find(item=>item.id==='host.cell').output,'ResourceHandle<Number>');assert.equal(calls,0);
});
test('parameter and computed local connections preserve real runtime/compiler values and binding edges',async()=>{
 const e=editor('fn run(delta:Number)->Number{let next=delta*4;return state.count.write(0);}');connect(e,n=>n.kind==='LetDeclaration',n=>n.contract?.id==='state.count.write');assert.equal(await result(e),4);const g=handlerSourceGraph(e,'increment');assert.ok(g.edges.some(edge=>edge.kind==='binding'));
 const output=await import(`data:text/javascript,${encodeURIComponent(compileUIJS(e.application,e.base))}`),s=output.createRuntime({policy});try{assert.equal(await s.dispatch('increment','press'),4);}finally{await s.close();}
 connect(e,n=>n.kind==='Parameter',n=>n.contract?.id==='state.count.write');assert.equal(await result(e),1);e.undo();assert.equal(await result(e),4);
});
test('connection reuses a computed effectful binding once and rejects copying its call expression',async()=>{
 const f=fixture({profile:'control'});let calls=0;f.base.registerAtomic({id:'host.read',inputs:{},output:'Number',effects:['host.read'],capabilities:['host.read'],execute:()=>++calls});const e=new UIProjectEditor(f.application,f.base);e.applyHandler('increment','fn run(delta:Number)->Number{let value=host.read();return state.count.write(0);}','run');
 connect(e,n=>n.kind==='LetDeclaration',n=>n.contract?.id==='state.count.write');assert.equal(await result(e,{capabilities:[...policy.capabilities,'host.read'],allowedEffects:[...policy.allowedEffects,'host.read']}),1);assert.equal(calls,1);
 const before=e.source;assert.throws(()=>connect(e,n=>n.contract?.id==='host.read',n=>n.contract?.id==='state.count.write'),{code:'INVALID_GRAPH_CONNECTION'});assert.equal(e.source,before);assert.equal(calls,1);
});
test('port wiring rejects wrong types, out-of-scope/sibling/cross-function bindings and stale selection',()=>{
 for(const source of ['fn run(delta:Number)->Number{let value="bad";return state.count.write(0);}','fn run(delta:Number)->Number{if delta>0 {let value=2;}return state.count.write(0);}','fn helper(delta:Number)->Number{let value=2;return value;} fn run(delta:Number)->Number{let value=3;return state.count.write(0);}','fn run(delta:Number)->Number{if delta>0 {let value=2;return value;}else{let value=3;return state.count.write(0);}}']){
  const e=editor(source),before=e.source;assert.throws(()=>connect(e,n=>n.kind==='LetDeclaration',n=>n.contract?.id==='state.count.write'));assert.equal(e.source,before);
 }
 const e=editor('fn run(delta:Number)->Number{return state.count.write(0);}'),g=handlerSourceGraph(e,'increment'),param=g.nodes.find(n=>n.kind==='Parameter'),call=g.nodes.find(n=>n.contract?.id==='state.count.write');assert.throws(()=>connectHandlerGraphPort(e,'increment',g.source,param.id,call.id,'missing'),{code:'INVALID_GRAPH_CONNECTION'});connectHandlerGraphPort(e,'increment',g.source,param.id,call.id,'value');assert.throws(()=>connectHandlerGraphPort(e,'increment',g.source,param.id,call.id,'value'),{code:'STALE_GRAPH'});
});
