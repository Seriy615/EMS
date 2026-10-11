# ResourceHandle и using — начальный lifecycle профиль

EMS-015, AC-038, G-03/08/11/12/15. `ems-control-resources/1` расширяет общий `ems-ir/2` Stream/Future/error/algebraic профиль. Text frontend, executable IR validator, runtime и standalone используют одну систему типов и lifecycle helpers. Это reference semantics для доверенных in-process bindings, не sandbox или универсальный native ABI.

## Значения и операции

`ResourceHandle<T>` — opaque execution-owned handle. T является serializable finite/algebraic типом: Number, NumberArray, Boolean, String, Option/Result с такими payload. Вложенные живые handles как resource payload запрещены. Generic helpers и aliases нормализуются до canonical типов. Internal async factory может возвращать Future<ResourceHandle<T>>; entry inputs/results, state и journal не переносят handles. Equality и typed throw/catch live handles запрещены. Handle нельзя подделать JSON/native Promise или перенести между executions.

| Операция | Результат | Семантика |
|---|---|---|
| resource.cell(value:T) | ResourceHandle<T> | Owned copied memory cell |
| resource.read(handle) | T | Проверка владения/open; copied typed result |
| resource.write(handle,value:T) | T | Copied typed write/result; native write может отсутствовать |
| resource.close(handle) | Boolean | Однократное explicit освобождение; true после успешного release |
| resource.isClosed(handle) | Boolean | Состояние handle в текущем execution |

В этом профиле read/write/close внутренне ожидают host completion, не возвращают публичный Future. Resource profile standalone execute всегда Promise, даже при sync entry. Future helper позволяет явно запустить асинхронную работу. Native read/write последовательно идут через actual operation tail; отмена ожидания не объявляет actual IO завершённым. Native resource не копируется; его typed read/write payload копируются. NumberArray плотный и конечный; знак -0 сохраняется.

## Владение и scope

```ems
fn increment(value: Number) -> Number {
  using cell = resource.cell(value);
  resource.write(cell, resource.read(cell) + 1);
  return resource.read(cell);
}
```

`using name = expression;` создаёт immutable lexical binding и единственного owner этого handle. `using mut` и повторный claim запрещены (RESOURCE_OWNERSHIP). Scope освобождает owned resources в обратном порядке создания binding при normal end, return, break, continue, throw, cancel и exhaustion execution budget. Implicit release после explicit close не вызывает native release повторно. Explicit double close и использование закрытого ресурса — RESOURCE_CLOSED; запись в native read-only binding — RESOURCE_READ_ONLY.

Returning using-owned handle из owning scope запрещён RESOURCE_ESCAPE, включая возврат из вложенного блока. Borrowed identity helper разрешён. Factory без using может передать live handle caller; все оставшиеся execution-owned ресурсы освобождаются на program boundary как fallback. Ownership проверяется динамически; полная статическая borrow/lifetime система ещё не реализована. Handle, сохранённый в другом local, остаётся закрытым после выхода owner. Неawaited borrowed task не продлевает lexical lifetime: caller должен await до выхода using scope либо принять RESOURCE_CLOSED. Handle не имеет finalizer, зависящего от JS GC.

Cleanup lexical scope происходит до caller catch/finally. Обычный EMS finally сохраняет прежнюю control semantics и не заменяет lifecycle cleanup. Terminal execution failures нельзя подавить finally. Resource cleanup itself не расходует maxSteps и получает отдельный signal, не отменённый program signal.

## Native lifecycle contract binding

`registry.registerResource({id,version,inputs,valueType,effects,capabilities,acquire,read,write?,release})` регистрирует специализированную **атомарную** реализацию. Внутренний registry tag resource — dispatch lifecycle backend, не третий editor contract kind. В consuming editor нет decomposable EMS graph. Interface/implementation/package/license/capabilities остаются отдельными понятиями.

Initial native binding inputs и valueType используют reference primitive ABI; cell поддерживает также algebraic T. acquire(params,{signal,state}) возвращает private native value; read(native,{signal,state}) и optional write(native,value,{signal,state}) возвращают declared valueType; release(native,{signal,reason}) освобождает private value. Callbacks обязательны кроме write. Acquire/read/write получают execution signal; release — отдельный cleanup signal. Binding metadata обязана консервативно объявить union effects/capabilities всего lifecycle. Общий transitive preflight проверяет их **до acquire**; release после отмены не требует нового grant. Версия binding pinned в IR, mismatch CONTRACT_VERSION.

