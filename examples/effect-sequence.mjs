// Trusted host adapter demo: explicit stdout effects, not a portable file/device binding.
import { createCoreRegistry } from '../src/reference/index.mjs';
import { lowerGraphToIR, serializeIR, parseIR, executeIR, EFFECT_PROFILE } from '../src/ir/index.mjs';
const registry = createCoreRegistry().registerAtomic({
  id: 'demo.stdout', inputs: { message: 'String' }, output: 'String',
  effects: ['log.write'], capabilities: ['stdout.write'],
  execute: ({ message }) => { console.log(message); return message; }
});
const graph = {
  schemaVersion: '0.1', id: 'demo.orderedLogs', version: '1.0.0', inputs: {}, output: { type: 'String' },
  nodes: [
    { id: 'second', uses: 'demo.stdout', args: { message: { literal: 'second' } } },
    { id: 'first', uses: 'demo.stdout', args: { message: { literal: 'first' } } }
  ], sequence: ['first', 'second'], returns: { node: 'second' }
};
const ir = parseIR(serializeIR(lowerGraphToIR(graph, registry, { profile: EFFECT_PROFILE }), registry), registry);
await executeIR(ir, {}, registry, { capabilities: ['stdout.write'], allowedEffects: ['log.write'] });
