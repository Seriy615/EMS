import { createCoreRegistry } from '../src/reference/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import {
  registerTrustedPinnedModule, createProgramLock, executeLockedIR, compileLockedIRToJS
} from '../src/contracts/index.mjs';

// Only explicitly trusted adapter sources are evaluated. This loader is not a sandbox.
const sources = new Map([
  ['helper', 'export function create(){return {twice:x=>x*2};}'],
  ['adapter', 'export function create(deps){return {execute:({x})=>deps.helper.twice(x),emitJS:({x})=>`(${x}*2)`};}']
]);
const registry = createCoreRegistry();
await registerTrustedPinnedModule(registry, {
  schemaVersion: 'ems-pinned-binding/1', module: 'adapter',
  contracts: [{ id: 'demo.double', version: '1.0.0', kind: 'atomic',
    inputs: { x: 'Number' }, output: 'Number', exports: { execute: 'execute', emitJS: 'emitJS' } }]
}, [...sources].map(([id, source]) => ({ id, source, dependencies: id === 'adapter' ? ['helper'] : [] })));
const checked = typecheckModule(parseEMSModule('fn double(x:Number)->Number {return demo.double(x);}'), registry);
const bundle = lowerCheckedModule(checked, 'double', registry);
const options = { target: 'node', artifactSources: sources };
const lock = await createProgramLock(bundle.ir, bundle.registry, options);
const result = await executeLockedIR(lock, bundle.ir, { x: 3 }, bundle.registry, options);
const generated = await compileLockedIRToJS(lock, bundle.ir, bundle.registry, options);
const standalone = await import(`data:text/javascript,${encodeURIComponent(generated)}`);
console.log(JSON.stringify({ artifacts: lock.artifacts, interpreted: result, standalone: standalone.execute({ x: 3 }) }, null, 2));
