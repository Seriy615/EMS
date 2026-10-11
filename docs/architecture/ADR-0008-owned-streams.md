# ADR-0008: execution-owned Streams и local effects

Статус: принято для reference profile ems-control-streams/1.

Stream должен обеспечивать реальное ожидание/backpressure без silent drops и не превращать host async iterator в неявно доверенный EMS тип. Выбран execution-owned opaque handle, snapshot source и bounded FIFO channel с отдельными reader/writer queues. Typed intrinsics представлены в том же semantic control IR; next/send используют Future scope, for await — cancellable implicit reads с точным tick accounting.

Queued values сериализуемы в текущем finite/algebraic profile и копируются. Live Future/Stream не пересекают entry/state/journal boundary. Explicit close дренирует accepted buffer, blocked sends отвергаются; abort даёт failure, а не normal end. Shared Stream не закрывается автоматически при break: ResourceHandle/using ownership protocol ещё отдельный этап.

Изменение Stream observable внутри программы, поэтому added localEffects metadata пересчитывается checker/IR verifier транзитивно; requires pure с такими действиями отвергается. Local effects отделены от host policy/grants. Standalone разрешает собственные bounded local queues, но не выдаёт автоматических permissions одноимённым host effects.

Terminal task failures теперь сохраняются scope и отменяют sibling waits: producer STEP_LIMIT не должен оставлять root навечно в пустом stream. Ordinary task failures остаются typed outcomes с explicit close/await recovery; automatic global abort для них нарушил бы catch. Отмена/finish освобождают внутренние queue resources, без ложной гарантии остановить uncooperative IO.

Проверка: AC-037, tests/control-streams.test.mjs и terminal sibling host-wait regression в control-futures.test.mjs. Формальный профиль/limits и acceptance constraints — CONTROL_STREAMS.md.
