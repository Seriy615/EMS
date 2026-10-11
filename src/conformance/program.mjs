import { createCoreRegistry } from '../reference/index.mjs';
import { parseEMSModule } from '../frontend/index.mjs';
import { typecheckModule } from '../frontend/check.mjs';
import { lowerCheckedModule } from '../frontend/lower.mjs';
import { lowerGraphToIR } from '../ir/index.mjs';
import { registerContractBinding } from '../contracts/index.mjs';

/** Deterministic finite conformance programs use the ordinary shared frontend/IR. */
export function prepareProgram(vector) {
  const registry = createCoreRegistry();
  for (const graph of vector.composites ?? []) registry.registerComposite({ id: graph.id, version: graph.version, graph });
  for (const descriptor of vector.interfaces ?? []) registerContractBinding(registry, descriptor.interface, descriptor.binding, { target: vector.target ?? 'node' });
  if (vector.graph) return { ir: lowerGraphToIR(vector.graph, registry), registry };
  if (typeof vector.source !== 'string') throw new TypeError('Fixture needs a graph or EMS source');
  return lowerCheckedModule(typecheckModule(parseEMSModule(vector.source), registry), vector.entry ?? 'test', registry);
}
