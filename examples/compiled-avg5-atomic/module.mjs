// EMS reference output. Standalone JavaScript, NO EMS runtime dependency.
// Pure finite-number profile; trusted implementations only.
function __fail(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'EmsError'; error.code = code; error.details = details;
  throw error;
}
function __type(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return 'Number';
  if (typeof value === 'boolean') return 'Boolean';
  if (typeof value === 'string') return 'String';
  if (Array.isArray(value) && Array.from(value).every(x => typeof x === 'number' && Number.isFinite(x))) return 'NumberArray';
  return 'Unknown';
}
function __assertType(value, expected, context) {
  const received = __type(value);
  if (received !== expected) __fail('TYPE_MISMATCH', context + ': expected ' + expected + ', got ' + received, { expected, received, context });
}
function __divide(a,b) { if (b === 0) __fail('DIV_BY_ZERO', 'Division by zero'); return a / b; }
function __min(a) { if (!a.length) __fail('EMPTY_ARRAY', 'core.min: empty list'); return a.reduce((x,y)=>Math.min(x,y),Infinity); }
function __max(a) { if (!a.length) __fail('EMPTY_ARRAY', 'core.max: empty list'); return a.reduce((x,y)=>Math.max(x,y),-Infinity); }
export function execute(inputs) {
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) __fail('INVALID_INPUT', 'Input values must be an object');
  if (!Object.hasOwn(inputs, "times")) __fail('MISSING_INPUT', "Missing input times");
  __assertType(inputs["times"], "NumberArray", "inputs.times");
  for (const key of Object.keys(inputs)) if (!["times"].includes(key)) __fail('EXTRA_INPUT', 'Unexpected input ' + key);
  const __v0 = inputs["times"].reduce((a,b)=>a+b,0);
  __assertType(__v0, "Number", "result of core.sum");
  const __v1 = __min(inputs["times"]);
  __assertType(__v1, "Number", "result of core.min");
  const __v2 = (__v0 - __v1);
  __assertType(__v2, "Number", "result of core.sub");
  const __v3 = __max(inputs["times"]);
  __assertType(__v3, "Number", "result of core.max");
  const __v4 = (__v2 - __v3);
  __assertType(__v4, "Number", "result of core.sub");
  const __v5 = __divide(__v4, 3);
  __assertType(__v5, "Number", "result of core.div");
  const result = __v5;
  __assertType(result, "Number", 'graph result');
  return result;
}
