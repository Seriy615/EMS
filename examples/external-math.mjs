// Trusted local demonstration only. Not a plugin isolation or FFI sandbox.
export function square(value) { return value * value; }
export function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
export function hypotenuse(a, b) { return Math.hypot(a, b); }
