import test from 'node:test';import assert from 'node:assert/strict';import {createCoreRegistry} from '../src/reference/registry.mjs';import {parseEMSModule} from '../src/frontend/index.mjs';import {typecheckModule} from '../src/frontend/check.mjs';import {lowerCheckedModule} from '../src/frontend/lower.mjs';import {analyzeControlOrigins,executeIR,serializeIR} from '../src/ir/index.mjs';
function compile(source,registry=createCoreRegistry()){return lowerCheckedModule(typecheckModule(parseEMSModule(source),registry),'main',registry,{profile:'control'});}
const at=(a,fn,path)=>a.nodes.find(n=>n.function===fn&&n.path===path),has=(node,kind)=>node.origins.some(o=>o.kind===kind);
test('origin sidecar follows inputs, calls, assignment and branch control without evaluating host or copying literals',async()=>{let calls=0;const registry=createCoreRegistry().registerAtomic({id:'host.secret',inputs:{},output:'Number',effects:['secret.read'],capabilities:['credentials'],execute:()=>{calls++;return 7;}}),b=compile('fn helper(n:Number)->Number {return n;}fn main(flag:Boolean)->Number {let mut answer=0;let text="PRIVATE_LITERAL_SENTINEL";if flag {answer=helper(host.secret());}else {answer=1;}return answer;}',registry),before=serializeIR(b.ir,b.registry),a=analyzeControlOrigins(b.ir,b.registry);assert.equal(calls,0);assert.equal(a.securityDecision,false);assert.ok(has(at(a,'main','/return'),'effect'));assert.ok(has(at(a,'main','/return'),'capability'));assert.ok(at(a,'main','/body/0').origins.some(o=>o.kind==='input'&&o.function==='main'));assert.ok(!JSON.stringify(a).includes('PRIVATE_LITERAL_SENTINEL'));assert.equal(serializeIR(b.ir,b.registry),before);assert.equal(await executeIR(b.ir,{flag:true},b.registry,{allowedEffects:['secret.read'],capabilities:['credentials']}),7);assert.equal(calls,1);});
test('loop/recursive dependency cycles reach a bounded fixed point and preserve explicit unknown budget',()=>{const b=compile('fn recurse(n:Number)->Number {if n>0 {return recurse(n-1);}return n;}fn main(x:Number)->Number {let mut total=0;while total<x {total=total+1;}return recurse(total);}'),a=analyzeControlOrigins(b.ir,b.registry);assert.ok(has(at(a,'main','/return'),'input'));assert.ok(at(a,'recurse','/return').origins.some(o=>o.function==='main'));const limited=analyzeControlOrigins(b.ir,b.registry,{maxOrigins:1});assert.ok(limited.nodes.some(n=>n.origins.some(o=>o.kind==='unknown'&&o.reason==='origin-budget')));assert.throws(()=>analyzeControlOrigins(b.ir,b.registry,{maxNodes:1}),{code:'ANALYSIS_LIMIT'});assert.throws(()=>analyzeControlOrigins(b.ir,b.registry,{maxBytes:128}),{code:'ANALYSIS_LIMIT'});});

test('sequential and nested exit conditions remain dependencies of later declarations',()=>{
 const b=compile('fn main(secret:Boolean)->Number {{if secret {return 0;}}let answer=1;return answer;}'),a=analyzeControlOrigins(b.ir,b.registry);
 assert.ok(at(a,'main','/body/1').origins.some(o=>o.kind==='input'&&o.path==='/inputs/0'));
 for(const body of ['if outer {if secret {return 0;}}','while outer {if secret {break;}break;}','try {if secret {return 0;}}finally {}']){const nested=compile('fn main(outer:Boolean,secret:Boolean)->Number {'+body+'let answer=1;return answer;}'),analysis=analyzeControlOrigins(nested.ir,nested.registry);assert.ok(at(analysis,'main','/body/1').origins.some(o=>o.kind==='input'&&o.path==='/inputs/1'));}
 assert.deepEqual(analyzeControlOrigins(b.ir,b.registry),a);
 assert.ok(a.nodes.every(n=>n.dependencies.every(id=>a.nodes.some(other=>other.id===id))));
});

test('resource aliases and stream state include written data with explicit shared-state uncertainty',()=>{
 for(const source of [
  'fn main(secret:Number)->Number {using h=resource.cell(0);let alias=h;resource.write(alias,secret);return resource.read(h);}',
  'async fn main(secret:Number)->Number {let s:Stream<Number>=stream.channel(1);await stream.send(s,secret);let item=await stream.next(s);match item {Some(n)=>{return n;},None=>{return 0;}}}'
 ]){
  const b=compile(source),a=analyzeControlOrigins(b.ir,b.registry),output=at(a,'main','/return');
  assert.ok(output.origins.some(o=>o.kind==='input'&&o.function==='main'));
  assert.ok(output.origins.some(o=>o.kind==='unknown'&&o.reason==='shared-state'));
  assert.ok(has(output,'local-effect'));
 }
});

