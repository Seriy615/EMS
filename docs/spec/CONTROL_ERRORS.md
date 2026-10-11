# Пользовательские исключения и finally: control error profile

EMS-015, AC-034, G-01/03/11/12. Профиль `ems-control-errors/1`, semantic artifact `ems-ir/2`. Реализация: `src/semantics/control-errors.mjs`, общий control validator/runtime/compiler. Это исполняемый error slice; Option/Result/match реализованы отдельным расширением CONTROL_ALGEBRAIC.md; полный error IDL, Future добавлены в CONTROL_FUTURES.md; Stream добавлен в CONTROL_STREAMS.md; resource lifecycle ещё впереди.

## Значения и catch

`throw expression` сначала вычисляет и проверяет значение (Number, NumberArray, Boolean или String), затем создаёт envelope `ems-user-throw/1`: name=EmsError, code=USER_THROW, details={}, valueType и value. Message всегда `EMS user value thrown`, без payload. Массив копируется, signed zero сохраняется. Envelope — начальный reference протокол, не окончательный FFI exception ABI или секретная граница.

`catch (binding: T)` перехватывает только такой user envelope с собственными protocol fields и точным совпадением finite T. Унаследованная prototype metadata не становится throw envelope. Aliases и generic parameters разрешаются checker и specialization перед выполнением. Binding immutable, живёт в отдельной lexical scope и может затенить outer имя. Handler получает типизированный payload; новый throw binding создаёт новый user envelope. Неподходящий тип не вызывает handler и сохраняет исходный отказ.

Обычные host exceptions, включая null/строки, не превращаются в user values. Arithmetic/type/bounds errors сохраняют собственные EmsError codes; catch String не получает их message. Адаптеры, желающие выдавать typed user errors, требуют explicit протокола; доверенный host может подделать envelope, registry пока не sandbox. Полный structured error type/Result conversion и imported-library exception mapping относятся к следующим срезам.

Unhandled USER_THROW содержит payload для вызывающего API; CLI печатает только общий message/code. Reactor trace сохраняет error code, не payload/message/stack. recordTrace всё ещё opt-in; обычные inputs/state/output могут содержать чувствительные значения и остаются caller-owned.

## IR и порядок

Профиль добавляет `throw {value}` и `try {body, handler, finalizer}` в body statements. Handler — null либо `{binding,type,body}`; finalizer — null либо statement array. Требуется handler или finalizer; empty finally отличается от отсутствующего. Старый `ems-control-finite/1` отвергает эти statements с UNSUPPORTED_PROFILE, в том числе вложенные. Схема `schemas/control-ir.schema.json` разделяет оба профиля; executable verifier дополнительно проверяет catch scopes/types, return coverage и permissions.

Function policy по-прежнему включает все синтаксические calls в try/catch/finally, даже если handler/finalizer редко достигаются. Preflight выполняется до первого action, как в control finite profile. Обработка исключения не убирает объявленный host effect и не выдаёт grant.

Последовательность: вычислить try body; при подходящем user throw — catch body; затем finalizer. Finalizer видит outer scope, но не private locals try/catch. Он выполняется на normal completion, pending return, break/continue и ordinary exception в пределах оставшегося control budget. Return expression вычисляется до finalizer: изменение local cell после него не изменяет уже выбранное primitive значение.

Abrupt finalizer outcome заменяет pending ordinary outcome: return заменяет обычный return/user throw/нефатальную arithmetic error, throw заменяет прежний ordinary throw, break/continue могут заменить ordinary pending error внутри loop. Это явная семантика, одинаковая у runtime и standalone; отсутствие handler не означает отсутствие finalizer. Пустой finalizer не подавляет ошибку.

## Терминальные отказы и cleanup границы

CANCELLED, STEP_LIMIT, CALL_DEPTH и EVALUATION_DEPTH — terminal control failures; future profile добавляет FUTURE_LIMIT, stream profile — STREAM_LIMIT/STREAM_PENDING_LIMIT. Catch не сопоставляет их с user values. Если такой отказ уже pending, даже return/break/новая ошибка finalizer не могут его подавить: сохраняется исходный code/details. Новый terminal отказ во время ordinary finalizer имеет обычный приоритет новой ошибки. Guard совпадает в runtime и generated JS.

Finalizer использует тот же budget и signal; каждый его statement/expression учитывается обычными ticks. После abort или STEP_LIMIT guard может остановить его до первой инструкции. Поэтому этот finally **не** гарантирует освобождение ресурсов при cancellation/exhaustion. Бounded cleanup scope с самостоятельным lifecycle protocol ещё не реализован; нельзя выдавать данную функциональность за using/ResourceHandle cleanup. Synchronous trusted host work по-прежнему не preempted.

ReactorSession фиксирует writes, если ошибка обработана и handler успешно возвращает результат. Unhandled error/terminal failure откатывает owned draft state, включая staged finalizer writes. Внешние IO effects не откатываются. Поздние writes после отмены запрещены существующим transaction context.

## Standalone и evidence

Pure backend генерирует JavaScript try/catch/finally с явной typed matching и protected terminal propagation; AST/EMS imports в output нет. Новые envelopes/value checks используются одинаково в interpreter и standalone. Неподдерживаемые effects по-прежнему UNSUPPORTED_TARGET, включая finalizer-only effects.

```bash
node tools/ems.mjs module-ir examples/error-recovery.ems --entry demo.ErrorRecovery --out dist/recovery.ir.json
node tools/ems.mjs ir-run dist/recovery.ir.json '{"value":-5}'
node tools/ems.mjs ir-build dist/recovery.ir.json --out dist/recovery.mjs
```

Пример демонстрирует numeric user-value recovery. Tests: `tests/control-errors.test.mjs` — 29 positive/negative/differential tests: primitive/array/alias/generic catches, nesting/rethrow, signed zero, lexical shadowing, return/break/continue/finally priority, terminal failure preservation, exact budgets, malformed/profile IR, effects, state rollback/replay, trace omission и independent CLI/process export. Node evidence не закрывает browser/native P1. Следующая часть EMS-015 — resource lifecycle.
