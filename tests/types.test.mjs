import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { normalizeType, unifyTypes, resolveType, typeName } from '../src/frontend/types.mjs';

const syntax = source => parseEMSModule(`fn test(x: ${source}) -> ${source} { return x; }`).declarations[0].output;
const type = (source, parameters = new Set(), custom = new Map()) => normalizeType(syntax(source), parameters, custom);

test('EMS-013 structural type terms normalize array spellings without source positions', () => {
  assert.deepEqual(type('Number[]'), type('Array<Number>'));
  assert.deepEqual(type('NumberArray'), type('Array<Number>'));
  assert.equal(typeName(type('Map<String,Array<Result<Number,String>>>')), 'Map<String,Array<Result<Number,String>>>');
  assert.equal(Object.hasOwn(type('Number'), 'location'), false);
});

test('EMS-013 generic constraints infer nested arguments consistently', () => {
  const generic = type('Result<Array<T>,E>', new Set(['T', 'E']));
  const actual = type('Result<Array<Number>,String>');
  const substitutions = unifyTypes(generic, actual);
  assert.equal(typeName(substitutions.get('T')), 'Number');
  assert.equal(typeName(substitutions.get('E')), 'String');
  assert.deepEqual(resolveType(generic, substitutions), actual);
  assert.throws(() => unifyTypes(type('T', new Set(['T'])), type('Boolean'), substitutions), { code: 'TYPE_MISMATCH' });
});

test('EMS-013 generic occurs check rejects infinite types', () => {
  const parameters = new Set(['T']);
  assert.throws(() => unifyTypes(type('T', parameters), type('Array<T>', parameters)), { code: 'RECURSIVE_TYPE' });
});

test('EMS-013 structural matching never coerces collection elements or resource identity', () => {
  assert.throws(() => unifyTypes(type('Array<Number>'), type('Array<String>')), { code: 'TYPE_MISMATCH' });
  const custom = new Map([['File', 0], ['Camera', 0]]);
  assert.throws(() => unifyTypes(type('ResourceHandle<File>', new Set(), custom), type('ResourceHandle<Camera>', new Set(), custom)), { code: 'TYPE_MISMATCH' });
});

for (const source of ['Unknown', 'Array', 'Array<Number,String>', 'Number<String>', 'Result<Number>', 'Future']) {
  test(`EMS-013 rejects unsupported type or wrong arity: ${source}`, () => {
    assert.throws(() => type(source), error => {
      assert.ok(['UNKNOWN_TYPE', 'TYPE_ARITY'].includes(error.code));
      assert.ok(error.details.location.start.line >= 1);
      return true;
    });
  });
}

test('EMS-013 declared nominal constructors and generic variables stay distinct', () => {
  assert.equal(typeName(type('Sample<Number>', new Set(), new Map([['Sample', 1]]))), 'Sample<Number>');
  assert.throws(() => type('T<Number>', new Set(['T'])), { code: 'TYPE_ARITY' });
});
