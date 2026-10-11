import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tokenizeEMS, parseEMSModule } from '../src/frontend/index.mjs';

const moduleOf = body => parseEMSModule(`fn test(x: Number) -> Number { ${body} }`);
const bodyOf = body => moduleOf(body).declarations[0].body.statements;
const expressionOf = expression => bodyOf(`return ${expression};`)[0].value;

test('AC-027 modules, contracts, functions, loops, recursion and errors have located AST', async () => {
  const source = await readFile(new URL('../examples/language-core.ems', import.meta.url), 'utf8');
  const module = parseEMSModule(source);
  assert.equal(module.schemaVersion, 'ems-ast/1');
  assert.equal(module.package.name, 'demo.language');
  assert.equal(module.imports[0].alias, 'collections');
  assert.deepEqual(module.declarations.map(d => d.kind), [
    'TypeDeclaration', 'ContractDeclaration', 'FunctionDeclaration', 'ContractDeclaration', 'FunctionDeclaration'
  ]);
  const [alias, external, recursive, composite, async] = module.declarations;
  assert.deepEqual(alias.typeParameters, ['T']);
  assert.equal(external.external, true);
  assert.equal(external.body, null);
  assert.equal(external.output.arguments[0].name, 'Result');
  assert.deepEqual(external.requirements.map(r => r.name), ['capability', 'effect']);
  assert.equal(recursive.body.statements[0].kind, 'IfStatement');
  assert.equal(composite.exported, true);
  assert.deepEqual(composite.body.statements.map(s => s.kind), ['LetDeclaration', 'ForStatement', 'WhileStatement', 'ReturnStatement']);
  assert.equal(composite.parameters[0].type.name, 'Array');
  assert.equal(async.async, true);
  const attempt = async.body.statements[0];
  assert.equal(attempt.kind, 'TryStatement');
  assert.equal(attempt.body.statements[1].kind, 'MatchStatement');
  assert.equal(attempt.handler.binding, 'error');
  assert.ok(attempt.finalizer);
  assert.equal(source.slice(recursive.location.start.offset, recursive.location.start.offset + 2), 'fn');
  assert.equal(source[recursive.location.end.offset - 1], '}');
});

test('AC-027 existing M0 syntax remains parseable as an AST', async () => {
  const source = await readFile(new URL('../examples/avg5.ems', import.meta.url), 'utf8');
  const declaration = parseEMSModule(source).declarations[0];
  assert.equal(declaration.name, 'demo.AverageOfFiveArithmetic');
  assert.equal(declaration.body.statements.length, 7);
  assert.equal(declaration.parameters[0].type.name, 'Array');
});

test('AC-027 precedence and associativity are specified independently of host evaluation', () => {
  const expression = expressionOf('1 + 2 * 3 - 4');
  assert.equal(expression.operator, '-');
  assert.equal(expression.left.operator, '+');
  assert.equal(expression.left.right.operator, '*');
  const assignment = bodyOf('x = y = 1;')[0].value;
  assert.equal(assignment.kind, 'AssignmentExpression');
  assert.equal(assignment.right.kind, 'AssignmentExpression');
  const logical = expressionOf('x > 1 && x < 9 || false');
  assert.equal(logical.operator, '||');
  assert.equal(logical.left.operator, '&&');
});

test('AC-027 unary, await, calls, members and index expressions compose', () => {
  const expression = expressionOf('-await provider.fetch(x)[0].value');
  assert.equal(expression.operator, '-');
  assert.equal(expression.value.operator, 'await');
  assert.equal(expression.value.value.kind, 'MemberExpression');
  assert.equal(expression.value.value.value.kind, 'IndexExpression');
});

test('AC-027 collection, record, string, boolean and numeric literals', () => {
  const expression = expressionOf('{ flag: true, values: [1e2, .5, -0,], message: "EMS\\n\\u0410", }');
  assert.equal(expression.kind, 'RecordExpression');
  assert.equal(expression.fields[0].value.value, true);
  assert.equal(expression.fields[1].value.elements[0].value, 100);
  assert.equal(expression.fields[1].value.elements[2].operator, '-');
  assert.equal(expression.fields[2].value.value, 'EMS\nА');
});

