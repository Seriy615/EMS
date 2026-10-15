/** Russian presentation labels; semantic contract IDs and type names stay canonical. */
export const CONTRACT_TITLES=Object.freeze({
 'core.add':'Сложение','core.sub':'Вычитание','core.mul':'Умножение','core.div':'Деление',
 'core.sum':'Сумма чисел','core.min':'Минимум','core.max':'Максимум',
 'std.value.Number':'Число','std.value.Boolean':'Да / нет','std.value.String':'Текст','std.value.NumberArray':'Список чисел',
 'std.select.Number':'Выбрать число','std.select.Boolean':'Выбрать логическое значение','std.select.String':'Выбрать текст','std.select.NumberArray':'Выбрать список чисел',
 'std.logic.and':'И','std.logic.or':'Или','std.logic.not':'Не',
 'std.number.equal':'Равно','std.number.notEqual':'Не равно','std.number.less':'Меньше','std.number.greater':'Больше','std.number.lessEqual':'Меньше или равно','std.number.greaterEqual':'Больше или равно',
 'std.number.abs':'Модуль числа','std.number.floor':'Округлить вниз','std.number.ceil':'Округлить вверх','std.number.round':'Округлить',
 'std.text.concat':'Объединить текст','std.text.equal':'Тексты равны','std.text.length':'Длина текста','std.text.contains':'Текст содержит','std.text.slice':'Фрагмент текста','std.text.toNumber':'Текст в число','std.text.fromNumber':'Число в текст',
 'std.array.length':'Длина массива','std.array.at':'Элемент массива','std.array.append':'Добавить элемент','std.array.concat':'Объединить массивы','std.array.reverse':'Перевернуть массив','std.array.sort':'Сортировать массив','std.array.slice':'Фрагмент массива','std.array.removeAt':'Удалить элемент массива','std.array.contains':'Массив содержит','std.array.set':'Заменить элемент','std.array.insertAt':'Вставить элемент'
});
const TYPES=Object.freeze({Number:'Число',String:'Текст',Boolean:'Да / нет',NumberArray:'Список чисел',Array:'Массив',Map:'Словарь',Option:'Возможно',Result:'Результат',Activation:'Исполнение'});
/** Translate nested finite type expressions without changing stored type identifiers. */
export function typeLabel(type){return String(type).replace(/\b[A-Za-z][A-Za-z0-9]*\b/g,name=>Object.hasOwn(TYPES,name)?TYPES[name]:name).replaceAll(',',', ');}
