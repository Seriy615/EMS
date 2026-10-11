export class EmsError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'EmsError';
    this.code = code;
    this.details = details;
  }
}
export function fail(code, message, details = {}) {
  throw new EmsError(code, message, details);
}
