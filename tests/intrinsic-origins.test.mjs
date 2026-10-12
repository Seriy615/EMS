import test from 'node:test';import assert from 'node:assert/strict';
import {createCoreRegistry,coreIntrinsic} from '../src/reference/registry.mjs';import {parseEMSModule} from '../src/frontend/index.mjs';import {typecheckModule} from '../src/frontend/check.mjs';import {lowerCheckedModule} from '../src/frontend/lower.mjs';import {classifyControlOrigins,executeIR} from '../src/ir/index.mjs';
const compile=(source,r=createCoreRegistry())=>lowerCheckedModule(typecheckModule(parseEMSModule(source),r),'main',r,{profile:'control'}),policy=sources=>({schemaVersion:'ems-origin-policy/1',sources}),input=(index,classification)=>({kind:'input',function:'main',path:'/inputs/'+index,classification});
test('opaque foreign array mutation never changes an explicitly public input into a disclosed private payload',async()=>{
 const r=createCoreRegistry().registerAtomic({id:'host.mutate',inputs:{values:'NumberArray'},output:'Number',execute:({values})=>{values[0]=987654321;return 0;}}),b=compile('fn main(values:Number[])->Number {let mut ignored=host.mutate(values);return ignored;}',r),events=[];await executeIR(b.ir,{values:[1]},b.registry,{inspection:{allow:[{function:'main',names:['values']}],originPolicy:policy([input(0,'public')])},onControlExit:e=>events.push(e)});assert.ok(!JSON.stringify(events).includes('987654321'));assert.ok(events.every(e=>e.inspection.variables[0].status==='protected-origins'));
});

test('genuine intrinsic propagates public/private/unknown argument labels; matching name or metadata is insufficient',async()=>{
 const source='fn main(a:Number,b:Number)->Number {let mut result=core.add(a,b);return result;}',b=compile(source),at=p=>classifyControlOrigins(b.ir,b.registry,p).nodes.find(n=>n.path==='/body/0'),pub=policy([input(0,'public'),input(1,'public')]);assert.equal(at(pub).classification,'public');assert.ok(at(pub).reasons.some(r=>r.reason==='verified-intrinsic'));assert.equal(at(policy([input(0,'public'),input(1,'private')])).classification,'private');assert.equal(at(policy([input(0,'public')])).classification,'unknown');
 const genuine=b.registry.resolve('core.add');b.registry.items.set('core.add',Object.freeze({...genuine,execute:()=>12345}));assert.equal(coreIntrinsic(b.registry.resolve('core.add')),null);assert.equal(at(pub).classification,'unknown');
 b.registry.items.set('core.add',Object.freeze({...genuine,emitJS:()=>'(12345)'}));assert.equal(at(pub).classification,'unknown');b.registry.items.set('core.add',Object.freeze({...genuine,interfaceBoundary:{}}));assert.equal(at(pub).classification,'unknown');
});

test('diagnostics pin certified implementation references before callbacks can replace a registry entry',async()=>{
 const b=compile('fn main(a:Number,b:Number)->Number {let mut result=core.add(a,b);return result;}'),pub=policy([input(0,'public'),input(1,'public')]),real=b.registry.resolve('core.add'),events=[];let calls=0;
 assert.equal(await executeIR(b.ir,{a:2,b:3},b.registry,{inspection:{allow:[{function:'main',names:['result']}],originPolicy:pub},onControlEnter:()=>{b.registry.items.set('core.add',Object.freeze({...real,execute:()=>{calls++;return 987654321;}}));},onControlExit:e=>events.push(e)}),5);assert.equal(calls,0);assert.equal(events.find(e=>e.kind==='return').inspection.variables[0].value,5);assert.ok(!JSON.stringify(events).includes('987654321'));
});

test('certified aggregate functions preserve argument labels while opaque alias uncertainty dominates wrappers',async()=>{
 const b=compile('fn main(values:Number[])->Number {let mut result=core.sum(std.array.reverse(values));return result;}'),pub=policy([input(0,'public')]),events=[];assert.equal(classifyControlOrigins(b.ir,b.registry,pub).nodes.find(n=>n.path==='/body/0').classification,'public');assert.equal(await executeIR(b.ir,{values:[2,3]},b.registry,{inspection:{allow:[{function:'main',names:['result']}],originPolicy:pub},onControlExit:e=>events.push(e)}),5);assert.equal(events.find(e=>e.kind==='return').inspection.variables[0].value,5);
});
