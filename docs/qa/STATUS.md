# Current implementation status

## Последняя проверка — ядро перед IDE

`npm test` **517/517 PASS**, `npm run verify` **92/92 PASS**, `npm run browser:test` **3/3 PASS**. Node 22.21.0, настоящий Chromium 156.0.8078.4. EMS-030 DONE для initial finite graph editor acceptance; полноценный WEB IDE MVP/AC-012/IDE deploy и глобальная цель открыты.

AC-045: root Studio теперь реально редактирует графы: core library, typed function input/output, port connections, literals/values inspector, transactional type/cycle rejects, delete/disconnect, real pointer drag, pan/zoom, undo/redo. Run → existing graph serializer/IR parser/executeIR, без отдельного executor. ems-studio-project/1 хранит IR отдельно от canvas и typed input values, сохраняет -0. LocalStorage atomic record/active project, autosave, Save/Open/New/download/import работают; import совпадающего id создаёт копию.

7 new tests/studio.test.mjs: shared execution/IR roundtrip, canvas invariance, history/input copies, negative edits rollback, delete refs, -0 vs String, storage quota/corruption, own prototype-like input and strict project validation. Actual tests/browser/studio.test.mjs: create/connect/Run=5, wrong-type rejection, physical mouse drag, undo/redo/zoom, OS file download/import modified copy=11, original project selection и page reopening=5. Browser P1/conformance и прежний M0 explorer продолжают проходить; explorer сохранён /web/explorer.html. Screenshot /tmp/ems-studio.png осмотрен, не заменяет behavior tests.

Baseline 5f314cc: 510/510 tests, 89/89 verify (/tmp/ems-editor-baseline-tests.log, /tmp/ems-editor-baseline-verify.log). Итог /tmp/ems-editor-tests.log, /tmp/ems-editor-final-verify.log, /tmp/ems-editor-final-browser.log; expanded E2E /tmp/ems-editor-browser-final.log. Schemas parsed/local refs resolved 16, external schema engine не запускался. git diff --check PASS. Dependencies не устанавливались, VPS untouched.

Следующая ready EMS-031: actual composite create/expand/edit/reuse. Core-only library, text/control graph visual mapping, runtime node tracing, UI/events/state counter и deployment остаются открыты. Нельзя считать этот initial editor всем owner-approved MVP. Browser local storage не cloud persistence; failed storage оставляет память/export и показывает failure. Проверенные slices commit/push main git@github.com:Seriy615/EMS.git.

## Текущее состояние после EMS-012

`npm test` **153/153 PASS**, `npm run verify` **31/31 PASS**. EMS-010/011/012 DONE по AC-025/026/027 в явно ограниченных профилях. EMS-013 IN_PROGRESS: structural types/unification проверены, full AST checker/lowering ещё впереди. M1 открыт.

Владелец разрешил WEB IDE MVP и деплой, уточнив порядок: сначала ядро. SSH `ems-vps` доступен; DNS 85.198.64.183; TLS для `dev-ems.d-mash.ru` сейчас не проходит проверку SAN (curl 60). Deploy не выполнен. Проектирование и изменения ядра продолжаются до подключения реальной IDE; старые сервисы VPS не изменялись.

## Проверено: EMS-011

`npm test` **110/110 PASS**, `npm run verify` **29/29 PASS**. AC-026 — `tests/ir.test.mjs`: версионированный typed call-IR, строгий validator, round-trip 28 векторов, идентичный IR text/graph, координаты отдельно, точные версии контрактов и независимый CLI export новым процессом. EMS-011 DONE для начального профиля; EMS-012 начата. Transitive lock, полный control-flow HIR и полноценный язык остаются открыты. Это не завершение M1.

## Проверено 11 октября 2026: EMS-010

Глобальная цель: `PROJECT_GOAL.md`; журнал продолжения: `docs/qa/PROGRESS.md`. Node.js v22.21.0, Linux; Node/npm доступны через `PATH=/opt/forgeai-node-v22.21.0/bin:$PATH`. Git metadata отсутствует, commit ID не заявляется.

Baseline: `npm test` **16/16 PASS**, `npm run verify` **18/18 PASS**. После EMS-010: `npm test` **59/59 PASS**, `npm run verify` **18/18 PASS**. AC-025 подтверждается `tests/semantics.test.mjs` и 28 векторами в `tests/fixtures/semantics.json`: числовые крайние случаи, промежуточные ошибки, знак нуля, входы, мемоизация, порядок портов, вложенная композиция и большие массивы. AC-001..011 продолжают проходить.

Политика владельца обновлена на GPT-6.1 Sol / GPT-6 Luna; подтверждена владельцем для этого чата, без независимой телеметрии ID. Субагенты не запускались.

EMS-010 завершена как нормативный начальный профиль, EMS-011 в работе. M1, P1 и AC-018 открыты. Runtime/standalone пока проверены в одном Node.js. Полноценный язык, IDE, платформенные backend, sandbox и AI composition не реализованы.

**Baseline:** EMS M0 reference scaffold. Verification is required after unpacking in target Codex runtime.

**Implemented in source:** typed reference graph evaluator; 7 pure arithmetic atoms; tiny textual EMS subset; pure composite expansion; pure JS standalone exporter; atomic manifest sealing; trusted local ESM binding helper; examples and tests.

**Not implemented:** production language and IR, full visual IDE, cross-target native compiler, safe arbitrary-library importer, crypto binding, real platform adapters, plugin sandbox, AI orchestration, distributed runtime, marketing infrastructure.

**Security caveat:** reference registry runs in-process trusted JS. No production isolation.

**Model restriction:** only GPT-6.1 Sol / GPT-6 Luna for any agent work; no GPT-5.6 Sol / Astra.

**Next action:** continue dependency locking and common conformance, then actual browser P1 and IDE, from `docs/qa/PROGRESS.md`. Bootstrap sections below describe the original scaffold, not completed M1.

Точная ревизия без Git: `docs/qa/evidence/2026-10-11-core.json` содержит SHA-256 implementation/test/spec-format файлов и aggregate snapshot `2495e5f62507e4819ee55a7b8a7c4b73638d096b13b88fae991f98ccb7d78602`. Metadata состояния QA обновляется отдельно от этого semantic/source snapshot.

## Evidence log

- Local bootstrap validation: see ZIP delivery report; rerun on extraction.

## Bootstrap test evidence (packaging environment)

Node.js `v22.16.0`; `npm test` -> **16/16 PASS**; `npm run verify` -> **18/18 PASS**. Local static viewer GET routes tested: `/`, `/web/app.mjs`, `/src/reference/index.mjs`, `/examples/avg5.graph.json`, `/README.md` => HTTP 200; access to `/.agents/policy.json` => HTTP 403. Backlog dependency-order check: **44 tasks** valid. These are M0 proofs only, not a production launch.
