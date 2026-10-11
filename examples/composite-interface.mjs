// A public interface selects an inspectable composite; the graph remains available for editing.
import { readFile } from 'node:fs/promises';
import { createCoreRegistry, executeGraph, compileStandaloneJS } from '../src/reference/index.mjs';
import { registerContractBinding } from '../src/contracts/index.mjs';
const get = async name => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'));
const spec = await get('contract-interface.json');
const binding = await get('contract-binding.json');
binding.id = 'ems.reference.composite.divide';
binding.implementation.id = 'demo.divide';
const graph = {
  schemaVersion: '0.1', id: 'demo.divide', version: '1.0.0',
  inputs: { a: { type: 'Number' }, b: { type: 'Number' } }, output: { type: 'Number' },
  nodes: [{ id: 'divide', uses: 'core.div', args: { a: { input: 'a' }, b: { input: 'b' } } }],
  returns: { node: 'divide' }
};
const registry = createCoreRegistry().registerComposite({ id: graph.id, version: graph.version, graph });
registerContractBinding(registry, spec, binding, { target: 'node' });
const selected = registry.resolve(spec.id);
console.log(selected.kind, selected.graph.nodes.length, await executeGraph(selected.graph, { a: 6, b: 2 }, registry));
const independent = await import(`data:text/javascript,${encodeURIComponent(compileStandaloneJS(selected.graph, registry))}`);
console.log(independent.execute({ a: 6, b: 2 }));
