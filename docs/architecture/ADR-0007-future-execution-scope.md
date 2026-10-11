# ADR-0007: типизированные Future и scope исполнения

Статус: принято для reference profile ems-control-futures/1.

Host Promise не является типом EMS: JavaScript автоматически assimilates thenables, а serialized programs и actor snapshots не могут переносить живое ожидание. Language async требует отдельного semantic IR, проверяемого await и явного срока жизни задач, чтобы root return не оставлял writers после actor commit.

Выбран execution-owned opaque Future handle с cached outcome и hot task после вычисления arguments. Общий program scope supervises все tasks, join перед успешным completion и abort на root failure/cancellation. Explicit await errors observed, unawaited failed tasks отвергают completion. Будущие root/profile API не получают handles: entry signatures не содержат Future. Внутренние generics/nested Future разрешены; implicit flattening, equality и exception payload для live handles запрещены.

Call ancestry и expression depth считаются по task chain; maxSteps и total maxFutures общие. FIFO event transaction ждёт task outcomes; external IO не rollback. Creation-order join определён, но host completion/interleaving не выдаётся за универсальный deterministic scheduler ABI. Virtual scheduler transcript, Stream/backpressure, remote Future и гарантированный resource cleanup требуют отдельных решений и acceptance evidence.

Один IR verifier и одни portable value/supervision helpers используются runtime и standalone. Pure compiled execute этого profile асинхронный; старые synchronous profiles не меняют API. Foreign Registry ABI остаётся primitive, async extern явным образом оборачивает trusted host completion. Effects preflight включает async bodies до их запуска.
