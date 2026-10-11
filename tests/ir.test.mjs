import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCoreRegistry, parseTextEMS, executeGraph } from '../src/reference/index.mjs';
import { lowerGraphToIR, graphFromIR, serializeIR, parseIR, executeIR, compileIRToJS, graphProvenance } from '../src/ir/index.mjs';

const example = JSON.parse(await readFile(new URL('../examples/avg5.graph.json', import.meta.url), 'utf8'));
const vectors = JSON.parse(await readFile(new URL('./fixtures/semantics.json', import.meta.url), 'utf8')).vectors;
const outcome = async invoke => {
  try { return { value: await invoke() }; }
  catch (error) { return { code: error.code, name: error.name, details: error.details }; }
};

test('AC-026 checked graph/HIR has typed operations with pinned contract versions', () => {
  const registry = createCoreRegistry();
  const ir = lowerGraphToIR(example, registry);
  assert.equal(ir.schemaVersion, 'ems-ir/1');
  assert.equal(ir.profile, 'ems-core-finite/1');
  assert.deepEqual(ir.inputs, [{ name: 'times', type: 'NumberArray' }]);
  assert.ok(ir.operations.every(op => op.type === 'Number' && op.contract.version === '1.0.0'));
  assert.equal(serializeIR(parseIR(serializeIR(ir, registry), registry), registry), serializeIR(ir, registry));
});

test('AC-026 canonical serialization excludes canvas/descriptions and operation storage order', () => {
  const registry = createCoreRegistry();
  const changed = structuredClone(example);
  changed.canvas = { positions: { average: { x: 999, y: -99 } } };
  changed.inputs.times.description = 'different annotation';
  changed.nodes.reverse();
  for (const node of changed.nodes) node.args = Object.fromEntries(Object.entries(node.args).reverse());
  const original = lowerGraphToIR(example, registry);
  assert.equal(serializeIR(lowerGraphToIR(changed, registry), registry), serializeIR(original, registry));
  const sidecar = graphProvenance(changed, 'examples/avg5.graph.json');
  assert.equal(sidecar.nodes.average.pointer, '/nodes/0');
  assert.ok(!Object.hasOwn(original, 'canvas') && !Object.hasOwn(original, 'sourceMap'));
});

test('AC-026 text and visual graph lower to identical semantic artifact', async () => {
  const registry = createCoreRegistry();
  const text = parseTextEMS(await readFile(new URL('../examples/avg5.ems', import.meta.url), 'utf8'));
  assert.equal(serializeIR(lowerGraphToIR(text, registry), registry), serializeIR(lowerGraphToIR(example, registry), registry));
});

for (const vector of vectors) {
  test(`AC-026 IR roundtrip preserves semantics: ${vector.id}`, async () => {
    const registry = createCoreRegistry();
    const ir = parseIR(serializeIR(lowerGraphToIR(vector.graph, registry), registry), registry);
    const original = await outcome(() => executeGraph(vector.graph, vector.inputs, registry));
    assert.deepEqual(await outcome(() => executeIR(ir, vector.inputs, registry)), original);
    const module = await import(`data:text/javascript,${encodeURIComponent(compileIRToJS(ir, registry))}`);
    assert.deepEqual(await outcome(() => module.execute(vector.inputs)), original);
  });
}

