import { fail } from './errors.mjs';

export const PRIMITIVE_TYPES = new Set(['Number', 'NumberArray', 'Boolean', 'String']);

export function typeOfValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return 'Number';
  if (typeof value === 'boolean') return 'Boolean';
  if (typeof value === 'string') return 'String';
  if (Array.isArray(value) && Array.from(value).every(x => typeof x === 'number' && Number.isFinite(x))) return 'NumberArray';
  return 'Unknown';
}

export function assertValueType(value, expected, context) {
  const received = typeOfValue(value);
  if (received !== expected) fail('TYPE_MISMATCH', `${context}: expected ${expected}, got ${received}`, { expected, received, context });
}

export function assertTypeName(type, context) {
  if (!PRIMITIVE_TYPES.has(type)) fail('UNKNOWN_TYPE', `${context}: unsupported reference type ${type}`);
}
