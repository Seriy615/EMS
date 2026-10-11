import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createCoreRegistry,coreIntrinsic} from '../src/reference/registry.mjs';
import {STANDARD_CONTRACTS,STANDARD_INTERFACES,standardCatalog} from '../src/stdlib/finite.mjs';
import {lowerGraphToIR,serializeIR,parseIR,executeIR,compileIRToJS} from '../src/ir/index.mjs';
import {ProjectEditor,parseProject} from '../src/studio/project.mjs';
import {compileTextDraft,runTextDraft,compileTextJS} from '../src/studio/text.mjs';
import {createProgramLock,executeLockedIR,registerContractBinding,validateContractInterface} from '../src/contracts/index.mjs';
const registry=createCoreRegistry();
import {vectors} from './fixtures/stdlib-vectors.mjs';
function irFor(id,args){const item=registry.resolve(id);return lowerGraphToIR({schemaVersion:'0.1',id:'test.library',version:'1.0.0',inputs:{},output:{type:item.output},nodes:[{id:'value',uses:id,args:Object.fromEntries(Object.entries(args).map(([key,value])=>[key,{literal:value}]))}],returns:{node:'value'}},registry);}
for(const [id,args,expected] of vectors)test(`${id}: shared IR runtime/serialization and standalone match independent oracle`,async()=>{
 const before=structuredClone(args),ir=irFor(id,args),loaded=parseIR(serializeIR(ir,registry),registry),generated=await import('data:text/javascript,'+encodeURIComponent(compileIRToJS(ir,registry)));
 const direct=registry.resolve(id).execute(args);assert.deepEqual(direct,expected);if(Array.isArray(direct))for(const input of Object.values(args).filter(Array.isArray))assert.notEqual(direct,input);
 assert.deepEqual(await executeIR(ir,{},registry),expected);assert.deepEqual(await executeIR(loaded,{},registry),expected);assert.deepEqual(generated.execute({}),expected);assert.deepEqual(args,before);
});
test('every shipped standard contract has a tested typed pure implementation and genuine intrinsic witness',()=>{
 assert.equal(STANDARD_CONTRACTS.length,36);assert.deepEqual(new Set(vectors.map(([id])=>id)),new Set(STANDARD_CONTRACTS.map(item=>item.id)));
 for(const descriptor of STANDARD_CONTRACTS){const item=registry.resolve(descriptor.id);assert.equal(item.version,'1.0.0');assert.deepEqual(item.effects,[]);assert.deepEqual(item.capabilities,[]);assert.equal(coreIntrinsic(item).abi,'ems-stdlib-finite/1');assert.equal(coreIntrinsic({...item,execute:()=>0}),null);}
});
test('invalid indexing, strict decimal parsing and port types reject identically in both engines',async()=>{
 const failures=[['std.array.at',{values:[],index:0},'INDEX_RANGE'],['std.array.at',{values:[1],index:0.5},'INDEX_RANGE'],['std.array.slice',{values:[1],start:1,end:0},'INDEX_RANGE'],['std.text.slice',{text:'😀',start:0,end:2},'INDEX_RANGE'],...[' 1','0x10','Infinity','NaN','1e309','1junk',''].map(text=>['std.text.toNumber',{text},'NUMBER_FORMAT'])];
 for(const [id,args,code] of failures){const ir=irFor(id,args),compiled=await import('data:text/javascript,'+encodeURIComponent(compileIRToJS(ir,registry)));await assert.rejects(executeIR(ir,{},registry),{code});assert.throws(()=>compiled.execute({}),{code});}
 assert.throws(()=>irFor('std.logic.and',{a:1,b:false}),{code:'TYPE_MISMATCH'});assert.throws(()=>irFor('std.array.append',{values:[1],value:'2'}),{code:'TYPE_MISMATCH'});
});
test('standalone library executes in a new process with no EMS imports or service',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ems-stdlib-'));try{await writeFile(join(dir,'library.mjs'),compileIRToJS(irFor('std.text.slice',{text:'A😀B',start:1,end:2}),registry));await writeFile(join(dir,'run.mjs'),"import {execute} from './library.mjs';console.log(JSON.stringify(execute({})));\n");const child=spawnSync(process.execPath,[join(dir,'run.mjs')],{encoding:'utf8',cwd:dir});assert.equal(child.status,0,child.stderr);assert.equal(JSON.parse(child.stdout),'😀');}finally{await rm(dir,{recursive:true,force:true});}
});
test('standard contracts work in source with loops and array values through existing compiler',async()=>{
 const editor=new ProjectEditor(),draft={source:'fn test(values:Number[])->String {let mut result:Number[]=[];for value in values {if std.number.greater(value,0) {result=std.array.append(result,std.number.round(value));}}return std.text.concat("count=",std.text.fromNumber(std.array.length(result)));}',entry:'test',lowering:'auto'},inputs={values:[-2,1.2,3.9]};assert.equal(await runTextDraft(draft,editor,inputs),'count=2');const compiled=await import('data:text/javascript,'+encodeURIComponent(compileTextJS(draft,editor)));assert.equal(compiled.execute(inputs),'count=2');assert.throws(()=>compileTextDraft({...draft,source:'fn test()->Number {return std.text.length(1);}'},editor),error=>error.code==='TYPE_MISMATCH'&&error.details.location.start.line===1);
});
test('value selection is eager while language if retains lazy branch semantics',async()=>{
 const editor=new ProjectEditor(),draft={source:'fn test()->Number {return std.select.Number(true,5,core.div(1,0));}',entry:'test',lowering:'auto'};await assert.rejects(runTextDraft(draft,editor,{}),{code:'DIV_BY_ZERO'});const compiled=await import('data:text/javascript,'+encodeURIComponent(compileTextJS(draft,editor)));assert.throws(()=>compiled.execute({}),{code:'DIV_BY_ZERO'});draft.source='fn test()->Number {if true {return 5;}else{return core.div(1,0);}}';assert.equal(await runTextDraft(draft,editor,{}),5);
});
test('dependency lock pins actual standard intrinsic metadata and rejects a replacement callback',async()=>{
 const ir=irFor('std.text.toNumber',{text:'2'}),lock=await createProgramLock(ir,registry,{target:'node-js'});assert.equal(await executeLockedIR(lock,ir,{},registry,{target:'node-js'}),2);const item=registry.resolve('std.text.toNumber');registry.items.set(item.id,Object.freeze({...item,execute:()=>99}));try{await assert.rejects(executeLockedIR(lock,ir,{},registry,{target:'node-js'}));}finally{registry.items.set(item.id,item);}
});

