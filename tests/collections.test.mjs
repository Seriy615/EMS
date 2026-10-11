import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEMSModule} from '../src/frontend/index.mjs';
import {typecheckModule} from '../src/frontend/check.mjs';
import {lowerCheckedModule} from '../src/frontend/lower.mjs';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {ProjectEditor} from '../src/studio/project.mjs';
import {runTextDraft,compileTextJS,projectFromText} from '../src/studio/text.mjs';
import {executeIR,serializeIR,parseIR,compileIRToJS} from '../src/ir/index.mjs';
import {createProgramLock,executeLockedIR} from '../src/contracts/index.mjs';
import {standardCatalog} from '../src/stdlib/finite.mjs';
const editor=new ProjectEditor(),draft=source=>({source,entry:'test',lowering:'auto'});
function lower(source,registry=createCoreRegistry(),options={}){return lowerCheckedModule(typecheckModule(parseEMSModule(source),registry,options),'test',registry);}
const cases=[
 ['async entry inherits normal Future supervision','async fn test(values:Number[])->Number[]{return std.array.map(values,std.number.abs);}',{values:[-2]},[2]],
 ['atomic mapper','fn test(values:Number[])->Number[]{return std.array.map(values,std.number.abs);}',{values:[-3,-0,2]},[3,0,2]],
 ['generic mapper','fn identity<T>(x:T)->T{return x;}fn test(values:Number[])->Number[]{return std.array.map(values,identity);}',{values:[-0,2]},[-0,2]],
 ['filter preserves order and signed zero','fn keep(x:Number)->Boolean{return x>=0;}fn test(values:Number[])->Number[]{return std.array.filter(values,keep);}',{values:[2,-1,-0,0,2]},[2,-0,0,2]],
 ['nested map/filter','fn twice(x:Number)->Number{return x*2;}fn positive(x:Number)->Boolean{return x>0;}fn test(values:Number[])->Number[]{return std.array.filter(std.array.map(values,twice),positive);}',{values:[-2,0,3]},[6]],
 ['empty map skips failing mapper','fn bad(x:Number)->Number{return 1/0;}fn test(values:Number[])->Number[]{return std.array.map(values,bad);}',{values:[]},[]],
 ['mapper loops share ordinary control semantics','fn add(x:Number)->Number{let mut n=0;for v in [1,2,3]{n=n+v;}return x+n;}fn test(values:Number[])->Number[]{return std.array.map(values,add);}',{values:[1,2]},[7,8]],
 ['helper variable hygiene','fn result(x:Number)->Number{return x+1;}fn __ems_collection_0(x:Number)->Number{return x;}fn test(values:Number[])->Number[]{return std.array.map(values,result);}',{values:[1]},[2]],
 ['a source callback named append still resolves as the chosen reference','fn std.array.append(x:Number)->Number{return x+1;}fn test(values:Number[])->Number[]{return std.array.map(values,std.array.append);}',{values:[1]},[2]],
 ['source append shadow cannot replace template semantics','fn std.array.append(a:Number[],value:Number)->Number[]{return [999];}fn test(values:Number[])->Number[]{return std.array.map(values,std.number.abs);}',{values:[-2]},[2]]
];
for(const [name,source,inputs,expected] of cases)test(`typed collection ${name}: runtime serialized IR standalone parity`,async()=>{
 const {ir,registry}=lower(source),snapshot=structuredClone(inputs),module=await import('data:text/javascript,'+encodeURIComponent(compileIRToJS(ir,registry)));assert.equal(ir.schemaVersion,'ems-ir/2');assert.deepEqual(await executeIR(ir,inputs,registry),expected);assert.deepEqual(await executeIR(parseIR(serializeIR(ir,registry),registry),inputs,registry),expected);assert.deepEqual(await module.execute(inputs),expected);assert.deepEqual(inputs,snapshot);
});
test('static contract references reject strings, wrong types, arity, async and lexical values with source locations',()=>{
 const failures=[['fn test()->Number[]{return std.array.map([1],"std.number.abs");}','CONTRACT_REF_REQUIRED'],['fn test()->Number[]{return std.array.map([1]);}','CALL_ARITY'],['fn test()->Number[]{return std.array.map([1],core.add);}','CALL_ARITY'],['fn f(x:String)->Number{return 1;}fn test()->Number[]{return std.array.map([1],f);}','TYPE_MISMATCH'],['fn f(x:Number)->Boolean{return true;}fn test()->Number[]{return std.array.map([1],f);}','TYPE_MISMATCH'],['fn f(x:Number)->Number{return x;}fn test()->Number[]{return std.array.filter([1],f);}','TYPE_MISMATCH'],['async fn f(x:Number)->Number{return x;}fn test()->Number[]{return std.array.map([1],f);}','TYPE_MISMATCH'],['fn f(x:Number)->Number{return x;}fn test()->Number[]{let f=1;return std.array.map([1],f);}','CONTRACT_REF_REQUIRED']];
 for(const [source,code] of failures)assert.throws(()=>lower(source),error=>error.code===code&&error.details.location.start.line===1,source);
});
test('effects/capabilities including transitive hidden and local resource effects reject before invocation',()=>{
 let calls=0;const registry=createCoreRegistry().registerAtomic({id:'host.value',inputs:{value:'Number'},output:'Number',effects:['io.read'],capabilities:['host.read'],execute:()=>++calls});assert.throws(()=>lower('fn mapper(x:Number)->Number{return host.value(x);}fn test()->Number[]{return std.array.map([],mapper);}',registry),{code:'COLLECTION_EFFECT'});assert.equal(calls,0);
 registry.registerComposite({id:'user.hidden',graph:{schemaVersion:'0.1',id:'user.hidden',version:'1.0.0',inputs:{value:{type:'Number'}},output:{type:'Number'},nodes:[{id:'unused',uses:'host.value',args:{value:{input:'value'}}}],returns:{input:'value'}}});assert.throws(()=>lower('fn test()->Number[]{return std.array.map([],user.hidden);}',registry),{code:'COLLECTION_EFFECT'});assert.equal(calls,0);
 assert.throws(()=>lower('fn mapper(x:Number)->Number{let cell=resource.cell(x);return resource.read(cell);}fn test()->Number[]{return std.array.map([],mapper);}'),{code:'COLLECTION_EFFECT'});
});
test('source normalization is non-mutating, preserves untouched AST identities and supplies real located applications',()=>{
 const registry=createCoreRegistry(),plain=parseEMSModule('fn test()->Number{return 1;}');assert.equal(typecheckModule(plain,registry).ast,plain);const ast=parseEMSModule('fn test()->Number[]{return std.array.map([1],std.number.abs);}'),before=structuredClone(ast),checked=typecheckModule(ast,registry);assert.deepEqual(ast,before);assert.notEqual(checked.ast,ast);assert.equal(checked.collectionApplications.length,1);assert.equal(checked.collectionApplications[0].callback,'std.number.abs');assert.equal(checked.collectionApplications[0].location.start.line,1);
});
test('import aliases resolve template and callback namespaces while std aliases cannot hijack generated append',async()=>{
 const source='import "stdlib" as std;import "collections" as list;fn test()->Number[]{return list.map([-2],std.abs);}',{ir,registry}=lower(source,createCoreRegistry(),{imports:new Map([['stdlib','std.number'],['collections','std.array']])});assert.deepEqual(await executeIR(ir,{},registry),[2]);
});
test('mapper work shares step/depth budgets and cancellation with matched standalone failures',async()=>{
 const source='fn mapper(x:Number)->Number{let mut n=0;while n<1000 {n=n+1;}return x;}fn test()->Number[]{return std.array.map([1,2,3],mapper);}',{ir,registry}=lower(source),module=await import('data:text/javascript,'+encodeURIComponent(compileIRToJS(ir,registry)));
 for(const options of [{maxSteps:20},{maxDepth:1}]){let actual;try{await executeIR(ir,{},registry,options);}catch(error){actual=error;}assert.ok(actual);assert.throws(()=>module.execute({},options),error=>error.code===actual.code&&JSON.stringify(error.details)===JSON.stringify(actual.details));}
 const abort=new AbortController();abort.abort();await assert.rejects(executeIR(ir,{},registry,{signal:abort.signal}),{code:'CANCELLED'});assert.throws(()=>module.execute({},{signal:abort.signal}),{code:'CANCELLED'});
});
test('mapper typed throws retain payload/catch and failure stops later elements in shared IR',async()=>{
 const source='fn mapper(x:Number)->Number{if x==2 {throw "stop";}return x;}fn test()->Number[]{try{return std.array.map([1,2,3],mapper);}catch(error:String){return [9];}}';assert.deepEqual(await runTextDraft(draft(source),editor,{}),[9]);const module=await import('data:text/javascript,'+encodeURIComponent(compileTextJS(draft(source),editor)));assert.deepEqual(module.execute({}),[9]);
});
test('collection callback references survive lock pins and unsupported visual conversion is explicit',async()=>{
 const source='fn test()->Number[]{return std.array.map([-2],std.number.abs);}',{ir,registry}=lower(source),lock=await createProgramLock(ir,registry,{target:'node'});assert.deepEqual(await executeLockedIR(lock,ir,{},registry,{target:'node'}),[2]);const original=registry.resolve('std.number.abs');registry.items.set(original.id,Object.freeze({...original,execute:()=>99}));await assert.rejects(executeLockedIR(lock,ir,{},registry,{target:'node'}));assert.throws(()=>projectFromText(draft(source),editor,{}),{code:'UNSUPPORTED_VISUAL_PROFILE'});assert.equal(standardCatalog().templates.length,2);
});

test('registered composite callback uses actual typed graph implementation and exact serialized pins',async()=>{
 const registry=createCoreRegistry().registerComposite({id:'user.double',graph:{schemaVersion:'0.1',id:'user.double',version:'1.0.0',inputs:{value:{type:'Number'}},output:{type:'Number'},nodes:[{id:'mul',uses:'core.mul',args:{a:{input:'value'},b:{literal:2}}}],returns:{node:'mul'}}});const {ir}=lower('fn test()->Number[]{return std.array.map([1,3],user.double);}',registry),compiled=await import('data:text/javascript,'+encodeURIComponent(compileIRToJS(ir,registry)));assert.deepEqual(await executeIR(ir,{},registry),[2,6]);assert.deepEqual(compiled.execute({}),[2,6]);const saved=serializeIR(ir,registry),item=registry.resolve('user.double');registry.items.set(item.id,{...item,version:'2.0.0'});assert.throws(()=>parseIR(saved,registry),{code:'CONTRACT_VERSION'});
});
