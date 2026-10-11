import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { typeName } from '../src/frontend/types.mjs';
import { createCoreRegistry } from '../src/reference/index.mjs';

const check = (source, options) => typecheckModule(parseEMSModule(source), createCoreRegistry(), options);

test('EMS-013 checks numeric SSA, core signatures and located expression types', () => {
  const checked = check('contract average(x: Number[], n: Number) -> Number { let total = sum(x); return total / n; }');
  const declaration = checked.ast.declarations[0];
  assert.equal(typeName(checked.signatures.get('average').output), 'Number');
  assert.equal(typeName(checked.types.get(declaration.body.statements[1].value)), 'Number');
});

test('EMS-013 generic function instantiations stay independent', () => {
  const checked = check('fn identity<T>(x: T) -> T { return x; } fn test(x: Number) -> Boolean { let n = identity(x); return identity(true); }');
  const calls = [...checked.calls.values()];
  assert.deepEqual(calls.map(call => typeName(call.output)), ['Number', 'Boolean']);
});

test('EMS-013 aliases, collections and contextual empty arrays normalize', () => {
  const checked = check('type Samples<T> = Array<T>; fn test(x: Samples<Number>) -> Number[] { let empty: Number[] = []; return empty; }');
  assert.equal(typeName(checked.signatures.get('test').inputs[0].type), 'Array<Number>');
  check('type Samples<T> = Array<T>; fn identity<T>(x: Samples<T>) -> Samples<T> { return x; }');
  const swapped = check('type Pair<T,U> = Tuple<T,U>; fn swap<T,U>(x: Pair<U,T>) -> Pair<U,T> { return x; }');
  assert.equal(typeName(swapped.signatures.get('swap').output), 'Tuple<U,T>');
});

test('EMS-013 checker bounds expanding aliases and expression traversal', () => {
  assert.throws(() => check('type Pair<T> = Tuple<T,T>; fn test(x: Pair<Pair<Number>>) -> Number { return 1; }', { maxTypeNodes: 3 }), { code: 'TYPE_LIMIT' });
  assert.throws(() => check('fn test() -> Number { return 1 + 2; }', { maxExpressions: 2 }), { code: 'TYPE_LIMIT' });
});

test('EMS-013 static checking validates branches, loop scopes and mutable state', () => {
  check('fn test(x: Number[]) -> Number { let mut total = 0; for item in x { if item < 0 { continue; } total = total + item; } while total > 100 { total = total - 100; } return total; }');
  check('fn test(x: Boolean) -> String { if x { return "yes"; } else { return "no"; } }');
});

test('EMS-013 async, declared errors and resource types are checked without invoking providers', () => {
  check('extern contract load(x: String) -> Future<Number>; async fn test(x: String) -> Number { try { return await load(x); } catch (error: String) { return 0; } }');
  check('extern contract open() -> ResourceHandle<String>; fn test() -> Number { using file = open(); return 1; }');
});

test('EMS-013 union members are accepted with exact element constraints', () => {
  check('fn test(x: Boolean) -> Union<Number,String> { if x { return 1; } else { return "no"; } }');
});

test('EMS-013 import resolution uses supplied namespaces and never loads a library', () => {
  check('import "math" as math; fn test(x: Number) -> Number { return math.add(x, 1); }', { imports: new Map([['math', 'core']]) });
});

test('EMS-013 inferred records expose only declared fields', () => {
  check('fn test() -> Number { let record = { value: 1, flag: true }; return record.value; }');
});

test('EMS-013 algebraic constructors and exhaustive patterns bind the payload types', () => {
  check('fn test(x: Option<Number>) -> Number { match x { Some(value) => { return value; }, None => { return 0; } } }');
  check('fn test(x: Result<Number,String>) -> Number { match x { Ok(value) => { return value; }, Err(error) => { throw error; } } }');
  check('fn test(x: Boolean) -> Number { match x { true => { return 1; }, false => { return 0; } } }');
  check('fn test() -> Option<Number> { return Some(1); }');
  check('fn test() -> Option<Number> { return None(); }');
  check('fn test() -> Result<Number,String> { return Err("failure"); }');
});

