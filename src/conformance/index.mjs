/** Lossless QA transport. Tagged containers prevent user objects from impersonating numbers. */
export function encodeValue(value, ancestors = new Set()) {
  if (value === undefined) return ['undefined'];
  if (value === null) return ['null'];
  if (typeof value === 'number') return ['number', Object.is(value, -0) ? '-0' : String(value)];
  if (typeof value === 'string' || typeof value === 'boolean') return [typeof value, value];
  if (typeof value !== 'object' || ancestors.has(value)) throw new TypeError('Unsupported conformance value');
  const next = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length || Object.keys(value).some((key, index) => key !== String(index))) throw new TypeError('Sparse conformance array');
    return ['array', value.map(item => encodeValue(item, next))];
  }
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('Non-data conformance object');
  return ['object', Object.keys(value).sort().map(key => [key, encodeValue(value[key], next)])];
}
export function decodeValue(encoded) {
  const [tag, value] = encoded;
  switch (tag) {
    case 'undefined': return undefined;
    case 'null': return null;
    case 'number': return Number(value);
    case 'string': case 'boolean': return value;
    case 'array': return value.map(decodeValue);
    case 'object': return Object.fromEntries(value.map(([key, item]) => [key, decodeValue(item)]));
    default: throw new TypeError('Unknown conformance transport tag');
  }
}
export const sameValue = (left, right) => JSON.stringify(encodeValue(left)) === JSON.stringify(encodeValue(right));

/** Capture semantic failures, excluding host-specific stacks/messages. User throw payloads remain typed values. */
export async function captureOutcome(invoke) {
  try { return { status: 'returned', value: await invoke() }; }
  catch (error) {
    const diagnostic = { code: error?.code ?? 'HOST_ERROR', name: error?.name ?? 'Error', details: error?.details ?? {} };
    for (const field of ['valueType', 'value']) if (error && Object.hasOwn(error, field)) diagnostic[field] = error[field];
    return { status: 'failed', error: diagnostic };
  }
}
function expectedMatches(outcome, expected) {
  if (!expected || typeof expected !== 'object') throw new TypeError('Every fixture needs an expected value or error');
  if (Object.hasOwn(expected, 'error')) return outcome.status === 'failed' && outcome.error.code === expected.error &&
    (!Object.hasOwn(expected, 'details') || sameValue(outcome.error.details, expected.details));
  if (!Object.hasOwn(expected, 'value')) throw new TypeError('Missing expected outcome');
  const value = expected.negativeZero ? -0 : expected.value;
  return outcome.status === 'returned' && sameValue(outcome.value, value);
}

/** Executor.run receives an immutable-by-copy fixture and returns a captured outcome. Setup failures never count as semantic success. */
export async function runConformance(vectors, executors) {
  if (!Array.isArray(vectors) || !vectors.length || !Array.isArray(executors) || executors.length < 2 ||
      Object.keys(vectors).length !== vectors.length || Object.keys(executors).length !== executors.length ||
      vectors.some(item => !item || typeof item.id !== 'string' || !item.id) ||
      executors.some(item => !item || typeof item.id !== 'string' || !item.id || typeof item.run !== 'function') ||
      new Set(vectors.map(item => item.id)).size !== vectors.length ||
      new Set(executors.map(item => item.id)).size !== executors.length) throw new TypeError('Unique fixtures and at least two executors required');
  const results = [];
  for (const vector of vectors) {
    const outcomes = [];
    for (const executor of executors) {
      try {
        const outcome = await executor.run(structuredClone(vector));
        if (!['returned', 'failed'].includes(outcome?.status)) throw new TypeError('Invalid executor outcome');
        outcomes.push({ executor: executor.id, outcome, expected: expectedMatches(outcome, vector.expected) });
      } catch (error) {
        outcomes.push({ executor: executor.id, infrastructureError: error?.code ?? error?.name ?? 'Error', message: String(error?.message ?? error) });
      }
    }
    const baseline = outcomes[0];
    const passed = outcomes.every(item => item.expected === true && !item.infrastructureError && sameValue(item.outcome, baseline.outcome));
    results.push({ id: vector.id, passed, outcomes });
  }
  return { schemaVersion: 'ems-conformance-report/1', executors: executors.map(item => item.id),
    passed: results.filter(item => item.passed).length, failed: results.filter(item => !item.passed).length, results };
}
