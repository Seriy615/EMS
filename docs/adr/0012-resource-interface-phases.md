# ADR-0012 — ресурсный интерфейс с phase metadata и runtime ownership

Статус: принят для ems-resource-interface/1, EMS-016, AC-041.

Контекст: generic atomic wrapper вокруг resource factory может потерять actual native completion при отмене или бросить postcondition после allocation до передачи владения runtime. Без фазового протокола pre/post/errors read/write/release остаются недекларированными.

Решение: новый strict resource interface profile с execution ownership, typed valueType и read/write/release contracts. Public binding переносит validated frozen phase boundary chain в actual ResourceScope; callbacks не превращают native resource в обычный JSON result. Factory postconditions проверяются только после записи acquisition под runtime ownership. Operation tail продолжает отслеживать actual completion, release идёт под отдельным cleanup signal. Rebinding сохраняет обе boundaries вокруг одного native callback/release.

Следствия: whole-lifecycle grants проверяются до первого эффекта; readonly может скрыть write. Declared errors проверяются каждой фазой, cleanup diagnostics не публикуют private payload. Timeout/failure не означает физического освобождения. Native primitive runtime binding работает; advanced native payload ABI/standalone target требуют отдельного evidence. Existing resources без public IDL сохраняют reference behavior. Details: ../spec/RESOURCE_IDL.md.
