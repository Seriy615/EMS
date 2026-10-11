import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {createStateRegistry} from '../src/runtime/reactor.mjs';
import {parseEMSModule} from '../src/frontend/index.mjs';
import {typecheckModule} from '../src/frontend/check.mjs';
import {lowerCheckedModule} from '../src/frontend/lower.mjs';
import {linkUIApplication,renderUITree,UIRuntime} from '../src/ui/model.mjs';
import {fixture,policy} from './helpers/ui-fixture.mjs';
test('semantic UI runs actual EMS handlers with FIFO committed rendering and isolated state',async()=>{
 const {application,base}=fixture(),runtime=new UIRuntime(application,base,{policy,recordTrace:true}),second=new UIRuntime(application,base,{policy});assert.equal(runtime.view().children[0].props.text,'0');assert.deepEqual(await Promise.all([runtime.dispatch('increment','press'),runtime.dispatch('increment','press')]),[1,2]);assert.equal(runtime.view().children[0].props.text,'2');assert.equal(second.snapshot().count,0);await runtime.dispatch('name','change','<img src=x onerror=alert(1)>');assert.equal(runtime.view().children[3].props.value,'<img src=x onerror=alert(1)>');assert.deepEqual(runtime.trace().map(event=>event.sequence),[0,1,2]);const copy=runtime.snapshot();copy.count=99;assert.equal(runtime.snapshot().count,2);application.ui.root.children[1].events.press.inputs.delta.literal=100;assert.equal(await runtime.dispatch('increment','press'),3);await runtime.close();await second.close();
});
test('UI failure rolls back state, typed event validation and disabled controls prevent execution',async()=>{
 const {application,base}=fixture(),runtime=new UIRuntime(application,base,{policy});await runtime.dispatch('increment','press');await assert.rejects(runtime.dispatch('fail','press'),{code:'DIV_BY_ZERO'});assert.equal(runtime.snapshot().count,1);await assert.rejects(runtime.dispatch('name','change','reject'),{code:'USER_THROW'});assert.equal(runtime.snapshot().name,'EMS');assert.equal(runtime.view().children[0].props.text,'1');await assert.rejects(runtime.dispatch('locked','change','true'),{code:'TYPE_MISMATCH'});await runtime.dispatch('locked','change',true);await assert.rejects(runtime.dispatch('increment','press'),{code:'UI_EVENT_DISABLED'});assert.equal(runtime.snapshot().count,1);await assert.rejects(runtime.dispatch('increment','press',1),{code:'UI_EVENT_DISABLED'});await assert.rejects(runtime.dispatch('nope','press'),{code:'UNKNOWN_EVENT'});await runtime.close();await assert.rejects(runtime.dispatch('increment','press'),{code:'SESSION_CLOSED'});
});
test('UI policy and hidden event dependencies are checked before any host invocation',()=>{
 const {application,base}=fixture();let calls=0;base.registerAtomic({id:'host.read',inputs:{},output:'Number',effects:['io.read'],capabilities:['host.read'],execute:()=>++calls});
 assert.throws(()=>new UIRuntime(application,base,{policy:null}),{code:'INVALID_UI'});
 assert.throws(()=>new UIRuntime(application,base),{code:'PERMISSION_DENIED'});assert.throws(()=>new UIRuntime(application,base,{policy:{capabilities:['ui.render'],allowedEffects:[]}}),{code:'EFFECT_DENIED'});assert.throws(()=>new UIRuntime(application,base,{policy:{capabilities:['ui.render'],allowedEffects:['ui.render']}}),{code:'PERMISSION_DENIED'});
 const registry=createStateRegistry(base,application.reactor.state);application.reactor.handlers.push({event:'hidden',program:lowerCheckedModule(typecheckModule(parseEMSModule('fn hidden()->Number{return host.read();}'),registry),'hidden',registry).ir});assert.throws(()=>new UIRuntime(application,base,{policy}),{code:'PERMISSION_DENIED'});assert.equal(calls,0);
});
test('UI links reject malformed trees, unsupported DOM escapes and mismatched state/event types',()=>{
 const {application,base}=fixture();for(const mutate of [a=>a.ui.root.kind='script',a=>a.ui.root.kind='toString',a=>a.ui.root.children[0].id='root',a=>a.ui.root.props.innerHTML={literal:'<script>'},a=>a.ui.root.children[0].props.text={state:'missing'},a=>a.ui.root.children[0].props.text={state:'count'},a=>a.ui.root.children[1].events.click=a.ui.root.children[1].events.press,a=>a.ui.root.children[1].events.press.inputs.delta={value:true},a=>a.ui.root.children[1].events.press.inputs.extra={literal:1},a=>a.ui.root.children[3].events.change.inputs.name={literal:1},a=>a.ui.root.children[0].children.push(a.ui.root),a=>a.ui.root.extra=true]){const bad=structuredClone(application);mutate(bad);assert.throws(()=>linkUIApplication(bad,base),error=>error.name==='EmsError');}
 const link=linkUIApplication(application,base);assert.throws(()=>renderUITree(link,{count:0}),{code:'UI_BINDING_TYPE'});assert.throws(()=>renderUITree(link,{count:NaN,name:'EMS',locked:false}),{code:'TYPE_MISMATCH'});
});
test('UI cancellation/close preserve committed state and signed zero formatting',async()=>{
 const {application,base}=fixture();application.reactor.state[0].initial=-0;const runtime=new UIRuntime(application,base,{policy});assert.equal(runtime.view().children[0].props.text,'-0');const controller=new AbortController();controller.abort();await assert.rejects(runtime.dispatch('increment','press',undefined,{signal:controller.signal}),{code:'CANCELLED'});assert.ok(Object.is(runtime.snapshot().count,-0));const pending=runtime.dispatch('increment','press');await runtime.close();await assert.rejects(pending,{code:'CANCELLED'});assert.ok(Object.is(runtime.snapshot().count,-0));
});
test('shipped semantic UI counter links saved IR and executes the declared buttons',async()=>{
 const application=JSON.parse(await readFile('examples/ui-counter.json','utf8')),runtime=new UIRuntime(application,createCoreRegistry(),{policy});assert.equal(await runtime.dispatch('increment','press'),1);assert.equal(await runtime.dispatch('increment','press'),2);assert.equal(await runtime.dispatch('decrement','press'),1);assert.equal(runtime.view().children[1].props.text,'1');await runtime.close();
});

test('control event step exhaustion rolls back staged state through the same reactor execution budget',async()=>{
 const {application,base}=fixture(),registry=createStateRegistry(base,application.reactor.state);
 const program=lowerCheckedModule(typecheckModule(parseEMSModule('fn bounded()->Number {state.count.write(99);while true {} return 0;}'),registry),'bounded',registry).ir;
 application.reactor.handlers.push({event:'bounded',program});application.ui.root.children[2].events.press={handler:'bounded',inputs:{}};
 const runtime=new UIRuntime(application,base,{policy});await assert.rejects(runtime.dispatch('fail','press'),{code:'STEP_LIMIT'});assert.equal(runtime.snapshot().count,0);assert.equal(runtime.view().children[0].props.text,'0');await runtime.close();
});
