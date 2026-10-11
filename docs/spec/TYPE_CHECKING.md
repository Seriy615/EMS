# Проверка типов AST и lowering чистого профиля

**Задача:** EMS-013. **Цель:** G-01/02/03/05/11/12. **Acceptance:** AC-028.  
`src/frontend/types.mjs`: структурные типы и unification. `src/frontend/check.mjs`: located AST checker. `src/frontend/lower.mjs`: linking и lowering исполняемого чистого SSA-поднабора к существующему IR. Это следующий срез M1, а не полноценный runtime всех конструкций AST.

## Типы и разрешение имён

Checker поддерживает Number, Boolean, String, Array, Option, Result, Map, Set, Tuple, Union, Future, Stream и параметризованный ResourceHandle. `Number[]`, `Array<Number>` и reference-имя `NumberArray` нормализуются к одному структурному типу. Generic arity проверяется; неизвестные типы отвергаются. Пользовательский `type Name<T> = ...` является расширяемым alias, а не выдуманной host-реализацией. Рекурсивные aliases запрещены; подстановка одновременно переименовывает параметры и не создаёт циклы при `Pair<U,T>`.

Generic функция проверяется для всех допустимых T: собственные параметры жёсткие, `fn identity<T>(x: T) -> T { return 1; }` запрещена. Каждый вызов получает отдельные свежие переменные; аргументы/ожидаемый результат выводят специализацию. Occurs check запрещает бесконечное `T = Array<T>`. Numeric coercion отсутствует; типы коллекций и resource tags совместимы только при точном совпадении. Union допускает значения объявленных вариантов; reorder/evolution семантики union требует отдельной версии.

Все объявления функций известны до проверки тел, что допускает взаимные ссылки и типизацию рекурсии. Imports разрешаются только через переданные checker namespace bindings и ничего не загружают. Core arithmetic call names и квалифицированные registry ID разрешаются по реальным сигнатурам. `process.exit(...)`, неизвестный контракт и несуществующая библиотека отвергаются до исполнения. `extern` является декларацией, но перед запуском обязана совпасть с реальной registry-реализацией; отсутствие реализации — ошибка связывания.

## Локальные проверки

Проверяются сигнатуры, количество и типы аргументов, объявления/присваивания, отсутствие неизвестных имён и дубликатов, область жизни имён, Boolean-условия, коллекция в `for`, `break/continue` внутри цикла, `await` внутри async и над Future, допустимый возвращаемый тип и наличие возврата/throw на всех статически подтверждённых путях. Параметры неизменяемы; переменная требует `let mut` для присваивания. Shadowing локальных имён текущего scope запрещён; loop binding имеет отдельный scope. Необработанный выход из while консервативно не доказывает возврат.

Массивы выводят общий точный тип элемента; пустой массив требует ожидаемый тип. Record expression получает структурные имена/типы полей; неизвестное поле запрещено. Индексация требует Array и Number index; проверка целочисленности/границ относится к runtime-профилю коллекций и ещё не реализована.

Some/None и Ok/Err имеют типизированные payload. None и один из Result-конструкторов требуют ожидаемый полный тип. Match проверяет constructor/payload, области pattern binding и exhaustiveness для Option, Result, Boolean либо catch-all. Ограниченный pattern `Some(1)` не закрывает все Some; вложенный `Some(Some(v))` не закрывает `Some(None)`. Объединение нескольких ограниченных nested patterns анализируется консервативно и может требовать catch-all. Wrong payload и arm после catch-all отвергаются.

ResourceHandle проверяет типовую идентичность, `using` требует handle. Это **не** доказательство ownership, закрытия, thread affinity или FFI ABI; lifecycle реализуется отдельно. Типизация try/catch требует явного типа catch binding в этом профиле; преобразование реальных host exceptions и полный error IDL остаются EMS-016. Effect pass EMS-014 проверяет декларации и транзитивные вызовы; чистота доверенного host-кода по-прежнему зависит от честности его metadata.

## Исполняемый путь

Lowering принимает неизменяемые SSA `let`, return, арифметику `+ - * /`, unary sign, литералы, постоянные NumberArray и вызовы чистых функций/контрактов. Локальная функция становится обычным composite; generic helper специализируется по конкретным входам и также становится composite. Registry копируется в область сборки; исходный registry не изменяется.

Профиль остаётся demand-driven: чистый SSA binding, не достижимый от returns, не выполняется. Порядок портов/ошибок определяет `LANGUAGE_SEMANTICS.md`. Control-flow, mutable state, async, вычисляемые массивы, algebraic values и остальные runtime-типы требуют расширенного IR и отвергаются с `UNSUPPORTED_PROFILE`, а не исполняются произвольным JS. Рекурсивный вызов допустим при проверке типов, но запрещён данным backend. Исполнители остаются теми же `executeIR`/`compileIRToJS`; второй evaluator не добавлен.

