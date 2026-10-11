import { fail } from '../reference/errors.mjs';

const keywords = new Set(['package', 'import', 'as', 'export', 'extern', 'async', 'contract', 'fn', 'let', 'mut',
  'using', 'return', 'if', 'else', 'while', 'for', 'in', 'match', 'try', 'catch', 'finally', 'throw', 'break',
  'continue', 'await', 'true', 'false', 'requires', 'pure', 'type']);
const precedence = new Map([['=', 1], ['||', 2], ['&&', 3], ['==', 4], ['!=', 4],
  ['<', 5], ['<=', 5], ['>', 5], ['>=', 5], ['+', 6], ['-', 6], ['*', 7], ['/', 7], ['%', 7]]);

/** Tokenize EMS source without invoking host code. Offsets/columns use UTF-16 code units. */
export function tokenizeEMS(source, { maxSourceLength = 1_000_000, maxTokens = 100_000 } = {}) {
  if (typeof source !== 'string') fail('INVALID_SOURCE', 'EMS source must be a string');
  if (source.length > maxSourceLength) fail('SOURCE_LIMIT', 'EMS source exceeds configured length limit');
  const tokens = [];
  let offset = 0, line = 1, column = 1;
  const point = () => ({ offset, line, column });
  function advance() {
    const ch = source[offset++];
    if (ch === '\n') { line++; column = 1; } else column++;
    return ch;
  }
  function error(message, start = point()) { fail('SYNTAX', `${start.line}:${start.column}: ${message}`, { location: { start, end: point() } }); }
  function emit(kind, value, start) {
    if (tokens.length >= maxTokens) fail('SOURCE_LIMIT', 'EMS source exceeds configured token limit');
    tokens.push({ kind, value, location: { start, end: point() } });
  }
  while (offset < source.length) {
    const ch = source[offset];
    if (/\s/.test(ch)) { advance(); continue; }
    if (source.startsWith('//', offset)) { while (offset < source.length && source[offset] !== '\n') advance(); continue; }
    if (source.startsWith('/*', offset)) {
      const start = point(); advance(); advance();
      while (offset < source.length && !source.startsWith('*/', offset)) advance();
      if (offset === source.length) error('Unterminated block comment', start);
      advance(); advance(); continue;
    }
    const start = point();
    if (/[A-Za-z_]/.test(ch)) {
      let value = '';
      while (offset < source.length && /[A-Za-z0-9_]/.test(source[offset])) value += advance();
      emit(keywords.has(value) ? 'keyword' : 'identifier', value, start); continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[offset + 1] ?? ''))) {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(offset));
      for (let i = 0; i < match[0].length; i++) advance();
      const value = Number(match[0]);
      if (!Number.isFinite(value)) error('Numeric literal outside finite binary64 profile', start);
      emit('number', value, start); continue;
    }
    if (ch === '"') {
      advance(); let closed = false;
      while (offset < source.length) {
        const next = advance();
        if (next === '\n' || next === '\r') error('Newline inside string literal', start);
        if (next === '"') { closed = true; break; }
        if (next === '\\' && offset < source.length) {
          const escaped = advance();
          if (escaped === '\n' || escaped === '\r') error('Newline inside string escape', start);
        }
      }
      if (!closed) error('Unterminated string literal', start);
      let value;
      try { value = JSON.parse(source.slice(start.offset, offset)); } catch { error('Invalid string escape', start); }
      emit('string', value, start); continue;
    }
    const pair = source.slice(offset, offset + 2);
    if (['->', '=>', '==', '!=', '<=', '>=', '&&', '||'].includes(pair)) {
      advance(); advance(); emit('symbol', pair, start); continue;
    }
    if ('{}()[],:;.@+-*/%!=<>'.includes(ch)) { advance(); emit('symbol', ch, start); continue; }
    error(`Unexpected character ${JSON.stringify(ch)}`, start);
  }
  tokens.push({ kind: 'eof', value: '', location: { start: point(), end: point() } });
  return tokens;
}

