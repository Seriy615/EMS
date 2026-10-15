# Typed array operation contracts — AC-114 reference profile

Следующий срез EMS-045 после исполняемых Array<T> (AC-113). Операции массива
являются конкретными типизированными atomic contracts в том же semantic IR,
а не новым evaluator или отдельной сущностью алгоритма.

## Операции

| Source contract family | Inputs | Output |
|---|---|---|
| std.array.length | values:Array<T> | Number |
| std.array.at | values:Array<T>, index:Number | T |
| std.array.append | values:Array<T>, value:T | Array<T> |
| std.array.concat | a:Array<T>, b:Array<T> | Array<T> |
| std.array.reverse | values:Array<T> | Array<T> |
| std.array.slice | values:Array<T>, start:Number, end:Number | Array<T> |
| std.array.removeAt | values:Array<T>, index:Number | Array<T> |
| std.array.contains | values:Array<T>, value:T | Boolean |
| std.array.set | values:Array<T>, index:Number, value:T | Array<T> |
| std.array.insertAt | values:Array<T>, index:Number, value:T | Array<T> |

T — конкретный serializable finite control type: primitive, array, Option/Result
с допустимыми payload. Live handles не становятся допустимыми atomic ABI values.
Все операции pure, synchronous, deterministic, version1.0.0, effects/capabilities[].
For append/set/insert/delete/concat/reverse/slice результат — новый массив.
Атомарная граница отделяет вложенные значения deep copy, включая at результата.
Contains использует structural value equality без coercion/нормализации.

Индекс — safe integer,0≤index<length; insertAt также допускает index==length.
Slice — строгий half-open0≤start≤end≤length. Ошибка INDEX_RANGE без clipping.
Новые generic array outputs проверяются AC-113 валидатором (VALUE_LIMIT,
TYPE_MISMATCH); размер не скрыто обрезается. Signed zero сохраняется.

## Специализация и контракты

Frontend выводит T и проверяет все аргументы, generic user contracts и contextual
empty arrays. Lowering создаёт version-pinned atomic reference с exact concrete
inputs/output. ID: `std.array.<operation>.T<lowercase ASCII hex of canonical T>`.
Например T=String даёт суффикс T537472696e67. Это публичная стабильная схема
имени стандартного встроенного контракта, не криптографическая подпись.

Registry восстанавливает только закрытый trusted recipe такой специализации,
без source evaluation, plugin search, network или выполнения пользовательского
кода. Cold IR parse/run/build восстанавливает те же concrete interfaces.
Создание и emitter используют одно операционное тело. Cache ограничивает1024
новые recipe instances на Registry. Compile специализации выполняется в отдельной
Registry, не меняя переданный base registry.

Private callback/metadata witness проверяется при lowering, lock и sealing;
подмена одноимённой реализации не принимается как встроенная. Plain Registry
остаётся trusted-host API, не sandbox. Lock использует отдельный trusted ABI
ems-stdlib-typed-array/1; это не source-byte attestation и не гарантия против
злонамеренного host. Origin/inspection классификация автоматически не ослаблена:
новые операции там пока остаются opaque/conservative.

Существующие numeric std.array.* сохраняют прежние finite callbacks, IDs и IR.
Без дополнительного type context допустимый прежде `std.array.length([])`
по-прежнему выбирает legacy NumberArray. Явный String/Boolean/generic context
определяет соответствующий T; старый default не подменяет известный новый тип.
Неразрешённый тип без допустимого legacy fallback даёт CANNOT_INFER. Source
function и custom binding с тем же именем сохраняют свой обычный приоритет;
специализация не обходит их. Forced callbacks прежних map/filter не меняются.
Explicit finite call profile отвергает специализации; auto выбирает общий IR2.
Effects аргументов не стираются pure операцией: policy preflight и evaluation
перед вызовом остаются действительными.

## Каталог и самостоятельное исполнение

`npm run stdlib:catalog` выдаёт ems-stdlib-catalog/3:37 installed finite contracts,
2 прежних callback templates и10 genericContracts с signatures/version/policy/
description. Template — compile-time family; concrete instance — executable atom.
Все concrete T не перечисляются как installed functions: каталог публикует семейства и правила специализации.
Descriptions concrete instances используют шаблоны с фактическими operands,
в том числе для блок-схем. Instance description не меняет исполнение.

```
node tools/ems.mjs module-run examples/typed-array-operations.ems --entry Main '{"values":["old","remove","keep"]}'
node tools/ems.mjs module-ir examples/typed-array-operations.ems --entry Main --out dist/array-ops.ir.json
node tools/ems.mjs ir-run dist/array-ops.ir.json '{"values":["old","remove","keep"]}'
```

Ожидается `["first","keep","EMS"]`. Exported standalone module не импортирует
EMS; программы можно запечатывать в реальные atomic packages и исполнять с
проверенным lock. Сохранённый UI text handler также восстанавливает atomic
instances в новой state Registry и обновляет подтверждённое UI state.

## Приёмка и границы

18 новых tests: все10 операций в Runtime/standalone/cold IR, generic user method,
empty inference, legacy finite IR/defaults, bounds/slice/typing/profile отказ,
base-registry isolation, spoofed implementation refusal, argument effects,
copying/signed-zero/limits, descriptions, lock/sealing/consumer и настоящий UI state.
Chromium: реальный text Worker, затем скачанный module с другим входом после
shutdown EMS origin. Full acceptance evidence — docs/qa/STATUS.md.

Map/Set, generic map/filter callbacks, generic sort/comparator, persistent rich UI state и full text↔visual projection остаются открытыми.
[AC-115](RICH_CONTRACT_FLOW.md) добавляет ordinary explicit-flow/2 ports для этих типов.
Глобальная цель PROJECT_GOAL.md и EMS-045 не завершены.
