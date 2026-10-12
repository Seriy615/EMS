import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeInspectionPolicy,createControlInspector} from '../src/runtime/inspection.mjs';
import {parseEMSModule} from '../src/frontend/index.mjs';
import {typecheckModule} from '../src/frontend/check.mjs';
import {lowerCheckedModule} from '../src/frontend/lower.mjs';
import {executeIR,compileIRToJS} from '../src/ir/index.mjs';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {executeGraph} from '../src/reference/runtime.mjs';
const compile=(source,registry=createCoreRegistry())=>lowerCheckedModule(typecheckModule(parseEMSModule(source),registry),'main',registry,{profile:'control'});
const grant=(names,extra={})=>({allow:[{function:'main',names}],...extra});
const variable=(event,name)=>event.inspection.variables.find(value=>value.name===name);

test('no policy keeps diagnostics payload-free; explicit grants see real pre-operation values without changing IR or compiled output',async()=>{
 const bundle=compile('fn main()->Number {let mut x=0;x=x+1;return x;}'),before=JSON.stringify(bundle.ir),ordinary=[],events=[];
 assert.equal(await executeIR(bundle.ir,{},bundle.registry,{onControlEnter:e=>ordinary.push(e)}),1);assert.ok(ordinary.every(e=>!Object.hasOwn(e,'inspection')));
 assert.equal(await executeIR(bundle.ir,{},bundle.registry,{inspection:grant(['x']),onControlEnter:e=>events.push(e)}),1);
 assert.equal(variable(events[0],'x').status,'not-in-scope');const returned=events.find(e=>e.kind==='return');assert.deepEqual(variable(returned,'x'),{name:'x',type:'Number',status:'value',value:1});assert.ok(returned.frames.length===1);assert.equal(JSON.stringify(bundle.ir),before);
 const independent=await import('data:text/javascript,'+encodeURIComponent(compileIRToJS(bundle.ir,bundle.registry)));assert.equal(await independent.execute({}),1);
});

test('array and nested algebraic snapshots are detached, typed and preserve signed zero',async()=>{
 const bundle=compile('fn main(a:Number[],o:Option<Result<Number,String>>)->Number {let mut x=-0;return core.sum(a);}');let snapshot;
 const input={a:[2,3],o:{tag:'Some',value:{tag:'Ok',value:7}}};assert.equal(await executeIR(bundle.ir,input,bundle.registry,{inspection:grant(['a','o','x']),onControlEnter:e=>{if(e.kind==='return'){snapshot=structuredClone(e.inspection);variable(e,'a').value[0]=100;variable(e,'o').value.value.value=200;}}}),5);
 assert.deepEqual(snapshot.variables.find(v=>v.name==='a').value,[2,3]);assert.deepEqual(input,{a:[2,3],o:{tag:'Some',value:{tag:'Ok',value:7}}});assert.ok(Object.is(snapshot.variables.find(v=>v.name==='x').value,-0));
});

test('ungranted secrets never appear; marked protected function blocks the entire program before any value read',async()=>{
 const bundle=compile('fn child(s:String)->String {return s;} fn main(secret:String,x:Number)->Number {let v=child(secret);return x;}'),inputs={secret:'INSPECTION_PRIVATE_SENTINEL',x:3},events=[];
 assert.equal(await executeIR(bundle.ir,inputs,bundle.registry,{inspection:grant(['x']),onControlEnter:e=>events.push(e)}),3);assert.equal(JSON.stringify(events).includes(inputs.secret),false);
 const protectedEvents=[];assert.equal(await executeIR(bundle.ir,inputs,bundle.registry,{inspection:{allow:[{function:'main',names:['secret','v','x']},{function:'child',names:['s']}],protectedFunctions:['child']},onControlEnter:e=>protectedEvents.push(e)}),3);
 assert.equal(JSON.stringify(protectedEvents).includes(inputs.secret),false);assert.ok(protectedEvents.every(e=>e.inspection.variables.every(v=>v.status==='protected-program'&&!Object.hasOwn(v,'value'))));
});

test('effectful functions are protected even with host execution grants and an explicit variable allowlist',async()=>{
 let calls=0;const registry=createCoreRegistry().registerAtomic({id:'host.secret',inputs:{},output:'String',effects:['secret.read'],capabilities:['credentials'],execute:()=>{calls++;return 'PROTECTED_HOST_SENTINEL';}}),bundle=compile('fn main()->String {let s=host.secret();return s;}',registry),events=[];
 assert.equal(await executeIR(bundle.ir,{},bundle.registry,{allowedEffects:['secret.read'],capabilities:['credentials'],inspection:grant(['s']),onControlEnter:e=>events.push(e)}),'PROTECTED_HOST_SENTINEL');assert.equal(calls,1);assert.equal(JSON.stringify(events).includes('PROTECTED_HOST_SENTINEL'),false);assert.ok(events.every(e=>variable(e,'s').status==='protected-effects'));
});

