# Состояние и события: finite reactor profile

EMS-015, G-03/11/13/14; AC-032. Реализация: `src/runtime/reactor.mjs`, общий `src/reference/runtime.mjs`. Это начальный event/state срез; расширение control-flow, Future/Stream, ресурсы и distributed scheduler остаются отдельными этапами.

## Общая программа

Descriptor `ems-reactor/1` содержит id/version, массив типизированных state slots `{id, type, initial}` и handlers `{event, program}`. `program` — существующий EMS IR v1 или structured control IR v2, без отдельного языка обработчиков. Его можно получить из текста или графа. Descriptor не содержит canvas, JavaScript callback handlers или скрытого выполнения библиотек. JSON Schema: `schemas/reactor.schema.json`; executable validator дополнительно проверяет уникальность, типы initial values, реальные state bindings и linked IR.

`createStateRegistry(base, state)` создаёт копию registry и добавляет для каждой ячейки `state.<id>.read() -> T` и `state.<id>.write(value: T) -> T`. Их эффекты/capabilities соответственно `state.read` и `state.write`. Реализация получает текущую transaction через runtime context; памяти ячеек в registry нет. Вне reactor event вызов даёт `STATE_CONTEXT`. Два session с одним registry имеют независимое состояние. Поддержаны только finite Number, NumberArray, Boolean и String; arrays копируются на входах/выходах и границах snapshots/transactions.

`ReactorSession(manifest, registry, { policy, maxQueue = 64, recordTrace = false })` связывает IR с подготовленным registry. State adapter signatures и декларации проверяются. Пользовательские atomic implementations всё ещё доверенные host-компоненты; эти проверки не изолируют злоумышленный код процесса. Политика не выдаётся автоматически. Неизвестное событие, неверный input envelope и отсутствие grants отклоняются при приёме, до постановки в очередь.

## Порядок и транзакции

`dispatch(event, inputs, {signal})` возвращает Promise результата обработчика. Принятым событиям назначаются монотонные sequence numbers; очередной handler запускается после окончания предыдущего. Runtime ожидает каждый host Promise и исполняет существующие call sequences. Порядок внешних concurrent событий определяется порядком фактического вызова dispatch, без выдуманного глобального времени.

Каждое событие начинает отдельный черновик последнего committed state. Read видит собственные staged writes. Успешное завершение и проверенный result фиксируют весь черновик атомарно перед запуском следующего события. Ошибка/отмена оставляют committed state неизменным. Вызов after completion не может менять черновик. Это **не rollback внешнего IO**: уже выполненные network/file/device действия могут сохраниться при отказе обработчика; compensations/idempotency требуют отдельных контрактов.

Очередь содержит максимум maxQueue ожидающих событий (текущий active handler не входит в этот лимит); до начала первого pump все enqueued события считаются ожидающими. Overflow даёт `QUEUE_FULL`, без автоматического drop или retry. Недопустимый maxQueue отвергается. Runtime обрабатывает одну FIFO очередь с microtask scheduling; fairness между независимыми actors и preemption синхронного host-кода не обещаются.

## Отмена и закрытие

Graph/IR runtime принимает `options.signal` (AbortSignal). Он проверяется до выполнения, перед ссылками/вызовами, после вычисления аргументов и после await. Атом получает второй аргумент `{signal, state}`; существующий execute(params) API совместим. Composite наследует signal и transaction. Отмена даёт структурированную `CANCELLED`, никогда успешное значение.

Runtime прекращает ожидание active host Promise при abort; исходный Promise имеет rejection handler, поэтому поздний rejection не становится unhandled. Host adapter должен сам остановить внешнюю работу по signal. Даже если он игнорирует abort, state context отвергает его поздние read/write. Синхронный бесконечный цикл trusted JS нельзя прервать этим API. Это bridge для host futures, а не исполнение языка `async/await` или полноценный Future ABI.

Queued событие с aborted signal не вызывает handler; оно получает cancelled outcome при достижении своей FIFO позиции. `close()` навсегда запрещает новый dispatch (`SESSION_CLOSED`), отменяет active и ожидающие события и ждёт завершения их EMS outcomes. Оно не ждёт host работу, игнорирующую abort, и не заменяет future resource cleanup protocol. Повторный close допустим.

## Trace и воспроизведение

recordTrace явно включает локальный in-memory журнал принятых событий: sequence/event/inputs, committed result либо failed/cancelled code, before/after state. При отказе на admission записи нет. Host exception message/stack/reason не копируются: неизвестные host ошибки классифицируются `HOST_ERROR`, исходный отказ возвращается caller. Trace, snapshots и payloads отделены копированием; без recordTrace журнал пуст. Данные приложения могут быть чувствительными: журнал остаётся caller-owned, telemetry или передача на сервер не выполняются.

`replayEvents(newSession, trace)` повторяет accepted event order; cancelled entry получает заранее отменённый signal. При одинаковой исходной state, policy, programs и детерминированных bindings получаются одинаковые state/output traces. Nondeterministic IO и timing host services не воспроизводятся автоматически; их результаты потребуют явных recorded inputs/adapters. Replay повторно выполняет объявленные эффекты под grants, не sandbox для чужого журнала.

In-memory structured cloning сохраняет signed zero; канонический транспорт descriptor/trace ещё не реализован. Обычный JSON.stringify теряет -0: не выдавать JSON roundtrip trace за complete numeric conformance. IR literals по-прежнему имеют свою нормативную signed-zero encoding.

## Evidence и следующий шаг

`node examples/counter.mjs` выполняет текстовую программу `examples/counter.ems`: события +1,+2,-1 дают count=2, повторное воспроизведение даёт 2. `tests/reactor.test.mjs` проверяет FIFO и replay, rollback, isolation/copies, queue limits, queued/active cancel, late writes, close, malformed declarations и permissions. Stateful standalone export отвергается существующим pure backend; IDE/browser/native поддержка этим Node evidence не подтверждается.

Structured control-flow IR/lowering для if/loops/mutable locals реализован по AC-033 и работает в этих transactions. EMS-015 остаётся IN_PROGRESS: далее language futures/cancellation budget, algebraic/error/resource lifecycle и расширенный replay/conformance. M1 целиком открыт.
