import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createCoreRegistry, Registry, EmsError, validateGraph, executeGraph, parseTextEMS,
  compileStandaloneJS, compiledAtomicManifest, registerCompiledAtomic, registerTrustedJSBindings
} from '../src/reference/index.mjs';

const fixture = async file => JSON.parse(await readFile(new URL(`../examples/${file}`, import.meta.url), 'utf8'));
const source = async file => readFile(new URL(`../examples/${file}`, import.meta.url), 'utf8');
const approx = (x, y) => assert.ok(Math.abs(x - y) < 1e-9, `expected ${x} approximately ${y}`);
function expectCode(code) { return e => e instanceof EmsError && e.code === code; }

test('AC-001 pure AVG5 arithmetic: expected value', async () => {
  const graph = await fixture('avg5.graph.json');
  const result = await executeGraph(graph, {times: [12.4,11.85,13.2,12.1,14]}, createCoreRegistry());
  approx(result, 12.566666666666666);
});

test('AC-002 textual subset parses to equivalent executable graph', async () => {
  const text = parseTextEMS(await source('avg5.ems'));
  const json = await fixture('avg5.graph.json');
  assert.equal(text.id, json.id);
  const input = {times:[12.4,11.85,13.2,12.1,14]};
  assert.equal(await executeGraph(text,input,createCoreRegistry()), await executeGraph(json,input,createCoreRegistry()));
});

test('AC-003 type mismatch prevented before execution', async () => {
  const graph = await fixture('avg5.graph.json');
  graph.nodes[0].args.values = {literal:'not a numeric array'};
  assert.throws(() => validateGraph(graph,createCoreRegistry()), expectCode('TYPE_MISMATCH'));
});

test('AC-004 nonexistent operation rejected', async () => {
  const graph = await fixture('avg5.graph.json');
  graph.nodes[0].uses = 'nonexistent.contract';
  assert.throws(() => validateGraph(graph,createCoreRegistry()), expectCode('MISSING_CONTRACT'));
});

test('AC-004 circular dependency rejected', async () => {
  const graph = await fixture('avg5.graph.json');
  graph.nodes[0].args.values = {node:'average'};
  assert.throws(() => validateGraph(graph,createCoreRegistry()), e => e instanceof EmsError && ['GRAPH_CYCLE','TYPE_MISMATCH'].includes(e.code));
});

test('AC-005 composite contract is executable inside larger graph', async () => {
  const inner = await fixture('avg5.graph.json');
  const outer = await fixture('composite-using-atomic.graph.json');
  const registry = createCoreRegistry().registerComposite({id:inner.id,graph:inner});
  approx(await executeGraph(outer,{times:[12.4,11.85,13.2,12.1,14]},registry),25.133333333333333);
});