Lowering возвращает IR, linked registry и отдельный provenance с исходными позициями функций/узлов. Полный переносимый package lock/serialization linked bundle — EMS-016/M5. IR одного вызывающего модуля пока требует его связанного registry; standalone compiler раскрывает composite и экспортирует самодостаточный JS.

```bash
node tools/ems.mjs check examples/avg5.ems
node tools/ems.mjs module-run examples/avg5.ems --entry demo.AverageOfFiveArithmetic '{"times":[12.4,11.85,13.2,12.1,14]}'
node tools/ems.mjs module-build examples/avg5.ems --entry demo.AverageOfFiveArithmetic --out dist/typed-avg5.mjs
```

По умолчанию type expansion ограничена 20 000 узлами, expression traversal — 100 000; на превышение возвращается located `TYPE_LIMIT`. Это budget checker, не изоляция произвольного host-кода.

AC-028: `tests/types.test.mjs`, `tests/check.test.mjs`, `tests/lower.test.mjs`. Проверяются типы, generic soundness, aliases, unions/collections/resource types, algebraic patterns, ошибочные scope/control/async cases, явное разрешение imports и budgets. Новый AST frontend выполняет arithmetic AVG5 через общий IR и runtime, специализирует generic helpers и экспортирует JS, проверенный отдельным процессом вне workspace. Это закрывает задачу типизации и начальный pure lowering; M1 остаётся открыт до effects, полного runtime control/state/async, IDL и полного conformance harness.

## Эффекты, интерфейсные требования и текстовое исполнение — AC-031

`typecheckModule` теперь возвращает `policies: Map<name, { effects, capabilities }>` вместе с типами и вызовами. Отдельный `checkModuleEffects` строит call graph и распространяет декларации до неподвижной точки, в том числе через forward calls, generic helpers и рекурсивные связи. Проверка консервативна: учитывает оба ответвления, unused bindings и обработчики; catch не удаляет наблюдаемые эффекты. Ни inference, ни extern linking checks не вызывают host implementations.

Без `requires` policy выводится. `requires pure` утверждает отсутствие effects и capabilities. `requires effect("log.write"), capability("stdout.write")` задаёт допустимый интерфейсный набор; inference не может его превышать (`EFFECT_MISMATCH` с source location). Набор может быть шире actual calls: interface requirements сохраняются и требуют grants даже при отсутствии наблюдаемого вызова. Неизвестное имя requirement, повтор pure или сочетание pure с effect/capability — `INVALID_REQUIREMENT`; пустые/повторные policy names — `INVALID_POLICY`.

Связанный extern получает реальные транзитивные declarations из registry: ложный `requires pure` отклоняется. Несвязанный extern ещё можно проверить как декларацию; его metadata не является доказательством реализации. Lowering по-прежнему требует реального binding и проверяет типовую сигнатуру, иначе `MISSING_CONTRACT`/`BINDING_SIGNATURE`. Это не загрузка произвольной библиотеки и не sandbox.

Для straight-line effectful SSA lowering создаёт sequence в порядке создания операций: let statements, standalone expression statements, left-to-right arguments и return. Все такие операции, включая чистые intermediate calls, исполняются один раз по sequence: ранняя арифметическая ошибка не переносится за поздний side effect. Pure expression statements также используют sequence, и её семантика сохраняется через nested helpers. Чистый legacy SSA без expression statements сохраняет demand-driven let semantics; полноценный imperative/control профиль относится к EMS-015. Мутация, loops, await и resource lifecycle пока отвергаются при lowering.

Программа с policy или sequence выбирает `ems-effects-finite/1`; обычный pure SSA — `ems-core-finite/1`. Root requirements и transitive policy входят в semantic IR; provenance остаётся sidecar. Standalone compiler выполняет чистые sequences с теми же ошибками, но явно отвергает реальные effects/capabilities: bindings для IO export ещё не реализованы.

`node examples/effect-text.mjs` проверяет и исполняет `examples/effect-text.ems` с доверенным stdout adapter, печатает `first`, затем `second`. В API используются `executeIR(..., {capabilities, allowedEffects})`; CLI `module-run` допускает `[--policy <execution-policy.json>]` после input JSON. Файл содержит только capabilities и allowedEffects (см. `schemas/execution-policy.schema.json`), не runtime internals. Нет неявного grant all.

Evidence: `tests/frontend-effects.test.mjs`, расширенный `tests/effect-ir.test.mjs`, `tools/verify.mjs`; AC-029..031. EMS-014 закрывает начальный effect/capability kernel, а не OS permission broker, production scheduler или поддержку file/network/device APIs.
