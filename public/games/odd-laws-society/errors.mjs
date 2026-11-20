/** Safe rule failures. Messages never contain an action, state, or sealed choice. */
export class RuleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RuleError';
    this.code = code;
  }

  toJSON() {
    return { name: this.name, code: this.code, message: this.message };
  }
}

export function fail(code, message) {
  throw new RuleError(code, message);
}
