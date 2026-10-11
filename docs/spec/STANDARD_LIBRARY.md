# Стандартная библиотека finite contracts v1

EMS-034 IN_PROGRESS, AC-048. Реализована библиотека primitive value/logic/comparison/select/text/NumberArray: 36 атомарных контрактов в дополнение к 7 существующим core arithmetic contracts. Общие типы/IR/исполнение/compiler сохраняются. Typed static Map/Filter теперь реализованы в исходнике через общий control IR (см. COLLECTION_TEMPLATES.md); visual authoring/persistence остаются открытыми, поэтому EMS-034 не закрыта.

## Интерфейс, implementation и каталог

STANDARD_INTERFACES — отдельно проверяемые ems-contract-interface/1 data descriptors: exact ordered ports, output, version1.0.0, deterministic semantics, effects/capabilities [], declared errors, empty supported pre/post predicates. Operational range/format rules ниже нормативные; ограниченный predicate DSL не изображает их как prose assertions. STANDARD_CONTRACTS содержит trusted operational bodies и UI-independent category/summary; эти функции не входят в IDL. Package/license/visibility не выводятся из atomicity.

createCoreRegistry устанавливает actual trusted finite implementation каждого std.*. Каждый operational body используется runtime и trusted emitter, который включает эту функцию в standalone output с существующим __fail/type helpers; пользовательский JS или source из каталога не исполняется. Intrinsic witness ABI ems-stdlib-finite/1 проверяет canonical callback/emitter/signature/id/version/policy; подмена callback не становится intrinsic из-за std.* имени. Старый core ABI остаётся ems-core-finite/1. Это trusted runtime root, не binary attestation/sandbox. Public IDL можно привязать через existing explicit registerContractBinding; boundary/error checks и standalone компиляция проверены.

`node tools/stdlib-catalog.mjs` (или npm run stdlib:catalog) выдаёт ems-stdlib-catalog/2 JSON с отдельными interface и implementation provenance плюс category/summary. Каталог описывает реально установленные операции и не утверждает discovery сторонних библиотек, AI composition, marketplace либо поддержку native targets.

## Операции и семантика

| IDs | Ordered inputs → output | Правило |
|---|---|---|
| std.value.Number / Boolean / String / NumberArray | value:T → T | Identity; array возвращается копией |
| std.select.Number / Boolean / String / NumberArray | condition:Boolean, whenTrue:T, whenFalse:T → T | Выбор из уже вычисленных значений; array копируется |
| std.logic.and / or | a:Boolean,b:Boolean → Boolean | Eager Boolean operations |
| std.logic.not | value:Boolean → Boolean | Negation |
| std.number.equal / notEqual / less / lessEqual / greater / greaterEqual | a:Number,b:Number → Boolean | Finite binary64 comparison; +0 и -0 equal |
| std.number.abs / floor / ceil / round | value:Number → Number | ECMAScript binary64 rules; round ties toward +∞, -0 сохраняется где требуется |
| std.text.concat / equal | a:String,b:String → String / Boolean | Exact UTF-16 sequences, без Unicode normalization |
| std.text.length | text:String → Number | ECMAScript string iterator elements: surrogate pair =1, unpaired surrogate =1 |
| std.text.contains | text:String,part:String → Boolean | Exact UTF-16 substring; empty part присутствует |
| std.text.slice | text:String,start:Number,end:Number → String | Half-open interval по string iterator elements; strict safe integers 0<=start<=end<=length, иначе INDEX_RANGE |
| std.text.toNumber | text:String → Number | Strict decimal `[+-]?(digits[.digits]?|.digits)([eE][+-]?digits)?`; finite binary64, иначе NUMBER_FORMAT |
| std.text.fromNumber | value:Number → String | Locale-independent ECMAScript decimal rendering; -0 становится "-0" |
| std.array.length | values:NumberArray → Number | Число элементов |
| std.array.at | values:NumberArray,index:Number → Number | Safe integer 0<=index<length, иначе INDEX_RANGE |
| std.array.append | values:NumberArray,value:Number → NumberArray | Новый массив |
| std.array.concat | a:NumberArray,b:NumberArray → NumberArray | Новый concatenated массив |
| std.array.reverse / sort | values:NumberArray → NumberArray | Копия; stable ascending numeric sort, equal signed zeros сохраняют взаимный порядок |
| std.array.slice | values:NumberArray,start:Number,end:Number → NumberArray | Strict safe integer half-open interval; иначе INDEX_RANGE |
| std.array.contains | values:NumberArray,value:Number → Boolean | Finite numeric membership; +0/-0 equal |

В decimal parsing нет whitespace trimming, hex, NaN/Infinity, locale separators или partial parse. Overflow отвергается; underflow округляется по binary64, включая -0. Все четыре reference types проверяются существующим ядром на ports/results; finite dense NumberArray без NaN/Infinity. Inputs не мутируются. Сложность отдельного atomic body зависит от размера данных; existing execution steps учитывают операции, а не каждый элемент внутренней реализации. Studio disposable Worker deadline остаётся 5s; production memory/cost model и higher-order budgets открыты.

Select — **не ленивый if**. Вызов std.select.Number(true,5,core.div(1,0)) завершается DIV_BY_ZERO; branch expressions — зависимости вычисленных входов. Аналогично std.logic.and/or не заменяют языковые short-circuit &&/||. Ленивая control-семантика существующего if/&&/|| проверяется в control IR. Map/Filter принимают статические typed contract references с signature/effect checks и shared control budgets; см. [COLLECTION_TEMPLATES.md](COLLECTION_TEMPLATES.md). String callback values не принимаются.

## Studio и evidence

Каталог разделён по категориям; поиск включает display name, ID и typed signature. Подписи портов видны до добавления; custom composites остаются отдельной категорией с Add/Open/Delete. Самостоятельный graph/text пример examples/stdlib-report.ems и examples/studio-library.ems.json возвращает "sum=6" для [3,-1,4]. Dropdown «Массив → текст» использует сохранённый реальный проект.

tests/stdlib.test.mjs: все36 operations сверяются с независимыми value oracles через runtime/serialized IR/standalone, direct copy/nonmutation, negative formats/indices/ports, new-process export, source loops, eager vs lazy, public IDL boundary и lock drift. tests/browser/stdlib.test.mjs: все36 actual Chromium runtime плюс independent static standalone после закрытия runtime origin; UI строит text/comparison/select/array graphs через controls, search/categories, example Run и persisted reopen. Полный MVP, visual Map/Filter authoring/persistence, DOM counter и deploy не завершены.
