import { readFile } from 'node:fs/promises';
import { createCoreRegistry } from '../src/reference/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import { createStateRegistry, ReactorSession, replayEvents } from '../src/runtime/reactor.mjs';
const state = [{ id: 'count', type: 'Number', initial: 0 }];
const base = createStateRegistry(createCoreRegistry(), state);
const source = await readFile(new URL('./counter.ems', import.meta.url), 'utf8');
const bundle = lowerCheckedModule(typecheckModule(parseEMSModule(source), base), 'demo.Counter', base);
const manifest = { schemaVersion: 'ems-reactor/1', id: 'demo.counter', version: '1.0.0', state,
  handlers: [{ event: 'increment', program: bundle.ir }] };
const options = { policy: { capabilities: ['state.read', 'state.write'], allowedEffects: ['state.read', 'state.write'] }, recordTrace: true };
const session = new ReactorSession(manifest, bundle.registry, options);
await Promise.all([1, 2, -1].map(delta => session.dispatch('increment', { delta })));
const replay = new ReactorSession(manifest, bundle.registry, options);
await replayEvents(replay, session.trace());
console.log(JSON.stringify({ original: session.snapshot(), replay: replay.snapshot() }, null, 2));
await session.close(); await replay.close();
