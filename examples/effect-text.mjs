// Trusted stdout binding for the platform-independent EMS source beside this file.
import { readFile } from 'node:fs/promises';
import { createCoreRegistry } from '../src/reference/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import { executeIR } from '../src/ir/index.mjs';
const registry = createCoreRegistry().registerAtomic({
  id: 'demo.stdout', inputs: { message: 'String' }, output: 'String',
  effects: ['log.write'], capabilities: ['stdout.write'],
  execute: ({ message }) => { console.log(message); return message; }
});
const source = await readFile(new URL('./effect-text.ems', import.meta.url), 'utf8');
const bundle = lowerCheckedModule(typecheckModule(parseEMSModule(source), registry), 'demo.OrderedLogs', registry);
await executeIR(bundle.ir, {}, bundle.registry, { capabilities: ['stdout.write'], allowedEffects: ['log.write'] });
