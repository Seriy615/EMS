# EMS Roadmap / engineering gates

**Rule:** each milestone has evidence, tests and runnable demo. Do not declare whole EMS complete because the M0 prototype works. Work is iterative; future targets can change after ADR reviews.

Постоянная цель и измеримые G-01..18: [`PROJECT_GOAL.md`](../../PROJECT_GOAL.md). Факты проверок: `docs/qa/STATUS.md`; точка продолжения: `docs/qa/PROGRESS.md`. Каждая фаза ниже закрывает часть общей цели, а не заменяет её списком задач.

| Phase | Definition of done | Demo |
|---|---|---|
| M0 — Foundation | JS reference evaluator, type checker, tiny textual subset, composite -> atomic JS, trusted JS lib -> atomic blocks, tests, docs, policy | arithmetic Ao5; sealed atomic consumed by composite |
| M1 — Formal language | Versioned grammar, typed AST/HIR, semantics of values, control, state, effects, errors, resources and async, spec fixtures | same program text/IR, deterministic tests |
| M2 — Visual IDE | Expand/collapse nested composites, inspector, editor of text and nodes, source maps, graph diff, save/load | user authors graph and opens nested internals |
| M3 — Web UI runtime | Browser UI Tree + DOM backend, reactive events/state, accessible primitives and permission management | music-bingo local web UI |
| M4 — Full standalone Web export | End-to-end IR backend, linker, effects, tests and offline-capable static export where possible | Web package runs without EMS IDE |
| M5 — Atomic seals & foreign imports | Trusted build pipeline, JS/ESM and WASM components, C ABI baseline, owned resource rules, package manifests | one imported library -> several atoms and crypto test vectors |
| M6 — Second platform | One actual native/desktop target + UI/storage bindings; differential tests | same semantic program running Web + second platform |
| M7 — Server and distributed runtime | RPC, cross-device state, sync, policy boundaries, authentication, error recovery | musical lotto: host + players + projector |
| M8 — Hardware/media | Driver adapter SDK, USB/serial, timers, media output and bounded-latency worker contracts | speedcube station + scoreboard/overlay |
| M9 — AI composition | LLM chooses existing contracts, builds graph, deterministic validation, behavior tests, diff and safe edit | prompt -> editable working app |
| M10 — Ecosystem | package registry, signing, version-lock, revocation, commercial/open licenses, CI, security hardening | independent developer publishes/consumes a package |
| M11+ — Extended backend ecosystem | Android, iOS, Windows/macOS/Linux, GPU, embedded, specialized host capabilities | per-target verified builds, no inflated platform claims |

## Mandatory dependency chain

M0 -> M1 -> M2/M3 -> M4 -> M5 -> M6; M7 builds on networking/storage contracts; M8 on plugins + platform capabilities; M9 on stable catalog and validator; M10 on stable package semantics. Safe parallel work is possible on documentation/test fixtures and tooling, never assume an unstable IR will remain unchanged.

## Release readiness

`M0` = runnable reference demo. `Alpha` = unified text/graph language + Web runtime/export. `Beta` = true second-platform proof + FFI, tests and security review. `Production` = audited packaging, plugin isolation, support docs and rollback/recovery. Explicitly mark unsupported targets in CLI and UI.

## First target before expanding scope

1. Execute arithmetic Ao5 as graph and in textual subset.
2. Make a composite referencing another composite and run it.
3. Seal composite into standalone JS without source graph in package.
4. Load sealed result as an atomic block in a new graph.
5. Import two functions from trusted local ESM via explicit binding manifest; use both as atoms in a graph.
6. Prove incorrect type, graph cycle, missing capability and impurity-on-standalone are rejected.
7. Verify `npm test` and `npm run verify` are green.

**Pass M0 only once all above have executable evidence.**

## Ближайший этап: проверяемое ядро M1