test('EMS-013 algebraic partial patterns do not falsely establish exhaustiveness', () => {
  assert.throws(() => check('fn test(x: Option<Number>) -> Number { match x { Some(1) => { return 1; }, None => { return 0; } } }'), { code: 'NON_EXHAUSTIVE_MATCH' });
  assert.throws(() => check('fn test(x: Option<Number>) -> Number { match x { Ok(value) => { return value; }, None => { return 0; } } }'), { code: 'TYPE_MISMATCH' });
  assert.throws(() => check('fn test(x: Number) -> Number { match x { _ => { return 1; }, value => { return value; } } }'), { code: 'UNREACHABLE_CODE' });
  assert.throws(() => check('fn test() -> Option<Number> { return Some("wrong"); }'), { code: 'TYPE_MISMATCH' });
  assert.throws(() => check('fn test(x: Option<Option<Number>>) -> Number { match x { Some(Some(value)) => { return value; }, None => { return 0; } } }'), { code: 'NON_EXHAUSTIVE_MATCH' });
  assert.throws(() => check('fn test(x: Option<Number>) -> Number { match x { Some => { return 1; }, None => { return 0; } } }'), { code: 'CALL_ARITY' });
});

for (const [label, source, code] of [
  ['unknown name', 'fn test() -> Number { return missing; }', 'UNKNOWN_SYMBOL'],
  ['unknown API', 'fn test() -> Number { return process.exit(1); }', 'UNKNOWN_SYMBOL'],
  ['wrong port type', 'fn test() -> Number { return add("x", 1); }', 'TYPE_MISMATCH'],
  ['wrong arity', 'fn test() -> Number { return add(1); }', 'CALL_ARITY'],
  ['wrong return', 'fn test() -> Number { return "x"; }', 'TYPE_MISMATCH'],
  ['missing path return', 'fn test(x: Boolean) -> Number { if x { return 1; } }', 'MISSING_RETURN'],
  ['unreachable code', 'fn test() -> Number { return 1; return 2; }', 'UNREACHABLE_CODE'],
  ['immutable variable', 'fn test(x: Number) -> Number { x = 1; return x; }', 'IMMUTABLE_ASSIGNMENT'],
  ['bad condition', 'fn test() -> Number { if 1 { return 1; } return 0; }', 'TYPE_MISMATCH'],
  ['break outside loop', 'fn test() -> Number { break; }', 'INVALID_CONTROL'],
  ['await outside async', 'extern fn load() -> Future<Number>; fn test() -> Number { return await load(); }', 'INVALID_AWAIT'],
  ['await nonfuture', 'async fn test() -> Number { return await 1; }', 'TYPE_MISMATCH'],
  ['untyped empty array', 'fn test() -> Number { let x = []; return 1; }', 'CANNOT_INFER'],
  ['mixed array', 'fn test() -> Number { let x = [1, "x"]; return 1; }', 'TYPE_MISMATCH'],
  ['unknown field', 'fn test() -> Number { let x = { value: 1 }; return x.missing; }', 'UNKNOWN_MEMBER'],
  ['index nonarray', 'fn test() -> Number { return 1[0]; }', 'TYPE_MISMATCH'],
  ['loop nonarray', 'fn test() -> Number { for x in 1 {} return 0; }', 'TYPE_MISMATCH'],
  ['loop name leakage', 'fn test(x: Number[]) -> Number { for item in x {} return item; }', 'UNKNOWN_SYMBOL'],
  ['duplicate param', 'fn test(x: Number, x: Number) -> Number { return x; }', 'DUPLICATE_SYMBOL'],
  ['duplicate generic', 'fn test<T,T>(x: T) -> T { return x; }', 'DUPLICATE_SYMBOL'],
  ['recursive alias', 'type Loop<T> = Array<Loop<T>>;', 'RECURSIVE_TYPE'],
  ['wrong resource', 'fn test() -> Number { using x = 1; return x; }', 'TYPE_MISMATCH'],
  ['generic must hold for all T', 'fn wrong<T>(x: T) -> T { return 1; }', 'TYPE_MISMATCH'],
  ['generic repeated argument mismatch', 'fn first<T>(a: T, b: T) -> T { return a; } fn test() -> Number { return first(1, "x"); }', 'TYPE_MISMATCH'],
  ['unbound generic output', 'extern fn produce<T>() -> T; fn test() -> Number { let result = produce(); return 1; }', 'CANNOT_INFER'],
  ['unresolved import', 'import "missing" as missing;', 'UNRESOLVED_IMPORT'],
  ['untyped catch', 'fn test() -> Number { try { return 1; } catch (error) { return 0; } }', 'UNSUPPORTED_SYNTAX']
]) {
  test(`EMS-013 rejects ${label} before execution`, () => {
    assert.throws(() => check(source), error => {
      assert.equal(error.code, code);
      assert.ok(error.details.location.start.line >= 1);
      return true;
    });
  });
}
