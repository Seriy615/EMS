import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {ARRAY_CONTRACT_TEMPLATES} from '../src/stdlib/typed-array-contracts.mjs';
import {CONTRACT_TITLES,typeLabel,contractCategory} from '../web/contract-labels.mjs';
test('every core and array contract has a Russian presentation name without changing canonical types',()=>{
 for(const id of new Set([...createCoreRegistry().items.keys(),...ARRAY_CONTRACT_TEMPLATES.map(item=>item.id)]))assert.match(CONTRACT_TITLES[id],/[А-Яа-я]/,id);
 assert.equal(typeLabel('Map<String,Array<Option<Result<Number,Boolean>>>>'),'Словарь<Текст, Массив<Возможно<Результат<Число, Да / нет>>>>');
 assert.equal(typeLabel('user.Custom'),'user.Custom');
 assert.equal(Object.hasOwn(CONTRACT_TITLES,'toString'),false);
});

test('catalog categories describe standard contracts and safely keep unknown names in project contracts',()=>{assert.equal(contractCategory('std.number.floor').title,'Числа и сравнения');assert.equal(contractCategory('std.control.If').title,'Условия и циклы');for(const id of ['user.Custom','user.__proto__','user.constructor'])assert.deepEqual(contractCategory(id),{key:'custom',title:'Контракты проекта'});});
