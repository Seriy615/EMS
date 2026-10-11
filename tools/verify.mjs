#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createCoreRegistry, parseTextEMS, validateGraph, executeGraph, compileStandaloneJS, compiledAtomicManifest, registerCompiledAtomic, registerTrustedJSBindings } from '../src/reference/index.mjs';
import { lowerGraphToIR, serializeIR, parseIR, executeIR, compileIRToJS, graphProvenance } from '../src/ir/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
const root=new URL('../',import.meta.url);
const get=async p=>readFile(new URL(p,root),'utf8');
const readJSON=async p=>JSON.parse(await get(p));
let checks=0;
async function check(desc, fn) { const x=await fn(); assert.ok(x,desc); checks++; console.log('✓',desc); }
const required=['AGENTS.md','.agents/policy.json','PROJECT_GOAL.md','docs/spec/LANGUAGE_SEMANTICS.md','docs/spec/IR.md','schemas/ir.schema.json','docs/qa/PROGRESS.md','docs/spec/EMS_FULL_SPEC.md','docs/plans/ROADMAP.md','docs/qa/ACCEPTANCE.md','tasks/backlog.json'];
for(const f of required) { await stat(new URL(f,root)); await check(`found ${f}`,()=>true); }
const policy=await readJSON('.agents/policy.json');
await check('models exactly Sol 6.1 + Luna 6',()=>policy.agents.approvedDisplayNames.join(',')==='GPT-6.1 Sol,GPT-6 Luna');
await check('fallback disabled',()=>policy.agents.allowImplicitModelFallback===false);
const backlog=await readJSON('tasks/backlog.json');
await check('backlog model policy matches owner',()=>JSON.stringify(backlog.agentPolicy.approved)===JSON.stringify(policy.agents.approvedDisplayNames) && backlog.tasks.every(t=>JSON.stringify(t.ownerModelPolicy)===JSON.stringify(policy.agents.approvedDisplayNames)));
await check('completed tasks have completed dependencies',()=>backlog.tasks.every(t=>t.status!=='DONE' || t.dependsOn.every(id=>backlog.tasks.find(d=>d.id===id)?.status==='DONE')));
const graph=await readJSON('examples/avg5.graph.json');
const registry=createCoreRegistry();
validateGraph(graph,registry); await check('graph validates',()=>true);
const result=await executeGraph(graph,{times:[12.4,11.85,13.2,12.1,14]},registry);
await check('graph computes 12.566...',()=>Math.abs(result-12.566666666666666)<1e-9);
const textGraph=parseTextEMS(await get('examples/avg5.ems'));
const textResult=await executeGraph(textGraph,{times:[12.4,11.85,13.2,12.1,14]},registry);
await check('text and graph agree',()=>textResult===result);
const ir=lowerGraphToIR(graph,registry);
const serialized=serializeIR(ir,registry);
await check('IR roundtrip is canonical',()=>serializeIR(parseIR(serialized,registry),registry)===serialized);
await check('text and graph share semantic IR',()=>serializeIR(lowerGraphToIR(textGraph,registry),registry)===serialized);
await check('graph provenance remains outside IR',()=>!Object.hasOwn(ir,'sourceMap') && graphProvenance(graph,'examples/avg5.graph.json').nodes.total.pointer==='/nodes/0');
const vectors=(await readJSON('tests/fixtures/semantics.json')).vectors;
await check('all core vectors conform through serialized IR and standalone',async()=>{
  for(const vector of vectors){
    const lowered=parseIR(serializeIR(lowerGraphToIR(vector.graph,registry),registry),registry);
    const module=await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(lowered,registry))}`);
    const outcome=async fn=>{try{return {value:await fn()};}catch(e){return {error:e.code,name:e.name,details:e.details};}};
    const reference=await outcome(()=>executeGraph(vector.graph,vector.inputs,registry));
    assert.deepEqual(await outcome(()=>executeIR(lowered,vector.inputs,registry)),reference);
    assert.deepEqual(await outcome(()=>module.execute(vector.inputs)),reference);
    if(vector.expected.error) assert.equal(reference.error,vector.expected.error);
    else assert.deepEqual(reference,{value:vector.expected.value});
  }
  return true;
});
const sealed=compiledAtomicManifest(graph); await check('sealing excludes source graph',()=>sealed.kind==='atomic' && !Object.hasOwn(sealed,'graph'));
const js=compileStandaloneJS(graph,registry);
const runtime=await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(js)}`);
await check('standalone compiled result matches',()=>runtime.execute({times:[12.4,11.85,13.2,12.1,14]})===result);
const sealedReg=createCoreRegistry();
registerCompiledAtomic(sealedReg,sealed,runtime.execute);
const outer=await readJSON('examples/composite-using-atomic.graph.json');
const value=await executeGraph(outer,{times:[12.4,11.85,13.2,12.1,14]},sealedReg);
await check('sealing binds as an atom in composite',()=>Math.abs(value-2*result)<1e-9);
const foreignManifest=await readJSON('examples/external-math.bindings.json');
const jsForeignReg=createCoreRegistry();
await registerTrustedJSBindings(jsForeignReg,foreignManifest,new URL('examples/external-math.mjs',root).href);
const imported=await readJSON('examples/imported-library.graph.json');
await check('library -> atomic contracts -> composite',async ()=> (await executeGraph(imported,{x:12},jsForeignReg))===100);
const spec=await get('docs/spec/EMS_FULL_SPEC.md');
await check('scope covers text + visual',()=>spec.includes('Текстовая форма') && spec.includes('визуальная форма'));
await check('scope covers atomic / composite',()=>spec.includes('Атомарные контракты') && spec.includes('Составные контракты'));
await check('scope covers library import',()=>spec.includes('Импорт библиотек'));
const ast=parseEMSModule(await get('examples/language-core.ems'));
await check('EMS frontend parses located module syntax',()=>ast.schemaVersion==='ems-ast/1' && ast.declarations.length===5 && ast.declarations.every(d=>d.location.start.line>=1));
await check('EMS frontend preserves M0 source syntax',async()=>parseEMSModule(await get('examples/avg5.ems')).declarations[0].name===graph.id);
const checked=typecheckModule(parseEMSModule(await get('examples/avg5.ems')),registry);
const moduleBundle=lowerCheckedModule(checked,graph.id,registry);
await check('typed AST executes through shared IR/runtime',async()=>await executeIR(moduleBundle.ir,{times:[12.4,11.85,13.2,12.1,14]},moduleBundle.registry)===result);
const typedOutput=await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(moduleBundle.ir,moduleBundle.registry))}`);
await check('typed AST standalone matches reference semantics',()=>typedOutput.execute({times:[12.4,11.85,13.2,12.1,14]})===result);
const logCalls=[];
const effectRegistry=createCoreRegistry().registerAtomic({id:'demo.stdout',inputs:{message:'String'},output:'String',effects:['log.write'],capabilities:['stdout.write'],execute:({message})=>{logCalls.push(message);return message;}});
const effectBundle=lowerCheckedModule(typecheckModule(parseEMSModule(await get('examples/effect-text.ems')),effectRegistry),'demo.OrderedLogs',effectRegistry);
await check('textual pure assertion rejects transitive host effects',()=>{
  assert.throws(()=>typecheckModule(parseEMSModule('fn test() -> String requires pure { return demo.stdout("denied"); }'),effectRegistry),{code:'EFFECT_MISMATCH'});return true;
});
await check('effect IR requires grants before any call',async()=>{
  await assert.rejects(executeIR(effectBundle.ir,{},effectBundle.registry),{code:'PERMISSION_DENIED'});assert.deepEqual(logCalls,[]);return true;
});
await check('text effects retain order through IR and reject unsupported compilation',async()=>{
  const restored=parseIR(serializeIR(effectBundle.ir,effectBundle.registry),effectBundle.registry);
  assert.equal(await executeIR(restored,{},effectBundle.registry,{capabilities:['stdout.write'],allowedEffects:['log.write']}),'second');
  assert.deepEqual(logCalls,['first','second']);assert.throws(()=>compileIRToJS(restored,effectBundle.registry),{code:'UNSUPPORTED_TARGET'});return true;
});
console.log(`\nEMS foundation verification passed (${checks} checks). Not production readiness.`);
