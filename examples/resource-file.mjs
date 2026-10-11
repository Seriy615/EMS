// Trusted Node adapter example: grants authorize this implementation, not a filesystem sandbox.
import { open } from 'node:fs/promises';
import { createCoreRegistry } from '../src/reference/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import { executeIR } from '../src/ir/index.mjs';

const registry = createCoreRegistry().registerResource({
  id: 'node.file', version: '1.0.0', inputs: { path: 'String' }, valueType: 'String',
  effects: ['fs.read'], capabilities: ['fs.read'],
  acquire: ({ path }, { signal }) => {
    signal?.throwIfAborted();
    return open(path, 'r');
  },
  read: (file, { signal }) => file.readFile({ encoding: 'utf8', signal }),
  release: file => file.close()
});
const source = 'fn read(path:String)->String { using file=node.file(path); return resource.read(file); }';
const program = lowerCheckedModule(typecheckModule(parseEMSModule(source), registry), 'read', registry);
console.log(await executeIR(program.ir, { path: process.argv[2] ?? 'examples/resources.ems' }, registry, {
  allowedEffects: ['fs.read'], capabilities: ['fs.read']
}));
