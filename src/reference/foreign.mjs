import { fail } from './errors.mjs';

/**
 * Imports explicitly mapped named functions from a TRUSTED local JavaScript module.
 * This prototype does NOT isolate JS, infer effects, perform type conversion or validate crypto.
 * Never accept arbitrary third-party modules as trusted without a sandbox.
 */
export async function registerTrustedJSBindings(registry, manifest, moduleURL) {
  if (manifest.schemaVersion !== '0.1' || manifest.binding !== 'trusted-js-esm' || !Array.isArray(manifest.contracts))
    fail('INVALID_BINDING', 'Expected trusted-js-esm binding manifest schemaVersion 0.1');
  const lib = await import(moduleURL);
  for (const spec of manifest.contracts) {
    if (!spec.export || typeof lib[spec.export] !== 'function')
      fail('MISSING_EXPORT', `External module does not export function ${spec.export}`);
    const keys = Object.keys(spec.inputs ?? {});
    registry.registerAtomic({
      id: spec.id, version: spec.version ?? '1.0.0', inputs: spec.inputs,
      output: spec.output, effects: spec.effects ?? [], capabilities: spec.capabilities ?? [],
      execute: (inputs) => lib[spec.export](...keys.map(k => inputs[k]))
    });
  }
  return registry;
}

/** A compiled graph can be re-registered as an atomic operation by its public signature. */
export function registerCompiledAtomic(registry, manifest, execute) {
  if (manifest.kind !== 'atomic' || manifest.schemaVersion !== '0.1' || typeof execute !== 'function')
    fail('INVALID_BINDING', 'Invalid compiled atomic binding');
  registry.registerAtomic({
    id: manifest.id, version: manifest.version, inputs: manifest.inputs,
    output: manifest.output, effects: manifest.effects ?? [],
    capabilities: manifest.capabilities ?? [], execute
  });
  return registry;
}
