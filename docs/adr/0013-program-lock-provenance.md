# ADR-0013 — отдельный program lock с verified byte provenance

Статус: принят для EMS-016 strict lock workflow, AC-042.

Контекст: id/version не фиксируют замену graph/IDL/JS implementation. Function.toString не фиксирует closure artifacts. Lock creation не должна исполнять произвольные callbacks ради обнаружения зависимостей.

Решение: ems-program-lock/1 хеширует shared semantic IR, транзитивные graph/contract/binding dependencies и actual verified source artifact bytes. Core intrinsics проверяются private reference callback identity и являются trusted ABI. Explicit trusted Module SDK получает exact source bytes и dependency-injected module graph; provenance callback identities сохраняются при registry clones. Locked executor/compiler проверяют content closure перед действиями и используют registry/IR snapshot.

Следствия: unknown callback provenance не заменяется fake hash. Loader не sandbox и не automatic JS dependency analyzer; внешние globals/imports требуют audited adapter declarations. Binary attestation ядра/OS, package signing и deployment integrity остаются separate gates. Native/state targets без provenance/export backend не объявляются supported. Details: ../spec/PROGRAM_LOCK.md.
