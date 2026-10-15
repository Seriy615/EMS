import {fail} from '../reference/errors.mjs';

/** Kernel implementations lower into the existing checked IR; they are not eager host-function substitutes. */
const definitions=[
 ['std.control.If','if','Условие','control',{condition:'Boolean'},{yes:'Activation',no:'Activation'},'if true { } else { }','IfStatement'],
 ['std.control.While','while','Цикл по условию','control',{condition:'Boolean'},{body:'Activation',done:'Activation'},'while false { }','WhileStatement'],
 ['std.control.For','for','Цикл по массиву','control',{values:'Array<T>'},{item:'T',body:'Activation',done:'Activation'},'for item in std.value.NumberArray([]) { }','ForStatement'],
 ['std.storage.Variable','variable','Переменная','value',{value:'T'},{value:'T'},'let mut variable = 0;','LetDeclaration'],
 ['std.collection.Array','array','Массив','array',{}, {value:'Array<Number>'},'let values = [1, 2, 3];','ArrayExpression'],
 ['std.collection.At','index','Индекс массива','array',{values:'Array<T>',index:'Number'},{value:'T'},'let element = [1, 2, 3][0];','IndexExpression'],
 ['std.control.Break','break','Выход из цикла','control',{}, {},'break;','BreakStatement'],
 ['std.control.Continue','continue','Следующая итерация','control',{}, {},'continue;','ContinueStatement']
];
export const KERNEL_CONTRACTS=Object.freeze(definitions.map(([id,key,title,category,inputs,outputs,source,opcode])=>Object.freeze({
 id,version:'1.0.0',kind:'atomic',key,title,category,
 interface:Object.freeze({schemaVersion:'ems-kernel-interface/1',id,version:'1.0.0',inputs:Object.freeze(Object.entries(inputs).map(([name,type])=>Object.freeze({name,type}))),outputs:Object.freeze(Object.entries(outputs).map(([name,type])=>Object.freeze({name,type}))),effects:Object.freeze([]),capabilities:Object.freeze([])}),
 implementation:Object.freeze({kind:'intrinsic',target:'ems-ir/2',opcode,source})
})));
export function kernelContract(id){return KERNEL_CONTRACTS.find(item=>item.id===id)??null;}
export function instantiateKernelContract(id){const item=kernelContract(id);if(!item)fail('MISSING_CONTRACT','Unknown kernel contract');return item.implementation.source;}
export function nodeKernelContract(node){const id=node.storage?'std.storage.Variable':node.condition?'std.control.If':node.loop?.kind==='while'?'std.control.While':node.loop?.kind==='for'?'std.control.For':null;return id?kernelContract(id):null;}