test('AC-006 standalone compiled JS has no EMS runtime dependency and runs', async () => {
  const graph = await fixture('avg5.graph.json');
  const js = compileStandaloneJS(graph, createCoreRegistry());
  assert.doesNotMatch(js, /from ['"]\.\/|import\s/);
  const dir = await mkdtemp(join(tmpdir(),'ems-standalone-'));
  const dest = join(dir,'output.mjs');
  await writeFile(dest, js);
  const mod = await import(pathToFileURL(dest).href);
  approx(mod.execute({times:[12.4,11.85,13.2,12.1,14]}),12.566666666666666);
});

test('AC-006 compiler expands nested pure composite contracts', async () => {
  const inner = await fixture('avg5.graph.json');
  const outer = await fixture('composite-using-atomic.graph.json');
  const registry = createCoreRegistry().registerComposite({id:inner.id,graph:inner});
  const js = compileStandaloneJS(outer,registry);
  const dir = await mkdtemp(join(tmpdir(),'ems-nested-'));
  const dest = join(dir,'nested.mjs');
  await writeFile(dest,js);
  const mod = await import(pathToFileURL(dest).href);
  approx(mod.execute({times:[12.4,11.85,13.2,12.1,14]}),25.133333333333333);
});

test('AC-007 atomic distribution manifest omits source graph', async () => {
  const graph = await fixture('avg5.graph.json');
  const artifact = compiledAtomicManifest(graph);
  assert.equal(artifact.kind,'atomic');
  assert.equal(artifact.sourceVisibility,'opaque');
  assert.equal(artifact.graph,undefined);
  assert.deepEqual(artifact.inputs,{times:'NumberArray'});
  assert.equal(artifact.output,'Number');
});

test('AC-008 compiled atom can be loaded and called from a new graph', async () => {
  const sourceGraph = await fixture('avg5.graph.json');
  const manifest = compiledAtomicManifest(sourceGraph);
  const dir = await mkdtemp(join(tmpdir(),'ems-seal-'));
  const jsFile = join(dir,'module.mjs');
  await writeFile(jsFile,compileStandaloneJS(sourceGraph,createCoreRegistry()));
  const module = await import(pathToFileURL(jsFile).href);
  const registry = createCoreRegistry();
  registerCompiledAtomic(registry,manifest,module.execute);
  const outer = await fixture('composite-using-atomic.graph.json');
  approx(await executeGraph(outer,{times:[12.4,11.85,13.2,12.1,14]},registry),25.133333333333333);
});

test('AC-009 trusted ESM library maps multiple exports to atomic blocks', async () => {
  const manifest = await fixture('external-math.bindings.json');
  const registry = createCoreRegistry();
  await registerTrustedJSBindings(registry,manifest,new URL('../examples/external-math.mjs',import.meta.url).href);
  assert.equal(registry.resolve('demo.math.square').kind,'atomic');
  assert.equal(registry.resolve('demo.math.clamp').kind,'atomic');
  assert.equal(registry.resolve('demo.math.hypotenuse').kind,'atomic');
  const graph = await fixture('imported-library.graph.json');
  assert.equal(await executeGraph(graph,{x:12},registry),100);
  assert.equal(await executeGraph(graph,{x:3},registry),9);
});

test('AC-010 missing capability denies invocation before implementation', async () => {
  const registry = createCoreRegistry();
  let executed = false;
  registry.registerAtomic({id:'demo.camera',inputs:{},output:'Number',capabilities:['camera.capture'],execute:()=>{executed=true;return 1;}});
  const graph = {schemaVersion:'0.1',id:'demo.cap',version:'0.1',inputs:{},output:{type:'Number'},nodes:[{id:'a',uses:'demo.camera',args:{}}],returns:{node:'a'}};
  await assert.rejects(executeGraph(graph,{},registry),expectCode('PERMISSION_DENIED'));
  assert.equal(executed,false);
  assert.equal(await executeGraph(graph,{},registry,{capabilities:['camera.capture']}),1);
});

test('AC-011 compiler rejects effectful operations rather than erasing effects', () => {
  const registry = createCoreRegistry();
  registry.registerAtomic({id:'demo.write',inputs:{value:'Number'},output:'Number',effects:['file.write'],execute:({value})=>value,emitJS:({value})=>value});
  const graph = {schemaVersion:'0.1',id:'demo.effect',version:'0.1',inputs:{x:{type:'Number'}},output:{type:'Number'},nodes:[{id:'a',uses:'demo.write',args:{value:{input:'x'}}}],returns:{node:'a'}};
  assert.throws(()=>compileStandaloneJS(graph,registry),expectCode('UNSUPPORTED_TARGET'));
});

test('reject missing graph input and invalid runtime values', async () => {
  const graph = await fixture('avg5.graph.json');
  await assert.rejects(executeGraph(graph,{},createCoreRegistry()),expectCode('MISSING_INPUT'));
  await assert.rejects(executeGraph(graph,{times:[12,NaN]},createCoreRegistry()),expectCode('TYPE_MISMATCH'));
});

test('division by zero errors in evaluator and standalone output', async () => {
  const graph = {schemaVersion:'0.1',id:'demo.div0',version:'0.1',inputs:{},output:{type:'Number'},nodes:[{id:'a',uses:'core.div',args:{a:{literal:2},b:{literal:0}}}],returns:{node:'a'}};
  await assert.rejects(executeGraph(graph,{},createCoreRegistry()),expectCode('DIV_BY_ZERO'));
  const js=compileStandaloneJS(graph,createCoreRegistry());
  const dir=await mkdtemp(join(tmpdir(),'ems-div0-')); const dest=join(dir,'z.mjs'); await writeFile(dest,js);
  const mod=await import(pathToFileURL(dest).href);
  assert.throws(()=>mod.execute({}),{name:'EmsError',code:'DIV_BY_ZERO'});
});

test('text parser refuses arbitrary JS execution syntax', () => {
  assert.throws(()=>parseTextEMS('contract T(x: Number) -> Number {\n let x = eval(x)\n return x\n}'),e=>e instanceof EmsError);
});
