import { fail } from '../reference/errors.mjs';

export function equalControlValues(a, b) {
  if(a?.tag==='Map'&&b?.tag==='Map'){if(a.value.length!==b.value.length)return false;const right=new Map(b.value);return a.value.every(([key,value])=>right.has(key)&&equalControlValues(value,right.get(key)));}
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b))
    return a.tag === b.tag && (!Object.hasOwn(a, 'value') || equalControlValues(a.value, b.value));
  return Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((value, index) => equalControlValues(value,b[index])) : a === b;
}
export function unaryControlValue(operator, value) {
  if (operator === '!') return !value;
  return operator === '-' ? -value : +value;
}
export function binaryControlValue(operator, a, b) {
  switch (operator) {
    case '+': return a + b; case '-': return a - b; case '*': return a * b;
    case '/': case '%': if (b === 0) fail('DIV_BY_ZERO', 'Division by zero'); return operator === '/' ? a / b : a % b;
    case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b;
    case '==': return equalControlValues(a, b); case '!=': return !equalControlValues(a, b);
  }
  fail('INVALID_IR', 'Unknown control binary operator');
}
export function indexControlValue(value, index) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= value.length)
    fail('BOUNDS_ERROR', 'Array index is outside bounds', { index, length: value.length });
  return value[index];
}
export function controlBudgetOptions(options) {
  const maxSteps = options.maxSteps ?? 100000, maxDepth = options.maxDepth ?? 64;
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || !Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 256)
    fail('INVALID_BUDGET', 'Expected positive step budget and depth between 1 and 256');
  return { maxSteps, maxDepth };
}