for (const [label, mutate, code] of [
  ['version', ir => { ir.schemaVersion = 'ems-ir/999'; }, 'IR_VERSION'],
  ['profile', ir => { ir.profile = 'unknown'; }, 'UNSUPPORTED_PROFILE'],
  ['extra field', ir => { ir.canvas = {}; }, 'INVALID_IR'],
  ['missing field', ir => { delete ir.result; }, 'INVALID_IR'],
  ['duplicate input', ir => { ir.inputs.push(ir.inputs[0]); }, 'INVALID_IR'],
  ['unknown type', ir => { ir.inputs[0].type = 'Float128'; }, 'UNKNOWN_TYPE'],
  ['wrong output', ir => { ir.operations[0].type = 'String'; }, 'TYPE_MISMATCH'],
  ['contract version', ir => { ir.operations[0].contract.version = '9.0.0'; }, 'CONTRACT_VERSION'],
  ['missing contract', ir => { ir.operations[0].contract.id = 'missing.atom'; }, 'MISSING_CONTRACT'],
  ['port order', ir => { ir.operations[0].arguments.reverse(); }, 'INVALID_IR'],
  ['unknown node', ir => { ir.result = { kind: 'node', id: 'missing' }; }, 'UNKNOWN_NODE'],
  ['inherited input name', ir => { ir.result = { kind: 'input', name: 'constructor' }; }, 'UNKNOWN_INPUT'],
  ['cycle', ir => { ir.operations[0].arguments[0].value = { kind: 'node', id: ir.operations[0].id }; }, 'GRAPH_CYCLE'],
  ['literal type lie', ir => { ir.result = { kind: 'literal', type: 'String', value: 1 }; }, 'TYPE_MISMATCH'],
  ['NaN literal', ir => { ir.result = { kind: 'literal', type: 'Number', value: NaN }; }, 'INVALID_IR'],
  ['bad number encoding', ir => { ir.result = { kind: 'literal', type: 'Number', value: '0' }; }, 'INVALID_IR'],
  ['sparse operations', ir => { delete ir.operations[0]; }, 'INVALID_IR']
]) {
  test(`AC-026 reject ${label}`, () => {
    const registry = createCoreRegistry();
    const ir = lowerGraphToIR(example, registry);
    mutate(ir);
    assert.throws(() => graphFromIR(ir, registry), { code });
  });
}

test('AC-026 malformed IR JSON is a structured error', () => {
  assert.throws(() => parseIR('{', createCoreRegistry()), { code: 'INVALID_IR' });
});

test('AC-026 IR rejects effects hidden in a composite', () => {
  const registry = createCoreRegistry().registerAtomic({ id: 'test.write', inputs: {}, output: 'Number',
    effects: ['file.write'], execute: () => 1 });
  const inner = { schemaVersion: '0.1', id: 'test.inner', version: '1.0.0', inputs: {}, output: { type: 'Number' },
    nodes: [{ id: 'write', uses: 'test.write', args: {} }], returns: { node: 'write' } };
  registry.registerComposite({ id: inner.id, graph: inner });
  const outer = { ...inner, id: 'test.outer', nodes: [{ id: 'inner', uses: inner.id, args: {} }], returns: { node: 'inner' } };
  assert.throws(() => lowerGraphToIR(outer, registry), { code: 'UNSUPPORTED_PROFILE' });
});

test('AC-026 CLI lowers text/graph, executes IR and exports outside EMS workspace', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ems-ir-cli-'));
  const root = new URL('../', import.meta.url).pathname;
  const cli = join(root, 'tools/ems.mjs');
  const call = (...args) => execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  try {
    const path = join(dir, 'program.ir.json');
    const textPath = join(dir, 'text.ir.json');
    const modulePath = join(dir, 'program.mjs');
    call('ir', 'examples/avg5.graph.json', '--out', path);
    call('text-ir', 'examples/avg5.ems', '--out', textPath);
    assert.equal(await readFile(path, 'utf8'), await readFile(textPath, 'utf8'));
    const input = JSON.stringify({ times: [12.4, 11.85, 13.2, 12.1, 14] });
    const result = JSON.parse(call('ir-run', path, input)).result;
    assert.equal(result, await executeGraph(example, JSON.parse(input), createCoreRegistry()));
    call('ir-build', path, '--out', modulePath);
    const output = execFileSync(process.execPath, ['--input-type=module', '-e',
      `import { execute } from './program.mjs'; console.log(execute(${input}));`], { cwd: dir, encoding: 'utf8' });
    assert.equal(Number(output.trim()), result);
    assert.doesNotMatch(await readFile(modulePath, 'utf8'), /import\s/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