test('size budgets omit whole values, bound the final snapshot and never return secret prefixes',async()=>{
 const bundle=compile('fn main(s:String,a:Number[])->Number {return core.sum(a);}'),events=[];
 assert.equal(await executeIR(bundle.ir,{s:'LONG_PRIVATE_SENTINEL'.repeat(100),a:[1,2,3]},bundle.registry,{inspection:grant(['s','a'],{maxStringBytes:4,maxArrayItems:2,maxBytes:256}),onControlEnter:e=>events.push(e)}),6);
 assert.ok(events.every(e=>e.inspection.variables.every(v=>v.status==='limit'&&!Object.hasOwn(v,'value'))));assert.ok(events.every(e=>new TextEncoder().encode(JSON.stringify(e.inspection)).length<=256));assert.equal(JSON.stringify(events).includes('LONG_PRIVATE_SENTINEL'),false);
 const many=compile('fn main(a:String,b:String,c:String)->Number {return 0;}'),all=[];await executeIR(many.ir,{a:'a'.repeat(100),b:'b'.repeat(100),c:'c'.repeat(100)},many.registry,{inspection:grant(['a','b','c'],{maxBytes:256}),onControlEnter:e=>all.push(e)});assert.ok(all.every(e=>e.inspection.truncated&&e.inspection.variables.length===1));
});

test('recursive frames, loop, catch and algebraic pattern bindings use the actual lexical scope and declared types',async()=>{
 const bundle=compile('fn recur(n:Number)->Number {if n>0 {return recur(n-1);}return n;} fn main()->Number {let mut sum=0;for x in [1,2] {sum=sum+x;}try {throw 4;} catch(e:Number) {sum=sum+e;}match Some(5) {Some(y)=>{sum=sum+y;} None=>{sum=sum;}}let z=recur(2);return sum+z;}'),events=[];
 assert.equal(await executeIR(bundle.ir,{},bundle.registry,{inspection:{allow:[{function:'main',names:['x','e','y','sum']},{function:'recur',names:['n']}]},onControlEnter:e=>events.push(e)}),12);
 for(const name of ['x','e','y']){const actual=events.flatMap(e=>e.inspection.variables).find(v=>v.name===name&&v.status==='value');assert.equal(actual.type,'Number');}
 const recursive=events.filter(e=>e.function==='recur'&&e.kind==='if');assert.deepEqual(recursive.map(e=>variable(e,'n').value),[2,1,0]);assert.equal(new Set(recursive.map(e=>e.frames.at(-1))).size,3);
});

test('future, stream and resource-containing types are excluded and policy validation precedes execution',async()=>{
 const bundle=compile('async fn child()->Number {return 3;} fn peek(f:Future<Number>,s:Stream<Number>)->Number {return 0;} async fn main()->Number {let f=child();let s:Stream<Number>=stream.channel(1);let ignored=peek(f,s);let x=await f;return x;}'),events=[];
 assert.equal(await executeIR(bundle.ir,{},bundle.registry,{inspection:{allow:[{function:'main',names:['f','s']},{function:'peek',names:['f','s']}]},onControlEnter:e=>events.push(e)}),3);assert.ok(events.flatMap(e=>e.inspection.variables).every(v=>!Object.hasOwn(v,'value')));assert.ok(events.filter(e=>e.function==='peek').every(e=>e.inspection.variables.every(v=>v.status==='protected-effects')));
 let calls=0;const registry=createCoreRegistry().registerAtomic({id:'host.count',inputs:{},output:'Number',execute:()=>++calls}),bad=compile('fn main()->Number {return host.count();}',registry);
 for(const policy of [null,{extra:true},grant(['missing']),{allow:[{function:'absent',names:['x']}]},{protectedFunctions:['absent']},grant(['x','x']),grant(['x'],{maxBytes:1}),grant(['x'],{maxStringBytes:1.5})])await assert.rejects(executeIR(bad.ir,{},bad.registry,{inspection:policy,onControlEnter:()=>{}}),{code:'INVALID_INSPECTION_POLICY'});
 assert.equal(calls,0);const shadow=compile('fn main()->Number {if true {let x=1;}else {let x=2;}return 0;}');await assert.rejects(executeIR(shadow.ir,{},shadow.registry,{inspection:grant(['x']),onControlEnter:()=>{}}),{code:'INVALID_INSPECTION_POLICY'});
});

