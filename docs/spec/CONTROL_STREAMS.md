# Stream: bounded channels, чтение и for await

EMS-015, AC-037, G-01/03/11/12. Профиль `ems-control-streams/1` расширяет общий `ems-ir/2` с control/algebraic/error/Future semantics. Text checker/lowering, независимый IR verifier, runtime и JS compiler используют одни значения/операции. Старые profiles не расширяются неявно.

## Типы и внутренние контракты

`Stream<T>` — execution-owned mutable FIFO, не host async iterator. T — сериализуемый тип текущего finite/algebraic профиля: Number, NumberArray, Boolean, String, Option/Result с такими payload. Live Future/Stream внутри элемента запрещены. Future<Stream<T>>, generic/alias stream helpers и внутренние Option/Result со Stream разрешены, но entry inputs/output не содержат живых handles, в том числе вложенных. State slots и foreign Registry ABI всё ещё primitive; импорт чужого async iterator не заявляется.

Версия intrinsic interfaces задаётся profile `/1`; они имеют следующие сигнатуры:

| Текст | Сигнатура | Local effect |
|---|---|---|
| stream.channel | `(capacity:Number) -> Stream<T>` | stream.create |
| stream.fromArray | `(values:NumberArray) -> Stream<Number>` | stream.create |
| stream.next | `(source:Stream<T>) -> Future<Option<T>>` | stream.read |
| stream.send | `(source:Stream<T>, value:T) -> Future<Boolean>` | stream.write |
| stream.close | `(source:Stream<T>) -> Boolean` | stream.close |

channel требует contextual Stream<T> annotation/expected type. Capacity — safe integer от 1 до maxStreamCapacity. fromArray копирует вход один раз и читает snapshot лениво; этот read-only source не принимает send. -0 сохраняется. Произвольные host async iterator/thenable не становятся Stream; reference Array ABI и trusted-host boundary прежние. Auto-loading и platform API не добавлены.

IR expression `{kind:"stream", type, operation, arguments}` имеет operation channel/fromArray/next/send/close. Type/arity каждого operation пересчитываются verifier; отсутствие/подмена metadata не даёт альтернативный untyped путь. Live handles — frozen null-prototype objects в private WeakMap; ownership/type проверяются, fake iterator getter не вызывается. Element values копируются при send и выдаче, включая nested Option/Result/NumberArray, чтобы очередь не разделяла producer memory.

## FIFO, backpressure и end

Channel buffer bounded заданной capacity. send при свободном месте принимает копию в buffer; при ожидающем reader передаёт напрямую; при заполнении ждёт в FIFO writer queue. Future<Boolean> завершается true после acceptance в buffer/reader, а не обязательно после выполнения consumer body. Никаких silent drops/overwrite. После извлечения buffered item освобождённое место заполняет первый writer, его acknowledgement завершается.

next при доступном item возвращает Some(value), иначе ждёт в reader FIFO; конец — None. None как значение элемента Option<T> переносится внутри Some(None), поэтому absence не смешивается с host null. next/send создают обычные hot Future tasks после вычисления arguments; body operation стартует на task queue. Для порядка send/close использовать explicit await, не предполагать точные native microtask boundaries. Повторный await одного next Future возвращает сохранённый item и не читает следующее значение.

close впервые возвращает true, повторно false. У channel уже принятый buffer дренируется, затем next возвращает None; ожидающие empty readers получают None. Не принятые blocked writers отвергаются STREAM_CLOSED. Новые sends после close тоже STREAM_CLOSED. У snapshot source close отбрасывает оставшийся unread snapshot. Пользовательское завершение отличается от cancellation: abort отвергает ожидания CANCELLED, а не выдаёт ложный successful end.

## Итерация и порядок

```ems
async fn total(values: Number[]) -> Number {
  let mut result = 0;
  for await value in stream.fromArray(values) {
    result = result + value;
  }
  return result;
}
```

for await разрешён только в async body и над Stream<T>. Binding immutable, с типом T. IR statement `{kind:"forAwait", binding, iterable, body}` вычисляет iterable один раз. Перед каждым next — один общий step tick, включая end read; перед каждой item body — ещё один iteration tick. Не создаётся отдельный public Future на каждый implicit read: цикл ожидает stream operation непосредственно, с тем же cancellation domain. Explicit stream.next по-прежнему расходует maxFutures creation budget.

return/break/continue/typed throw/finally имеют прежнюю control semantics. break не закрывает shared Stream автоматически и не отменяет producer; оставшийся source можно читать дальше. Владение/using с автоматическим закрытием — отдельный resource lifecycle этап. Producer должен закрыть stream на normal/ordinary failure (обычно finally); иначе consumer вправе ждать до explicit close/cancel. Сам по себе ordinary user failure другой task не объявляется концом Stream. После draining caller может await producer для typed error recovery; unobserved failure также отвергается join.

