# ADR-0005: control regions и последовательная текстовая семантика

Статус: принят для finite M1 профиля, 11 октября 2026. Evidence: AC-033.

M0 IR v1 — dataflow DAG с memo и demand-driven вычислением. Условия/loops и mutable locals не могут быть представлены добавлением canvas edges без изменения семантики. Для них введён ems-ir/2 / ems-control-finite/1: typed semantic blocks и local call targets, общий validator, runtime и JS generator. Canvas и AST locations остаются sidecar; graphFromIR не выдаёт control blocks за исходный M0 graph.

Working call/graph backend сохранён. Default own-text frontend выполняет statements eager и в straight-line call IR, через explicit sequence. Поэтому появление control-flow не меняет смысл unused let или порядок ошибок helper functions. Legacy M0 artifacts и explicit frontend profile call сохраняют прежнюю семантику. Automatic profile selection учитывает reachable declarations, чтобы unused functions не меняли смысл entry.

Shared control budgets и evaluation-depth guard определены одинаково в runtime и standalone. Pure backend генерирует обычные JS statements/functions и переиспользует finite-value helpers/contract compiler; unsupported effects не стираются. ReactorSession потребляет проверенные signatures/policies обеих версий, сохраняя transaction ownership.

Ограничения: control modules пока связаны с trusted registry; нет stable transitive package lock, полного source map, editable IDE control regions, algebraic/error/resource и language Future/Stream execution. Финальная EMS обязана иметь единые документированные текстовые/визуальные semantics; explicit legacy profile не является заменой этой цели.