test('standard public interfaces are independent validated IDL and bind with declared error boundaries',async()=>{
 const catalog=standardCatalog();assert.equal(catalog.contracts.length,36);
 for(const item of catalog.contracts){assert.deepEqual(validateContractInterface(item.interface),item.interface);assert.equal(Object.hasOwn(item.interface,'operation'),false);assert.equal(Object.hasOwn(item.interface,'license'),false);}
 const local=createCoreRegistry(),spec=structuredClone(STANDARD_INTERFACES.find(item=>item.id==='std.text.toNumber'));spec.id='public.parse';registerContractBinding(local,spec,{schemaVersion:'ems-contract-binding/1',id:'binding.parse',version:'1.0.0',interface:{id:spec.id,version:spec.version},implementation:{id:'std.text.toNumber',version:'1.0.0'},targets:['node','web'],determinism:'deterministic'},{target:'node'});
 const editor=new ProjectEditor(undefined,local),draft={source:'fn test(text:String)->Number {return public.parse(text);}',entry:'test',lowering:'auto'};assert.equal(await runTextDraft(draft,editor,{text:'1.25'}),1.25);await assert.rejects(runTextDraft(draft,editor,{text:'not decimal'}),{code:'NUMBER_FORMAT'});const compiled=await import('data:text/javascript,'+encodeURIComponent(compileTextJS(draft,editor)));assert.throws(()=>compiled.execute({text:'not decimal'}),{code:'NUMBER_FORMAT'});
});
test('shipped text and persisted Studio library example execute the same application',async()=>{
 const editor=new ProjectEditor(),draft={source:await readFile('examples/stdlib-report.ems','utf8'),entry:'analyze',lowering:'auto'};assert.equal(await runTextDraft(draft,editor,{values:[3,-1,4]}),'sum=6');assert.equal(await new ProjectEditor(parseProject(await readFile('examples/studio-library.ems.json','utf8'))).run(),'sum=6');
});