Исторический baseline M0: 16/16 тестов и 18/18 verify, Node.js 22.21.0. EMS-010..014 завершены для документированных finite профилей: core semantics, IR, grammar, types и effects. EMS-015 DONE для initial finite acceptance: state/FIFO/replay/cancellation (AC-032) structured control IR/runtime/standalone (AC-033) typed user exceptions/finally (AC-034) Option/Result/match (AC-035) language async/Future (AC-036) Stream/backpressure/for-await (AC-037) и ResourceHandle/using lifecycle (AC-038) реализованы. EMS-016 DONE для initial IDL acceptance: отдельные interface/binding IDL, finite atomic pre/post/error adapters и compatibility checks (AC-039), preserved composite interface graph/IR/runtime/standalone boundaries (AC-040) и public native resource phase/ownership guards (AC-041) реализованы. Program dependency lock с verified source-byte SDK provenance и exact closure runtime/export gate (AC-042) реализован. EMS-017 common differential gate DONE: 54 fixtures через runtime/serialized IR/fresh standalone, exact values/errors и independent oracle (AC-043). Acceptance audit — docs/qa/CORE_ACCEPTANCE_AUDIT.md. EMS-018 DONE для actual Node/Web pure-core P1: 57 fixtures в 5 исполнителях, independent static application после shutdown runtime origin, evidence docs/qa/BROWSER_P1.md. EMS-030 DONE для initial finite editor: typed graph create/connect/run, pointer move/pan/zoom, undo/redo и persistent projects через shared IR/runtime (AC-045). EMS-031 DONE для initial pure nested composites: create/expand/edit/reuse, v2 dependency persistence, strict caller/pin/cycle gates и actual standalone compilation (AC-046). Текущий итог — 524/524 tests, 94/94 verify, 4/4 browser tests; точная история в docs/qa/PROGRESS.md. Следующие ready срезы — EMS-034 actual library и EMS-032 shared text/visual integration, затем WEB IDE MVP UI/events; deployment после полного owner-approved acceptance; advanced native ABI/error variants расширяются отдельно по evidence; standalone state export остаётся открыт. Зависимости не обходятся ради красивого редактора.

Gate ядра: формально описанные значения/вызовы/ошибки, совпадающие результаты и отказы runtime/standalone, отсутствие влияния canvas, каноническая сериализация IR с контролем версии и точные отрицательные тесты. Он приближает G-01/02/03/11/12, но не завершает M1: остаются full text/visual round-trip, расширенные ABI/target semantics и production compiler/state export; initial EMS-015..017 acceptance не закрывает эти глобальные требования.

Первое P1 из PROJECT_GOAL.md на чистом ядре выполнено (EMS-018, evidence browser-p1.json): тот же источник и векторы в Node.js и настоящем браузере плюс standalone вне проекта. Если браузер отсутствует, оставить gate открытым. M6 дополнительно требует реальный native/desktop backend и платформенные bindings; выполнение двух JS функций в одном Node.js не закрывает этот gate.

## Последовательность к целевой архитектуре

1. M1 фиксирует общий смысл программ и IR (G-01/03/11); runtime и compiler проверяются на общей базе, профиль расширяется по тестам.
2. M2 делает обе формы полноценными интерфейсами одного языка и даёт редактирование/отладку (G-02/04/05/14).
3. M3–M4 вводят UI/effects и самостоятельное Web-приложение с linker и declared bindings (G-08/10/12).
4. M5 формализует reusable seals, реальные чужие библиотеки, ownership и безопасные plugin boundaries (G-06/07/15).
5. M6 доказывает переносимость той же прикладной программы на Web и native/desktop (G-09/10/12), подтверждая первую полноценную архитектурную демонстрацию.
6. M7–M8 расширяют одну логическую программу на сеть и устройства с явно проверенными гарантиями (G-08/13/15).
7. M9 добавляет каталог и проверяемую генерацию/изменение по намерению человека (G-16/17).
8. M10 обеспечивает независимое распространение, совместимость, доверие и коммерческие права (G-18); M11+ по отдельным gates добавляет все перечисленные платформы (G-09).

Целевая архитектура считается достигнутой по совокупности G-ID и подтверждённой матрице платформ. Наличие только roadmap, manifest или adapter stub не закрывает gate.

## Уточнение владельца: ядро и WEB IDE MVP

WEB IDE MVP и деплой на `ems-vps` / `https://dev-ems.d-mash.ru` явно утверждены. Последующее уточнение: **сначала ядро, затем IDE**, обе части обязательны. Сейчас EMS-010..014 приняты в документированных начальных профилях, EMS-015 IN_PROGRESS с evidence AC-032..038. До IDE завершить необходимые effect/state/event semantics; поддержка всех будущих API не является условием первого MVP.

Пользовательский gate MVP: калькулятор, раскрываемый arithmetic AVG5, интерактивный DOM-счётчик, создание/соединение/исполнение/сохранение графов, text mode через общий IR, browser E2E и защищённый HTTPS deployment с проверкой и rollback. Пока не пройдены все сценарии, MVP не завершён. TLS домена при первичной проверке не соответствует SAN сертификата; чужие VPS-сервисы не изменялись.
