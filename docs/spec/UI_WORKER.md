# UI preview в Worker

EMS-050 IN_PROGRESS, AC-054. UI handler execution вынесен из editor thread в persistent Worker. src/ui/worker-host.mjs передаёт запросы в существующий UIRuntime/ReactorSession; нового event evaluator/state scheduler не добавлено. web/ui-worker.mjs запускает endpoint с actual core/state registry.

## Программа и протокол

createUIWorkerRuntime(project,{policy,timeout=5000,initTimeout=5000,maxQueue=64,recordTrace=false}) отправляет validated typed UI project string, policy и bounded queue settings в новый Worker. Ready Promise получает success только после повторного parse/source witness/version validation и UIRuntime policy preflight в worker. Ошибка init завершает worker и отвергает Promise. Worker не импортирует произвольные JS implementations: available base — установленный createCoreRegistry и declared state contracts. Custom foreign registry transfer не поддерживается.

Сообщения init/dispatch имеют exact fields и monotonic safe integer IDs. Worker связывает event/widget/value посредством исходного UIRuntime, затем отправляет result/error + actual committed snapshot/rendered semantic view и trace (если recordTrace включён). Client сопоставляет replies с pending requests, копирует confirmed values и возвращает те же typed errors. Invalid/duplicate/out-of-order request IDs отвергаются; stale reply без текущего request не меняет client state.

snapshot/view/trace facade возвращают detached last-confirmed data. Direct local runtime и worker event outputs/FIFO/typed field checks/rollback совпадают. DOM renderer использует тот же mountDOMRuntime adapter — меняется только location исполнения. mountDOMApplication остаётся working local backend для trusted runtime/standalone integration.

## Deadline, Stop и отмена

timeout действует с отправки event до подтверждения ответа, включая ожидание очереди; initTimeout отделён от event deadline. Оба default5s, допустимы1..60000ms. До maxQueue+1 pending client requests; новый overflow даёт QUEUE_FULL без отправки. Backend сохраняет исходный Reactor maxQueue.

Deadline, Worker error, Stop или active AbortSignal завершают preview session. Все pending requests получают EXECUTION_TIMEOUT, EXECUTION_WORKER либо CANCELLED, timers/listeners удаляются, late replies игнорируются, новые события получают SESSION_CLOSED. Already-aborted event отвергается до отправки и не закрывает healthy session. Во время Stop/timeout client сохраняет только последний подтверждённый snapshot, не объявляет unacknowledged event успешным.

Это coarse session cancellation, а не индивидуальный queued-event cancel protocol. Hard termination может произойти после internal commit до доставки reply; client не обещает узнать или откатить такой outcome. Worker-owned session уничтожена; restart создаёт новую программу с saved initial state, а не automatically retry/drop events. External IO rollback не обещается. Production plugin sandbox/OS privilege isolation этим не реализованы.

close возвращает shared termination Promise. DOM close сразу снимает listeners/subtree, закрывает worker и ждёт settled event observers. Refresh использует cached acknowledged view, сохраняет DOM controls/focus и восстанавливает failed controlled input как прежде.

## Editor integration

UI workspace теперь использует Worker для actual preview. Программа/source witnesses по-прежнему проверяются при authoring на editor side; Worker повторно проверяет их при init. Новый worker готовится до закрытия предыдущего preview, так что source/policy/init failure не запускает invalid program. Rendering/authoring DOM остаётся в main thread; циклы обработчика не блокируют формы редактора.

Worker execution изолирует CPU handler от editor event loop, но не означает полную isolation: validation/compiler и rendering остаются local, trusted builtin operations и frontend limits не production resource sandbox. Same-origin worker доступен стандартной browser CSP, не заменяет authorisation сайта. Arbitrary library execution/network/device adapters не добавлены.

Full graphical control handler editor/shared source maps, unified project manager и independent state/UI compiler/export остаются обязательными следующим gate. Worker preview не подменяет standalone application и не завершает WEB IDE MVP.

## Evidence

tests/ui-worker.test.mjs использует реальные Node worker_threads с тем же endpoint: FIFO/output/snapshot/trace parity, typed failures/rollback, permission/invalid init, close/late reply, actual while-loop deadline, already-aborted event/queue bound/active abort.
tests/browser/ui.test.mjs выполняет all previous UI authoring/transport scenarios через настоящий module Worker; новый тест запускает EMS loop с deadline1ms, изменяет поле редактора пока событие pending, подтверждает timeout/session closure/last-confirmed snapshot, восстанавливает healthy worker и проверяет Stop pending event.