FIFO гарантирует порядок каждого reader/writer queue и принятых values; interleaving нескольких producers, host completion и shared state требует explicit dependencies. Deterministic snapshot/ordered producer traces покрыты replay tests, universal scheduler ABI и внешняя device subscription пока не реализованы.

## Local effects и разрешения

Stream изменяет разделяемую внутри программы очередь; нельзя объявлять read/write helpers referentially pure. Checker вычисляет transitive `checked.localEffects` для stream.create/read/write/close и for await; requires pure отвергается, если эти действия присутствуют, включая helper calls/untaken branches. Escape analysis для доказательства приватной pure обработки пока не выполняется — правило консервативно.

Stream profile function имеет обязательную sorted `localEffects` array. Независимый verifier пересчитывает её из intrinsic operations и local call graph; forged omissions/unknown names отвергаются. Это отдельная behavioural metadata, не host grants. Local Stream operations управляются execution ownership/budgets; они не запрашивают OS capabilities и не добавляют внешние IO.

Host `policy.effects/capabilities` сохраняют прежние preflight правила. Одноимённый host effect `stream.read` в policy.effects не становится local effect и не получает автоматического grant: runtime требует allowedEffects, standalone отвергает binding. Effects async bodies/producer values не скрываются intrinsics. Compiler может выполнить проверенные local Stream effects, но по-прежнему не поддерживает external IO/state effects.

## Limits, failures и events

| Option | Default | Valid range | Error |
|---|---:|---|---|
| maxStreams | 64 total creations | 1..1024 | STREAM_LIMIT |
| maxStreamCapacity | 1024 per channel | 1..65536 | STREAM_CAPACITY для неверной capacity |
| maxPendingStreamOps | 64 across execution | 1..100000 | STREAM_PENDING_LIMIT |

Options проверяются до установки execution listeners; неверные значения INVALID_BUDGET. Pending readers/writers учитываются вместе по всем channels; counters освобождаются на delivery/close/abort. Total streams budget не возвращается после close. Snapshot source занимает existing copied NumberArray; он не bounded channel и не обещает ограничение размера всего исходного массива.

STREAM_LIMIT и STREAM_PENDING_LIMIT — protected terminal failures вместе с прежними budget/cancel codes. Проверки pipeline выявили liveness gap в Future supervision: terminal failure producer мог оставить root в stream/host wait. Теперь первый terminal task failure сохраняется в Future scope и abort распространяется всем tasks/Stream waiters. Program boundary возвращает исходный terminal code/details, даже если sibling wait получает CANCELLED; finally не превращает отказ в успех. Root failure по-прежнему abort/join остальных EMS outcomes, обычные typed caught failures не становятся автоматической глобальной отменой.

Stream scope слушает общий signal, очищает buffer, отвергает pending operations и запрещает late writes. Finish после success join/error освобождает owned stream memory и закрывает handles. Это гарантии внутренней очереди, не OS resource cleanup/foreign cancel: игнорирующая signal внешняя работа может продолжиться. Synchronous host work не preempted.

Reactor event commit ждёт root/Future join; Stream pipeline writes staged state, success commit, failure/cancel rollback owned state. FIFO следующий event не пересекает незавершённый handler. Live handles не выходят в journal; failure payload omitted, recordTrace opt-in. Replay в документированной детерминированной области сохраняет state/results/error codes.

## Compiler и evidence

Standalone генерирует async JS loop/операции и встраивает shared stream/future/value helpers без EMS imports. execute возвращает Promise, включая sync entry, если выбран Stream profile. External bindings используют прежние pure primitive emit hooks; IO/device/native Stream adapters явно отсутствуют. Пример полноценного bounded pipeline — examples/streams.ems, с close в finally производителя.

```bash
node tools/ems.mjs module-ir examples/streams.ems --entry demo.StreamTotal --out dist/streams.ir.json
node tools/ems.mjs ir-run dist/streams.ir.json '{"values":[1,2,3]}'
node tools/ems.mjs ir-build dist/streams.ir.json --out dist/streams.mjs
# import {execute} from './streams.mjs'; await execute({values:[1,2,3]}) === 6
```

Schema control-streams-ir.schema.json включена в общий control entrypoint. Canonical grammar, live boundary, localEffects, async/type/arity/policy проверяет executable verifier; внешний schema engine не запускался. AC-037: 35 stream tests и Future sibling-wait regression: actual backpressure/FIFO/copies, typed end/handles/generic/nested sources, differential exact budgets/errors, protected terminal wakeup, cancellation, actor commit/rollback/replay/privacy, host permissions/localEffects, strict serialized IR и независимый CLI/new-process export. Это Node evidence, не browser/native P1.

EMS-015 остаётся IN_PROGRESS: гарантированный ResourceHandle/using lifecycle, full error/ownership IDL и standalone state ещё впереди.
