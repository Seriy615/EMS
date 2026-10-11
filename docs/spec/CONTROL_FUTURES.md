# Async/Future: типизированные задачи одного исполнения

EMS-015, AC-036, G-01/03/11/12. Новый профиль `ems-control-futures/1` общего `ems-ir/2` расширяет control/algebraic/error semantics. Старые профили сохраняют прежние ограничения. Это исполняемые language tasks и await, не только ожидание Promise внутри host binding.

## Типы и IR

К finite/Option/Result типам добавлен `Future<T>`, с прежними canonical type strings, глубиной ≤32 и длиной ≤4096. Function имеет обязательный Boolean `async`; declared output — payload type. Вызов async function имеет type `Future<output>`, вызов обычной function — output. Generic parameters, aliases, nested Future и Future в Option/Result поддерживаются внутри одного program scope. Sync helper может передавать/возвращать Future; `await` разрешён только в async body. Нет неявного await/flattening даже для Future<Future<T>>.

IR expression `{kind:"await", type:T, value:expression<Future<T>>}` проверяет тип, async context и profile. Contract call target в этом профиле дополнительно содержит Boolean `async`, отражающий explicit extern declaration; binding inputs/output всё ещё primitive Registry ABI. Runtime получает primitive payload от host Promise и создаёт typed EMS Future для async extern. Смена marker не выдаёт capabilities и не скрывает effects. Function/target metadata обязательна; старые профили не принимают её неявно.

Entry inputs/output не могут содержать live Future, включая вложенные Option/Result. Function entry может быть async: API execute возвращает Promise её проверенного payload. Внутренние Future handles не сериализуются, не попадают в actor state/snapshot/trace и не переносятся в другое исполнение. Transport/remote Future, Stream, async iterator, race/select и отдельный spawn API — последующие возможности, не текущая реализация.

Future не имеет value equality и не может быть typed throw/catch payload. Проверки применяются к вложенным Future также. Numeric/array/algebraic результаты async задач сохраняют прежнюю value semantics и -0.

## Выполнение и ownership

После вычисления аргументов вызов async функции создаёт hot task. Запуск ставится на host microtask queue; несколько задач могут ожидать независимые внешние операции одновременно. Body выполняется ровно один раз. Handle — frozen null-prototype object без then, зарегистрированный в execution-owned WeakMap вместе с payload type. Native Promise, произвольный thenable, handle другого scope и закрытый handle не становятся EMS Future; проверка не читает then getter.

`await` проверяет ownership/type и получает сохранённый outcome. Повторный await не повторяет body/effects; каждое await expression по-прежнему расходует свой tick. Typed user errors и native failures сохраняются, включая host throw null. Результат host binding проверяется после фактического completion. Все task rejection handlers устанавливаются сразу: discarded failed task не создаёт native unhandled rejection.

Срок жизни задач — **один вызов execute**, включая root и всех потомков. Обычный возврат root ещё не означает успех: runtime/standalone join всех созданных задач в порядке создания, включая задачи, созданные потомками во время join. Ошибки, полученные explicit await и обработанные кодом, считаются observed; failure unobserved задачи отвергает completion. Сохранённый ordinary failure может быть заменён finally согласно CONTROL_ERRORS.md; terminal failure — нет. Неиспользованный успешный Future всё равно исполняется и join перед возвратом результата.

Join не является timeout и не обещает fail-fast для поздней задачи, пока ранняя ожидает внешнее completion; порядок join — часть профиля. Для бесконечного внешнего ожидания caller должен отменить execution. После root failure/cancellation scope abort распространяется всем задачам и прекращает EMS ожидание uncooperative operation. Все EMS outcomes собираются; late host rejection наблюдается handler и не теряется. Synchronous host work не preempted; отмена EMS не гарантирует остановку внешней IO/OS операции, игнорирующей signal.

## Порядок, ограничения и effects

Все задачи используют один maxSteps (default 100000). Call-depth ancestry ограничена maxDepth (default 64, максимум 256) независимо для каждой цепочки, а не количеством одновременно живых задач. Expression depth ≤256 учитывается по цепочке синхронных local calls; запуск новой task начинает новый expression stack, сохраняя call ancestry. Это предотвращает unlimited detached recursion и ошибочное суммирование глубины независимых tasks.

`maxFutures` — total creations за execution, default 1024, от 1 до 100000. Лимит не возвращается после settlement: сохраняемые outcomes/handles требуют bounded storage. Неверное значение — INVALID_BUDGET, превышение — FUTURE_LIMIT `{maxFutures}`. FUTURE_LIMIT вместе с CANCELLED/STEP_LIMIT/CALL_DEPTH/EVALUATION_DEPTH — protected terminal failure; finally не подавляет его. Budget действует также на unawaited/descendant tasks.

Внутри каждой функции порядок expressions/statements прежний eager. Между tasks гарантируется creation order, local sequencing и explicit await dependencies; относительный порядок внешних completion не выдумывается. Native microtask boundaries interpreter/generated JS не являются переносимым scheduler ABI. Детерминированные pure outcomes и ошибки, creation-order join, single-flight и общий budget покрыты differential tests; конкурентные IO или shared-state writes без явного await допускают interleaving и требуют contract-level ordering. Replay с недетерминированными external bindings не обещается. Scheduler transcript/virtual clock — отдельный conformance этап.

Политики включают транзитивные effects/capabilities всех async bodies; preflight до первой task/host action. Hot call не обходит grants. Async не означает pure и не делает внешние effects откатываемыми.

## События, отмена и compiler

ReactorSession commit выполняется только после root и join. Discarded successful task может записать staged state; запись commit вместе с событием. Unobserved failure/cancellation откатывает весь owned draft, включая writes async bodies. Existing FIFO не начинает следующий event до завершения outcomes. Общий signal проходит в nested graph/host context; late state writes после отмены запрещены. Failure trace хранит code, не task error payload; Future handles не выходят за program boundary.

Finally остаётся bounded обычным signal/budget; abort может остановить его до первой инструкции. Future supervision не заменяет гарантированный resource lifecycle/using cleanup.

Standalone pure JS backend генерирует async functions/await и встраивает тот же Future scope/value helpers без EMS imports. `execute(inputs,options)` этого профиля возвращает Promise; прежние pure profiles остаются synchronous. Trusted pure emitJS primitive binding может вызываться через Future wrapper; реальные effectful IO/state bindings всё ещё UNSUPPORTED_TARGET. Export не требует EMS IDE/центрального сервиса и проверен новым процессом вне проекта. Это не доказательство browser/native P1.

```bash
node tools/ems.mjs module-ir examples/futures.ems --entry demo.FutureTotal --out dist/futures.ir.json
node tools/ems.mjs ir-run dist/futures.ir.json '{"value":3}'
node tools/ems.mjs ir-build dist/futures.ir.json --out dist/futures.mjs
# import { execute } from './futures.mjs'; await execute({value:3}) === 9
```

Схема `schemas/control-futures-ir.schema.json` включена в общий control schema entrypoint. Executable verifier проверяет grammar/ownership boundary, async markers, await typing, policies и profile gates; schema не заменяет эту проверку. AC-036: `tests/control-futures.test.mjs` — 34 tests, positive/negative/differential cases, controlled host concurrency, supervised failure/cancel, exact budgets/depth, state join/rollback/replay и независимый CLI export. EMS-015 не завершён: Stream, resource lifecycle, полный structured error/ownership IDL и standalone state ещё открыты.
