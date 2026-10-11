// Trusted Node binding. Capabilities gate invocation; the callback is not filesystem-sandboxed.
import { open, readFile } from 'node:fs/promises';
import { createCoreRegistry } from '../src/reference/index.mjs';
import { registerContractBinding } from '../src/contracts/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import { executeIR } from '../src/ir/index.mjs';
const get = async name => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'));
const registry = createCoreRegistry().registerResource({
  id: 'node.file.read', inputs: { path: 'String' }, valueType: 'String',
  effects: ['fs.read'], capabilities: ['fs.read'],
  acquire: ({ path }) => open(path, 'r'),
  read: (file, { signal }) => file.readFile({ encoding: 'utf8', signal }),
  release: file => file.close()
});
registerContractBinding(registry, await get('resource-interface.json'), await get('resource-binding.json'), { target: 'node' });
const source = 'fn read(path:String)->String { using file=std.file.read(path); return resource.read(file); }';
const program = lowerCheckedModule(typecheckModule(parseEMSModule(source), registry), 'read', registry);
console.log(await executeIR(program.ir, { path: process.argv[2] ?? 'examples/resources.ems' }, program.registry, {
  allowedEffects: ['fs.read'], capabilities: ['fs.read']
}));