test('AC-027 else-if, break, continue, resource syntax and generic functions', () => {
  const statements = bodyOf('using resource = acquire(); if x { break; } else if y { continue; } else { return; }');
  assert.equal(statements[0].kind, 'UsingDeclaration');
  assert.equal(statements[1].otherwise.kind, 'IfStatement');
  const generic = parseEMSModule('export fn identity<T>(x: T) -> T { return x; }').declarations[0];
  assert.deepEqual(generic.typeParameters, ['T']);
});

test('AC-027 comments and CRLF preserve line/column and offsets', () => {
  const source = '// first\r\n/* second */\r\nfn test() -> Number { return 1; }';
  const token = tokenizeEMS(source)[0];
  assert.equal(token.value, 'fn');
  assert.deepEqual(token.location.start, { offset: source.indexOf('fn'), line: 3, column: 1 });
});

test('AC-027 line terminators support M0 but adjacent statements require separation', () => {
  assert.equal(bodyOf('let y = 1\nreturn y').length, 2);
  assert.throws(() => moduleOf('let y = 1 return y;'), { code: 'SYNTAX' });
});

for (const [label, source] of [
  ['unclosed block', 'fn f() -> Number {'],
  ['missing parameter type', 'fn f(x) -> Number { return x; }'],
  ['bad output', 'fn f() -> { return 1; }'],
  ['missing let value', 'fn f() -> Number { let x = ; }'],
  ['bad assignment target', 'fn f() -> Number { (1 + 2) = 3; }'],
  ['unclosed string', 'fn f() -> String { return "x; }'],
  ['bad string escape', 'fn f() -> String { return "\\q"; }'],
  ['newline string', 'fn f() -> String { return "x\ny"; }'],
  ['unclosed comment', '/* incomplete'],
  ['host template syntax', 'fn f() -> String { return `x`; }'],
  ['host arrow function', 'fn f() -> Number { let x = () => 1; }'],
  ['trailing program junk', 'fn f() -> Number { return 1; } garbage'],
  ['unknown keyword statement', 'fn f() -> Number { const x = 1; }'],
  ['try without handler', 'fn f() -> Number { try { return 1; } }'],
  ['bad match arm', 'fn f() -> Number { match x { Ok(v) { return v; } } }'],
  ['infinite numeric literal', 'fn f() -> Number { return 1e999; }'],
  ['empty generic', 'fn f<>() -> Number { return 1; }'],
  ['import without alias', 'import "x";'],
  ['second package', 'package a @ "1"; package b @ "1";'],
  ['unsupported character', '#']
]) {
  test(`AC-027 syntax rejection with location: ${label}`, () => {
    assert.throws(() => parseEMSModule(source), error => {
      assert.equal(error.code, 'SYNTAX');
      assert.ok(error.details.location.start.line >= 1);
      assert.ok(error.details.location.start.column >= 1);
      return true;
    });
  });
}

test('AC-027 bounded frontend reports controlled resource failures', () => {
  assert.throws(() => parseEMSModule('fn f() -> Number { return 1; }', { maxTokens: 5 }), { code: 'SOURCE_LIMIT' });
  assert.throws(() => parseEMSModule('0123456789', { maxSourceLength: 5 }), { code: 'SOURCE_LIMIT' });
  assert.throws(() => parseEMSModule(`fn f() -> Number { return ${'('.repeat(80)}1${')'.repeat(80)}; }`, { maxDepth: 32 }), { code: 'SYNTAX_DEPTH' });
});

test('AC-027 parsing host-like calls never executes them or resolves imports', () => {
  const ast = parseEMSModule('import "unavailable" as plugin; fn f() -> Number { return process.exit(99); }');
  assert.equal(ast.imports[0].source, 'unavailable');
  assert.equal(ast.declarations[0].body.statements[0].value.kind, 'CallExpression');
});

test('AC-027 CLI produces AST with source locations', () => {
  const root = new URL('../', import.meta.url).pathname;
  const output = execFileSync(process.execPath, ['tools/ems.mjs', 'parse', 'examples/language-core.ems'], { cwd: root, encoding: 'utf8' });
  const ast = JSON.parse(output);
  assert.equal(ast.schemaVersion, 'ems-ast/1');
  assert.equal(ast.declarations.length, 5);
});
