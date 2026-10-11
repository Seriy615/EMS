import { fail } from '../reference/errors.mjs';
import { assertValueType as assertPrimitiveValueType } from '../reference/types.mjs';

/** Canonical finite type grammar for the algebraic control profile, independent of frontend AST. */
export function parseControlType(source) {
  if (typeof source !== 'string' || source.length > 4096) fail('UNKNOWN_TYPE', 'Invalid control type');
  let offset = 0;
  function parse(depth) {
    if (depth > 32) fail('IR_LIMIT', 'Control type nesting exceeds 32');
    const match = /^[A-Za-z]+/.exec(source.slice(offset));
    if (!match) fail('UNKNOWN_TYPE', 'Invalid control type ' + source);
    const name = match[0]; offset += name.length;
    if (['Number', 'NumberArray', 'Boolean', 'String'].includes(name)) return { name, arguments: [] };
    if (!['Option', 'Result'].includes(name) || source[offset++] !== '<') fail('UNKNOWN_TYPE', 'Invalid control type ' + source);
    const arguments_ = [parse(depth + 1)];
    if (name === 'Result') { if (source[offset++] !== ',') fail('UNKNOWN_TYPE', 'Invalid control type ' + source); arguments_.push(parse(depth + 1)); }
    if (source[offset++] !== '>') fail('UNKNOWN_TYPE', 'Invalid control type ' + source);
    return { name, arguments: arguments_ };
  }
  const result = parse(0);
  if (offset !== source.length) fail('UNKNOWN_TYPE', 'Invalid control type ' + source);
  return result;
}
export function controlTypeName(type) {
  return type.name + (type.arguments.length ? '<' + type.arguments.map(controlTypeName).join(',') + '>' : '');
}
export function controlVariants(type) {
  const parsed = typeof type === 'string' ? parseControlType(type) : type;
  return parsed.name === 'Option' ? new Map([['Some', [parsed.arguments[0]]], ['None', []]])
    : parsed.name === 'Result' ? new Map([['Ok', [parsed.arguments[0]]], ['Err', [parsed.arguments[1]]]]) : null;
}
export function assertControlValueType(value, expected, context) {
  const type = parseControlType(expected);
  function check(value, type) {
    const variants = controlVariants(type);
    if (!variants) { assertPrimitiveValueType(value, type.name, context); return; }
    const validObject = value !== null && typeof value === 'object' && !Array.isArray(value) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value));
    const descriptors = validObject ? Object.getOwnPropertyDescriptors(value) : {};
    const tag = descriptors.tag?.value, payload = variants.get(tag);
    const keys = payload?.length === 0 ? ['tag'] : ['tag', 'value'];
    if (!validObject || !payload || Reflect.ownKeys(value).length !== keys.length ||
        keys.some(key => !Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], 'value')))
      fail('TYPE_MISMATCH', `${context}: expected ${expected}, got Unknown`, { expected, received: 'Unknown', context });
    if (payload.length) check(descriptors.value.value, payload[0]);
  }
  check(value, type);
}
export function cloneControlValue(value) {
  if (Array.isArray(value)) return [...value];
  if (value !== null && typeof value === 'object') return Object.hasOwn(value, 'value')
    ? { tag: value.tag, value: cloneControlValue(value.value) } : { tag: value.tag };
  return value;
}
/** Match a validated semantic pattern. Every visited pattern consumes the shared execution budget. */
export function matchControlPattern(pattern, value, tick, bindings = new Map()) {
  tick();
  switch (pattern.kind) {
    case 'wildcard': return bindings;
    case 'binding': bindings.set(pattern.name, value); return bindings;
    case 'literal': return value === (pattern.value === '-0' && pattern.type === 'Number' ? -0 : pattern.value) ? bindings : null;
    case 'constructor':
      if (value.tag !== pattern.tag) return null;
      return pattern.arguments.length ? matchControlPattern(pattern.arguments[0], value.value, tick, bindings) : bindings;
  }
  fail('INVALID_IR', 'Unknown match pattern');
}
export function validateControlInputs(fn, inputs) {
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs) || ![Object.prototype, null].includes(Object.getPrototypeOf(inputs)))
    fail('INVALID_INPUT', 'Input values must be an object');
  for (const input of fn.inputs) {
    if (!Object.hasOwn(inputs, input.name)) fail('MISSING_INPUT', 'Missing input ' + input.name);
    assertControlValueType(inputs[input.name], input.type, 'inputs.' + input.name);
  }
  for (const name of Object.keys(inputs)) if (!fn.inputs.some(input => input.name === name)) fail('EXTRA_INPUT', 'Unexpected input ' + name);
}
