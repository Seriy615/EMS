import { prepareProgram } from './program.mjs';
import { captureOutcome, encodeValue, decodeValue } from './index.mjs';
import { executeIR, parseIR, serializeIR } from '../ir/index.mjs';
import { executeLockedIR, verifyProgramLock } from '../contracts/index.mjs';

/** Real browser interpreter uses the same source and semantic IR as Node. */
export async function runBrowserFixture(encoded) {
  const vector = decodeValue(encoded), { ir, registry } = prepareProgram({ ...vector, target: 'web' });
  const restored = parseIR(serializeIR(ir, registry), registry);
  return encodeValue(await captureOutcome(() => executeIR(restored, vector.inputs ?? {}, registry, vector.options ?? {})));
}

/** Verify Node-produced lock in the real browser before interpreting the same program. */
export async function runLockedBrowserFixture(encoded, lock) {
  const vector = decodeValue(encoded), { ir, registry } = prepareProgram({ ...vector, target: 'web' });
  // Lock verification failures are infrastructure failures, distinct from expected program throws.
  await verifyProgramLock(lock, ir, registry, { target: 'web' });
  return encodeValue(await captureOutcome(() => executeLockedIR(lock, ir, vector.inputs ?? {}, registry, { target: 'web', ...(vector.options ?? {}) })));
}
