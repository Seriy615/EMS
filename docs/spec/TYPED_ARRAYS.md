# Typed Array<T> — AC-113 reference semantics

Исполняемый control/algebraic профиль расширен однородными Array<T>. Это реальное
frontend→typed IR2→Runtime/standalone исполнение, не только распознавание типа.
Существующий NumberArray и finite graph/host ABI сохраняются.

## Типы и значения

T может быть String, Boolean, Number, другой Array, Option или Result с допустимым
payload. Применяются существующие правила отдельных Future/Stream/Resource profiles;
расширение не разрешает перенос живых handles через program input/output. Map,
Set, Tuple, Record и Union этим срезом не реализуются.

Frontend `Array<Number>`/`Number[]` нормализуется в legacy NumberArray. Например,
`Array<Array<Number>>` становится `Array<NumberArray>`. Новый generic массив
выбирает algebraic control profile даже без if/for или tagged constructors.
Finite call IR не начинает принимать rich values неявно.

В API — настоящий dense JS Array с Array.prototype, только собственные data
элементы0..length-1 и length. Sparse arrays, accessors, лишние string/symbol keys,
неправильные типы, non-finite numbers отвергаются. Валидатор не читает element
accessors. Typed generic array value ограничен10000 суммарными элементами его
массивов, включая вложенные NumberArray; type depth≤32/type string≤4096.
Отдельный legacy NumberArray сохраняет прежние ограничения.

Array expressions получают contextual element type (в том числе для []), indexing
возвращает T и требует safe integer index0≤i<length; отказ BOUNDS_ERROR одинаков в
Runtime и standalone. For binding имеет T во frontend, IR, runtime scope и
inspection declarations. Structural equality рекурсивна по массивам и tagged
payload; числовое сравнение сохраняет прежнее0===-0. Signed zero сохраняется в
IR literals и самостоятельном исполнении; обычный JSON API остаётся обычным JSON.

Нет неявного вызова контрактов или изменения порядка эффектов. Обычные pure
контракты, например std.text.concat, работают внутри цикла как прежде.
Atomic contracts с явно выбранным ems-algebraic/1 value profile могут объявлять
конкретные Array<T> inputs/outputs. Их callback/emitter получает detached deep
copy вложенных массивов; mutable host callback не изменяет аргумент вызывающей
EMS программы. Это доверенный локальный callback, не arbitrary foreign ABI.

## Воспроизводимый пример

```
node tools/ems.mjs module-run examples/typed-arrays.ems --entry Main '{"values":["EMS"," ","arrays"]}'
node tools/ems.mjs module-build examples/typed-arrays.ems --entry Main --out dist/typed-arrays.mjs
```

Ожидается `EMS arrays`. В том же файле CountTrue получает Array<Boolean>.
В Studio пример можно исполнять в «Код EMS» с JSON arguments и экспортировать
самостоятельный JS module.

## Приёмка и открытые части

11 focused tests: String/Boolean/nested/tagged/generic arrays; empty/contextual
literals; IR serialize/parse; bounds/type/accessor/size refusals; nested host copy;
правильный String for-binding в diagnostics. Chromium проверяет настоящий text
Worker и скачанный module в отдельном процессе после остановки EMS server.

Новый explicit contract-flow canvas, persistent UI state и finite graph/IDL пока
не принимают эти новые типы. Они продолжают явно отвергать неподдерживаемый тип;
нет фиктивной поддержки UI или импорта native array ABI. [Generic operation contracts AC-114](TYPED_ARRAY_CONTRACTS.md) реализуют append/set/removeAt и ещё семь операций;
словари и полная библиотека коллекций остаются задачами EMS-045. Числовой
std.array.removeAt уже существует в прежнем finite profile. Глобальная цель активна.
