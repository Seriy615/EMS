# Матрица требований (проектная редакция)

Значения: **M0 demo** — воспроизводимый reference prototype; **planned** — не реализовано; **partial** — частично. Выполнение требования фиксируется только в QA Evidence с тестом.

| ID | Требование | Milestone | Текущий статус |
|---|---|---|---|
| LANG-01 | Один язык, текстовая и визуальная формы с единой семантикой | M1–M2 | partial: учебный текстовый поднабор |
| LANG-02 | Типы: базовые, составные, generic, Result, Stream, resource | M1 | partial: AST type pass/generics (AC-028); runtime пока finite core |
| LANG-03 | Условия, циклы, функции, события, ошибки, async | M1–M3 | partial: located AST для control/error/async syntax (AC-027); исполнение planned |
| LANG-04 | Формальная семантика effectful/dataflow и concurrency | M1 | partial: finite core + explicit effect sequence (AC-025, AC-030/031); state/concurrency planned |
| LANG-05 | AST/HIR/IR не зависят от координат канваса | M1 | partial: typed IR v1, located AST и pure SSA lowering (AC-026..028); full control lowering planned |
| CONT-01 | Публичная спецификация контракта, version IDL | M1 | partial |
| CONT-02 | Статическая проверка соединений и типов | M0 | M0 demo |
| CONT-03 | Atomic contract как нераскрываемая граница графа | M0–M5 | M0 demo |
| CONT-04 | Composite contract как раскрываемый nested graph | M0–M2 | M0 demo в коде, IDE planned |
| CONT-05 | Запечатать composite в compiled atomic artifact | M0–M5 | M0 demo JS |
| CONT-06 | Лицензия, видимость, редактируемость отдельно от atomic | M1–M10 | documented |
| CONT-07 | Версии, lockfile, совместимость и migration | M1–M5 | planned |
| CONT-08 | Effect/capability/pre/postcondition проверка | M1–M3 | partial: transitive runtime preflight and AST/IR effects (AC-029..031); pre/postconditions planned |
| FFI-01 | Импорт внешней библиотеки как пакета атомарных контрактов | M5 | M0 trusted ESM demo |
| FFI-02 | ABI, ownership, async, callbacks, error conversion | M5 | planned |
| FFI-03 | C ABI/Rust/C++ via bridge; WASM/WIT | M5–M6 | planned |
| FFI-04 | Python/JS/HTTP/gRPC adapters | M5–M7 | partial trusted JS demo |
| FFI-05 | Foreign function graph usable on supported targets | M5–M6 | planned |
| CRYP-01 | Внешняя аудированная crypto lib через контракты | M5 | design manifest only |
| CRYP-02 | Test vectors, secret/nonce safety, no logs | M5–M10 | planned |
| SYS-01 | Универсальные каталоги File/Network/Camera/Sensors/OS/DB | M3–M8 | planned |
| SYS-02 | Platform adapters separate from contract signature | M3–M8 | M0 structural proof |
| SYS-03 | New device via driver/SDK adapter | M8 | design manifest only |
| SYS-04 | Device capability discovery & explicit unsupported outcome | M6–M8 | planned |
| UI-01 | Universal UI tree contract, DOM/native | M3–M6 | planned |
| UI-02 | Reactive state, lifecycle, events, accessibility | M3–M6 | planned |
| UI-03 | Select running widget and inspect its graph | M2–M3 | planned |
| UI-04 | Browser DOM and native UI semantic conformance | M6 | planned |
| RUNT-01 | Reference executable dataflow graphs | M0 | M0 demo |
| RUNT-02 | Scheduler, async, state, resource lifecycle | M1–M3 | planned |
| RUNT-03 | Sandboxed plugin and explicit effect permissions | M5–M10 | planned |
| COMP-01 | Validated EMS IR and optimizer | M1–M4 | partial: validated finite core IR v1 (AC-026); optimizer planned |
| COMP-02 | Standalone Web JS pure compile without IDE/runtime | M0–M4 | M0 demo |
| COMP-03 | Standalone non-Web compiled target same logic | M6 | planned |
| COMP-04 | Select implementation and link per-target | M4–M8 | planned |
| DIST-01 | One logical app partitioned between device/server/edge | M7 | planned |
| DIST-02 | Auth, retries, timeouts, offline/sync defined | M7 | planned |
| AI-01 | Model-agnostic prompt → graph via registry, validation | M9 | planned |
| AI-02 | AI produces tests and graph edits/diffs | M9 | planned |
| ECO-01 | Signed packages and registry | M10 | planned |
| ECO-02 | Open/private/commercial licensing | M10 | planned |
| DEMO-01 | Average-of-five arithmetic prototype, not WCA | M0 | M0 demo |
| DEMO-02 | Musical Bingo complete | M7–M9 | planned |
| DEMO-03 | Speedcubing with official WCA rules & external timer | M8 | planned |
| TEST-01 | Automated positive/negative conformance suite | M0+ | M0 demo |
| TEST-02 | Cross-target differential tests | M6 | planned |
| SEC-01 | Signed dependencies, sandbox, capabilities, secret policy | M5–M10 | partial metadata |
| OPS-01 | Reproducible builds, CI, trace, release artifacts | M0–M10 | partial |

Первая колонка — идентификатор задачи для traceability; `tasks/backlog.json` содержит реализационные work items. При каждом PR обновлять статус и ссылку на evidence. Код прототипа не равен закрытию целевого требования.