class Parser {
  constructor(tokens, maxDepth) { this.tokens = tokens; this.index = 0; this.depth = 0; this.maxDepth = maxDepth; }
  get token() { return this.tokens[this.index]; }
  is(value) { return this.token.value === value; }
  take(value) { if (!this.is(value)) return false; this.index++; return true; }
  expect(value) { const token = this.token; if (!this.take(value)) this.error(`Expected ${value}`); return token; }
  error(message) { fail('SYNTAX', `${this.token.location.start.line}:${this.token.location.start.column}: ${message}`, { location: this.token.location }); }
  identifier() { const token = this.token; if (token.kind !== 'identifier') this.error('Expected identifier'); this.index++; return token.value; }
  string() { const token = this.token; if (token.kind !== 'string') this.error('Expected string literal'); this.index++; return token.value; }
  atStatementEnd() {
    return this.is(';') || this.is('}') || this.token.kind === 'eof' ||
      this.token.location.start.line > (this.tokens[this.index - 1]?.location.end.line ?? 0);
  }
  terminator() { if (!this.take(';') && !this.atStatementEnd()) this.error('Expected semicolon or line boundary'); }
  node(kind, start, fields = {}) {
    return { kind, ...fields, location: { start: start.location.start, end: this.tokens[this.index - 1]?.location.end ?? start.location.end } };
  }
  nested(fn) {
    if (++this.depth > this.maxDepth) fail('SYNTAX_DEPTH', 'EMS syntax exceeds configured nesting limit', { location: this.token.location });
    try { return fn(); } finally { this.depth--; }
  }
  qualified() { let value = this.identifier(); while (this.take('.')) value += '.' + this.identifier(); return value; }
  generics() {
    const params = [];
    if (this.take('<')) { do { params.push(this.identifier()); } while (this.take(',')); this.expect('>'); }
    return params;
  }
  typeClose() {
    // In type context, >= closes the generic and starts the initializer.
    if (this.is('>=')) {
      const token = this.token, middle = { ...token.location.start, offset: token.location.start.offset + 1, column: token.location.start.column + 1 };
      this.tokens.splice(this.index, 1,
        { kind: 'symbol', value: '>', location: { start: token.location.start, end: middle } },
        { kind: 'symbol', value: '=', location: { start: middle, end: token.location.end } });
    }
    return this.expect('>');
  }
  type() {
    return this.nested(() => {
      const start = this.token, name = this.qualified(), args = [];
      if (this.take('<')) { do { args.push(this.type()); } while (this.take(',')); this.typeClose(); }
      let result = this.node('NamedType', start, { name, arguments: args });
      while (this.take('[')) { this.expect(']'); result = this.node('NamedType', start, { name: 'Array', arguments: [result] }); }
      return result;
    });
  }
  module() {
    const start = this.token, imports = [], declarations = [];
    let packageDeclaration = null;
    if (this.take('package')) {
      const name = this.qualified(); this.expect('@'); const version = this.string(); this.take(';');
      packageDeclaration = this.node('PackageDeclaration', start, { name, version });
    }
    while (this.is('import')) {
      const at = this.expect('import'), source = this.string(); this.expect('as'); const alias = this.identifier(); this.expect(';');
      imports.push(this.node('ImportDeclaration', at, { source, alias }));
    }
    while (this.token.kind !== 'eof') declarations.push(this.declaration());
    return this.node('Module', start, { schemaVersion: 'ems-ast/1', package: packageDeclaration, imports, declarations });
  }
  declaration() {
    const start = this.token, exported = this.take('export');
    if (this.take('type')) {
      const name = this.identifier(), typeParameters = this.generics(); this.expect('='); const value = this.type(); this.expect(';');
      return this.node('TypeDeclaration', start, { exported, name, typeParameters, value });
    }
    const external = this.take('extern'), async = this.take('async');
    let category;
    if (this.take('fn')) category = 'FunctionDeclaration';
    else if (this.take('contract')) category = 'ContractDeclaration';
    else this.error('Expected fn, contract or type declaration');
    const name = this.qualified(), typeParameters = this.generics(), parameters = [];
    this.expect('(');
    if (!this.is(')')) do {
      const at = this.token, name = this.identifier(); this.expect(':');
      parameters.push(this.node('Parameter', at, { name, type: this.type() }));
    } while (this.take(','));
    this.expect(')'); this.expect('->'); const output = this.type(), requirements = [];
    if (this.take('requires')) {
      do {
        const at = this.token;
        if (this.take('pure')) requirements.push(this.node('Requirement', at, { name: 'pure', value: null }));
        else {
          const name = this.identifier(); this.expect('('); const value = this.string(); this.expect(')');
          requirements.push(this.node('Requirement', at, { name, value }));
        }
      } while (this.take(','));
    }
    const body = external ? (this.expect(';'), null) : this.block();
    return this.node(category, start, { exported, external, async, name, typeParameters, parameters, output, requirements, body });
  }
  block() {
    return this.nested(() => {
      const start = this.expect('{'), statements = [];
      while (!this.is('}')) {
        if (this.token.kind === 'eof') this.error('Unterminated block');
        statements.push(this.statement());
      }
      this.expect('}'); return this.node('Block', start, { statements });
    });
  }
  statement() {
    const start = this.token;
    if (this.is('{')) return this.block();
    if (this.take('let') || this.take('using')) {
      const resource = start.value === 'using', mutable = this.take('mut'), name = this.identifier();
      const type = this.take(':') ? this.type() : null;
      this.expect('='); const value = this.expression(); this.terminator();
      return this.node(resource ? 'UsingDeclaration' : 'LetDeclaration', start, { mutable, name, type, value });
    }
    if (this.take('return')) {
      const value = this.atStatementEnd() ? null : this.expression(); this.terminator();
      return this.node('ReturnStatement', start, { value });
    }
    if (this.take('throw')) { const value = this.expression(); this.terminator(); return this.node('ThrowStatement', start, { value }); }
    if (this.take('break') || this.take('continue')) {
      this.terminator(); return this.node(start.value === 'break' ? 'BreakStatement' : 'ContinueStatement', start);
    }
    if (this.take('if')) {
      const condition = this.expression(), then = this.block();
      const otherwise = this.take('else') ? (this.is('if') ? this.nested(() => this.statement()) : this.block()) : null;
      return this.node('IfStatement', start, { condition, then, otherwise });
    }
    if (this.take('while')) {
      const condition = this.expression(), body = this.block(); return this.node('WhileStatement', start, { condition, body });
    }
    if (this.take('for')) {
      const asynchronous = this.take('await');
      const binding = this.identifier(); this.expect('in'); const iterable = this.expression(), body = this.block();
      return this.node('ForStatement', start, { binding, iterable, body, ...(asynchronous ? { asynchronous: true } : {}) });
    }
    if (this.take('match')) {
      const value = this.expression(), arms = []; this.expect('{');
      while (!this.is('}')) {
        const at = this.token, pattern = this.pattern(); this.expect('=>'); const body = this.block();
        arms.push(this.node('MatchArm', at, { pattern, body })); this.take(',');
      }
      this.expect('}'); return this.node('MatchStatement', start, { value, arms });
    }
    if (this.take('try')) {
      const body = this.block(); let handler = null, finalizer = null;
      if (this.take('catch')) {
        const at = this.tokens[this.index - 1]; this.expect('('); const binding = this.identifier();
        const type = this.take(':') ? this.type() : null; this.expect(')'); const body = this.block();
        handler = this.node('CatchClause', at, { binding, type, body });
      }
      if (this.take('finally')) finalizer = this.block();
      if (!handler && !finalizer) this.error('try requires catch or finally');
      return this.node('TryStatement', start, { body, handler, finalizer });
    }
    const value = this.expression(); this.terminator(); return this.node('ExpressionStatement', start, { value });
  }
  pattern() {
    return this.nested(() => {
      const start = this.token;
      if (['number', 'string'].includes(start.kind) || this.is('true') || this.is('false'))
        return this.node('LiteralPattern', start, { value: this.prefix() });
      const name = this.qualified(), arguments_ = [];
      const constructor = this.take('(');
      if (constructor) {
        if (!this.is(')')) do { arguments_.push(this.pattern()); } while (this.take(','));
        this.expect(')');
      }
      return this.node(name === '_' ? 'WildcardPattern' : constructor ? 'ConstructorPattern' : 'BindingPattern', start, { name, arguments: arguments_ });
    });
  }
  expression(minimum = 1) {
    return this.nested(() => {
      const start = this.token; let left = this.postfix(this.prefix());
      while ((precedence.get(this.token.value) ?? 0) >= minimum) {
        const operator = this.token.value, level = precedence.get(operator); this.index++;
        if (operator === '=' && !['NameExpression', 'MemberExpression', 'IndexExpression'].includes(left.kind)) this.error('Invalid assignment target');
        const right = this.expression(operator === '=' ? level : level + 1);
        left = this.node(operator === '=' ? 'AssignmentExpression' : 'BinaryExpression', start, { operator, left, right });
      }
      return left;
    });
  }
  prefix() {
    const start = this.token;
    if (['!', '-', '+', 'await'].includes(start.value)) {
      this.index++; return this.node('UnaryExpression', start, { operator: start.value, value: this.expression(8) });
    }
    if (['number', 'string'].includes(start.kind) || this.is('true') || this.is('false')) {
      this.index++; const value = start.kind === 'keyword' ? start.value === 'true' : start.value;
      return this.node('LiteralExpression', start, { value });
    }
    if (this.take('(')) { const value = this.expression(); this.expect(')'); return this.node('GroupExpression', start, { value }); }
    if (this.take('[')) {
      const elements = [];
      if (!this.is(']')) do { elements.push(this.expression()); } while (this.take(',') && !this.is(']'));
      this.expect(']'); return this.node('ArrayExpression', start, { elements });
    }
    if (this.take('{')) {
      const fields = [];
      if (!this.is('}')) do {
        const at = this.token, name = this.identifier(); this.expect(':'); const value = this.expression();
        fields.push(this.node('RecordField', at, { name, value }));
      } while (this.take(',') && !this.is('}'));
      this.expect('}'); return this.node('RecordExpression', start, { fields });
    }
    if (start.kind === 'identifier') { this.index++; return this.node('NameExpression', start, { name: start.value }); }
    this.error('Expected expression');
  }
  postfix(value) {
    const start = { location: value.location };
    while (true) {
      if (this.take('(')) {
        const args = [];
        if (!this.is(')')) do { args.push(this.expression()); } while (this.take(','));
        this.expect(')'); value = this.node('CallExpression', start, { callee: value, arguments: args });
      } else if (this.take('.')) value = this.node('MemberExpression', start, { value, member: this.identifier() });
      else if (this.take('[')) {
        const index = this.expression(); this.expect(']'); value = this.node('IndexExpression', start, { value, index });
      } else return value;
    }
  }
}

/** Parse the versioned EMS grammar into a located AST; validation/lowering is a separate phase. */
export function parseEMSModule(source, options = {}) {
  const tokens = tokenizeEMS(source, options);
  return new Parser(tokens, options.maxDepth ?? 128).module();
}