Capabilities проверяют разрешение вызова доверенной реализации; они не ограничивают системные права JS callback. Нет автоматического foreign import, sandbox, OS preemption или promise-based cancellation гарантий. Пример `examples/resource-file.mjs` действительно открывает/читает/закрывает Node FileHandle. Он не является переносимым файловым ABI. Native resource bindings явно UNSUPPORTED_TARGET при standalone compile; owned cells компилируются без EMS imports/service.

## Cleanup, failure и budgets

| Option | Default | Range |
|---|---:|---|
| maxResources | 64 total acquisitions/cells | 1..1024 |
| maxCleanupMs | 1000 ms на resource phase | 1..10000 |
| onResourceCleanup | отсутствует | trusted synchronous observer function |

Limits/options проверяются до host execution/listeners. Total budget не возвращается после close; RESOURCE_LIMIT protected terminal failure. Cleanup сначала ограниченно ждёт quiescence actual resource operation tail, затем отдельно ограниченно ждёт release. Общий worst-case cleanup зависит от числа resources, а не ограничен одним maxCleanupMs на всю программу. LIFO cleanup продолжает освобождение остальных ресурсов после отказа одного.

Ошибка release или timeout при нормальном completion отвергает execution RESOURCE_CLEANUP с payload-free list `{resource,binding,code}`. При primary error он сохраняется; extensible error object получает resourceCleanupFailures, raw null/undefined сохраняются без замены. Native error message/value не попадает в secondary diagnostics. Успех означает завершённое release всех acquired resources. Если native release отказал, физическое освобождение не гарантируется.

Отмена pending acquire завершает EMS ожидание; поздний acquired native value получает один release attempt. Если active native IO не остановился до cleanup deadline, caller получает CLEANUP_TIMEOUT diagnostics, release откладывается до actual quiescence, чтобы не закрыть native object под выполняющейся операцией. Если IO никогда не завершается, физическое освобождение невозможно гарантировать. Release, игнорирующий собственный signal, может закончиться после timeout; repeated attempts не запускаются. Native exceptions/late rejections наблюдаются, не становятся unhandled rejection.

Observer получает frozen metadata `{resource,binding,type,phase,reason}` без native/payload. phase released/failed/deferred; reason normal/error/cancelled. Возможны late events после возвращённого timeout. Observer exceptions становятся cleanup failure и не пропускают другие resources; callback доверенный, blocking JS не preempted.

Reactor commit ждёт execution/Future completion и lifecycle cleanup; cleanup failure вызывает rollback owned state. Rollback не отменяет уже выполненное внешнее IO. Replay подтверждён для deterministic bindings/inputs, не обещает повторяемость любых файловых/сетевых побочных действий.

## Local effects, IR и evidence

Checker вычисляет resource.create/read/write/close/inspect в checked.localEffects, using добавляет close. Transitive requires pure отвергает local mutation/lifecycle effects. Они отличны от host policy grants. Native factory добавляет local create и declared host union. Validator независимо пересчитывает sorted function localEffects, не принимает forged omissions.

Expression `{kind:"resource",type,operation,arguments}`; statement `{kind:"using",name,type,value}`. Схема schemas/control-resources-ir.schema.json подключена к control wrapper. Older profiles не принимают новые types/instructions/metadata. Schema задаёт структуру, executable validator дополнительно проверяет canonical grammar/typing, live boundaries, policy и versions. Внешний schema engine не запускался.

```bash
node tools/ems.mjs module-ir examples/resources.ems --entry demo.ResourceTotal --out dist/resources.ir.json
node tools/ems.mjs ir-run dist/resources.ir.json '{"value":4}'
node tools/ems.mjs ir-build dist/resources.ir.json --out dist/resources.mjs
node examples/resource-file.mjs examples/resources.ems
```

AC-038 — tests/control-resources.test.mjs: runtime/standalone parity, copies/ownership/LIFO, all exits, exact budget thresholds, timeout/cancel/late IO, native actual fd EBADF после освобождения, preflight/versions/types/read-only, primary/secondary errors, reactor commit/rollback/replay и independent CLI export новым процессом вне EMS. Node evidence не закрывает browser/native portability P1. EMS-015/M1 остаются открыты для полного error/resource IDL, standalone state и stable conformance.
