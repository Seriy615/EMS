import { assertControlValueType as assertValueType, cloneControlValue } from './control-algebraic.mjs';

/** Portable user-value throw envelope. Payloads are explicit values, never error messages or trace metadata. */
export function makeControlThrow(value, type) {
  assertValueType(value, type, 'throw value');
  const error = new Error('EMS user value thrown');
  error.name = 'EmsError'; error.code = 'USER_THROW'; error.details = {};
  error.emsThrow = 'ems-user-throw/1'; error.valueType = type;
  error.value = cloneControlValue(value);
  return error;
}
export function matchesControlCatch(error, type) {
  return error !== null && typeof error === 'object' && ['emsThrow', 'code', 'valueType', 'value'].every(key => Object.hasOwn(error, key)) &&
    error.emsThrow === 'ems-user-throw/1' && error.code === 'USER_THROW' && error.valueType === type;
}
export function controlCatchValue(error, type) {
  assertValueType(error.value, type, 'catch value');
  return cloneControlValue(error.value);
}
export function terminalControlError(error) {
  return error?.name === 'EmsError' && ['CANCELLED', 'STEP_LIMIT', 'CALL_DEPTH', 'EVALUATION_DEPTH', 'FUTURE_LIMIT', 'STREAM_LIMIT', 'STREAM_PENDING_LIMIT'].includes(error.code);
}