test('containers, algebraic patterns, asynchronous helpers and catch values preserve sources',()=>{
 const fixtures=[
  'fn main(secret:Number)->Number {let list=[secret,0];return list[0];}',
  'fn main(secret:Option<Number>)->Number {match secret {Some(n)=>{return n;},None=>{return 0;}}}',
  'fn main(secret:Option<String>)->Number {match secret {Some("PATTERN_PRIVATE_SENTINEL")=>{return 1;},Some(_)=>{return 2;},None=>{return 0;}}}',
  'async fn helper(n:Number)->Number {return n;}async fn main(secret:Number)->Number {let f=helper(secret);return await f;}',
  'fn main(secret:Number)->Number {try {throw secret;}catch(error:Number){return error;}}'
 ];
 for(const source of fixtures){const b=compile(source),a=analyzeControlOrigins(b.ir,b.registry);assert.ok(at(a,'main','/return').origins.some(o=>o.kind==='input'&&o.function==='main'));if(source.includes('PATTERN_PRIVATE')){assert.ok(!JSON.stringify(a).includes('PATTERN_PRIVATE_SENTINEL'));assert.ok(at(a,'main','/return').origins.some(o=>o.kind==='literal'&&o.path.includes('/pattern/')));}if(source.includes('catch'))assert.ok(at(a,'main','/return').origins.some(o=>o.kind==='unknown'&&o.reason==='exception-path'));}
});

test('budgets bound seed sets, propagation, edges and output; malformed IR and options are refused',()=>{
 const registry=createCoreRegistry().registerAtomic({id:'host.read',inputs:{},output:'Number',effects:['one','two','three'],capabilities:['read'],execute:()=>{throw Error('Must not run');}}),b=compile('fn main()->Number {return host.read();}',registry),a=analyzeControlOrigins(b.ir,b.registry,{maxOrigins:1});
 assert.ok(a.nodes.every(n=>n.origins.length<=1));
 assert.ok(a.nodes.filter(n=>n.origins.some(o=>o.reason==='origin-budget')).every(n=>n.origins.length===1));
 for(const options of [{maxDependencies:1},{maxSteps:1},{maxNodes:1},{maxBytes:128}])assert.throws(()=>analyzeControlOrigins(b.ir,b.registry,options),{code:'ANALYSIS_LIMIT'});
 for(const options of [{maxOrigins:0},{maxSteps:NaN},{maxNodes:1.5},{maxBytes:Infinity}])assert.throws(()=>analyzeControlOrigins(b.ir,b.registry,options),{code:'INVALID_ANALYSIS_OPTION'});
 const invalid=structuredClone(b.ir);invalid.functions[0].body[0].value.type='String';assert.throws(()=>analyzeControlOrigins(invalid,b.registry),{code:'TYPE_MISMATCH'});
});

test('CLI produces the same semantic sidecar without literal payloads and rejects malformed arguments',async()=>{
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{execFile}=await import('node:child_process'),{promisify}=await import('node:util'),run=promisify(execFile),dir=await mkdtemp(join(tmpdir(),'ems-origins-'));
 try{
  const source='fn main(flag:Boolean)->Number {let text="CLI_PRIVATE_SENTINEL";if flag {return 2;}return 3;}',file=join(dir,'program.ems'),out=join(dir,'origins.json');await writeFile(file,source);
  await run(process.execPath,['tools/ems.mjs','module-origins',file,'--entry','main','--out',out]);
  const raw=await readFile(out,'utf8'),b=compile(source);assert.deepEqual(JSON.parse(raw),analyzeControlOrigins(b.ir,b.registry));assert.ok(!raw.includes('CLI_PRIVATE_SENTINEL'));
  await assert.rejects(run(process.execPath,['tools/ems.mjs','module-origins',file,'--entry','main','--out',out,'--execute']),error=>error.code===1&&error.stderr.includes('Use module-origins'));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('semantic occurrences and sibling declarations remain distinct even with shared in-memory expressions',()=>{
 const b=compile('fn main(a:Number,b:Number)->Number {return a+b;}'),expression=b.ir.functions[0].body[0].value;expression.right=expression.left;
 const a=analyzeControlOrigins(b.ir,b.registry),left=at(a,'main','/body/0/value/left'),right=at(a,'main','/body/0/value/right');assert.notEqual(left.id,right.id);assert.deepEqual(left.dependencies,right.dependencies);assert.ok(!at(a,'main','/return').origins.some(o=>o.kind==='input'&&o.path==='/inputs/1'));
 const sibling=compile('fn main(secret:Number,flag:Boolean)->Number {if flag {let x=secret;return x;}else {let x=0;return x;}}'),origins=analyzeControlOrigins(sibling.ir,sibling.registry),first=at(origins,'main','/body/0/then/0'),second=at(origins,'main','/body/0/otherwise/0');assert.equal(first.name,second.name);assert.notEqual(first.id,second.id);assert.ok(first.origins.some(o=>o.kind==='input'&&o.path==='/inputs/0'));assert.ok(!second.origins.some(o=>o.kind==='input'&&o.path==='/inputs/0'));
});