test('inspection policy is copied, observer mutation/errors cannot change execution, and graph adapter rejection is explicit',async()=>{
 const bundle=compile('fn main(x:Number)->Number {return x;}'),policy=grant(['x']),events=[];assert.equal(await executeIR(bundle.ir,{x:3},bundle.registry,{inspection:policy,onControlEnter:e=>{policy.allow[0].names[0]='missing';events.push(e);if(variable(e,'x')?.status==='value'){variable(e,'x').value=99;throw Error('observer');}}}),3);assert.ok(events.every(e=>e.inspection.variables[0].name==='x'));
 await assert.rejects(executeIR(bundle.ir,{x:3},bundle.registry,{inspection:grant(['x'])}),{code:'INVALID_INSPECTION_POLICY'});
 const graph={schemaVersion:'0.1',id:'test.Inspect',version:'1.0.0',inputs:{},output:{type:'Number'},nodes:[{id:'n',uses:'core.add',args:{a:{literal:1},b:{literal:2}}}],returns:{node:'n'}};await assert.rejects(executeGraph(graph,{},createCoreRegistry(),{inspection:{}}),{code:'UNSUPPORTED_INSPECTION_PROFILE'});
 const registry=createCoreRegistry().registerComposite({id:graph.id,version:graph.version,graph}),mixed=compile('fn main()->Number {let x=test.Inspect();return x;}',registry);assert.equal(await executeIR(mixed.ir,{},mixed.registry,{inspection:grant(['x']),onControlEnter:()=>{}}),3);
 const normalized=normalizeInspectionPolicy(grant(['x']));assert.deepEqual(normalized.allow,[{function:'main',names:['x']}]);
});


test('actual resource handle remains opaque to inspection and the original cleanup still runs',async()=>{
 let releases=0;const registry=createCoreRegistry().registerResource({id:'host.Box',inputs:{},valueType:'Number',effects:[],capabilities:[],acquire:()=>({private:'RESOURCE_PRIVATE_SENTINEL'}),read:()=>5,release:()=>{releases++;}}),bundle=compile('fn peek(h:Option<ResourceHandle<Number>>)->Number {return 0;} fn main()->Number {using h=host.Box();let wrapped=Some(h);let ignored=peek(wrapped);return resource.read(h);}',registry),events=[];
 assert.equal(await executeIR(bundle.ir,{},bundle.registry,{inspection:{allow:[{function:'main',names:['h','wrapped']},{function:'peek',names:['h']}]},onControlEnter:e=>events.push(e)}),5);assert.equal(releases,1);assert.equal(JSON.stringify(events).includes('RESOURCE_PRIVATE_SENTINEL'),false);assert.ok(events.every(e=>e.inspection.variables.every(v=>!Object.hasOwn(v,'value'))));assert.ok(events.filter(e=>e.function==='peek').every(e=>variable(e,'h').status==='protected-effects'));
});


test('snapshot projection does not invoke data getters',()=>{
 const bundle=compile('fn main(a:Number[])->Number {return 0;}'),inspect=createControlInspector(bundle.ir,grant(['a']));let reads=0;const array=[1];Object.defineProperty(array,'0',{get(){reads++;throw Error('PRIVATE_GETTER');}});
 const snapshot=inspect('main',new Map([['a',{type:'NumberArray',value:array}]]));assert.equal(reads,0);assert.equal(snapshot.variables[0].status,'unavailable');assert.equal(JSON.stringify(snapshot).includes('PRIVATE_GETTER'),false);
});


test('inherited inspection grants never activate and accessor policy fields/array entries are rejected without invocation',async()=>{
 const bundle=compile('fn main(secret:String)->Number {return 1;}'),events=[];const inspectionBefore=Object.getOwnPropertyDescriptor(Object.prototype,'inspection'),allowBefore=Object.getOwnPropertyDescriptor(Object.prototype,'allow');
 try{
  Object.defineProperty(Object.prototype,'inspection',{value:grant(['secret']),configurable:true});Object.defineProperty(Object.prototype,'allow',{value:[{function:'main',names:['secret']}],configurable:true});
  assert.equal(await executeIR(bundle.ir,{secret:'PROTOTYPE_PRIVATE_SENTINEL'},bundle.registry,{onControlEnter:e=>events.push(e)}),1);assert.ok(events.every(e=>!Object.hasOwn(e,'inspection')));
  const explicit=[];await executeIR(bundle.ir,{secret:'PROTOTYPE_PRIVATE_SENTINEL'},bundle.registry,{inspection:{},onControlEnter:e=>explicit.push(e)});assert.ok(explicit.every(e=>e.inspection.variables.length===0));
  assert.deepEqual(normalizeInspectionPolicy({}).allow,[]);
 }finally{if(inspectionBefore)Object.defineProperty(Object.prototype,'inspection',inspectionBefore);else delete Object.prototype.inspection;if(allowBefore)Object.defineProperty(Object.prototype,'allow',allowBefore);else delete Object.prototype.allow;}
 let reads=0;const object={};Object.defineProperty(object,'allow',{get(){reads++;throw Error('PRIVATE_POLICY');},enumerable:true});assert.throws(()=>normalizeInspectionPolicy(object),{code:'INVALID_INSPECTION_POLICY'});
 const names=['secret'];Object.defineProperty(names,'0',{get(){reads++;throw Error('PRIVATE_POLICY');}});assert.throws(()=>normalizeInspectionPolicy(grant(names)),{code:'INVALID_INSPECTION_POLICY'});assert.equal(reads,0);
});
