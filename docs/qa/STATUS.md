# Current implementation status

## Последняя проверка — ядро перед IDE

`npm test` **524/524 PASS**, `npm run verify` **94/94 PASS**, `npm run browser:test` **4/4 PASS**. Node22 / actual Chromium156. EMS-031 DONE для initial pure dataflow composite authoring/navigation. Full WEB IDE MVP/AC-012/deploy и глобальная цель открыты.

AC-046: Studio создаёт typed composite snapshot, повторно использует одним блоком, раскрывает/редактирует/navigates nested bodies и обновляет actual caller execution. Independent workspace inputs/canvas, aggregate undo/redo, strict caller type/version/cycle/used definition delete preflight. v2 сохраняет root/body IR и exact referenced versions; v1 unchanged roundtrip. Missing definitions/pins/extra metadata rejects before execution. Conservative expanded operations <=10000 отвергает compact exponential fanout до lowering. «Экспорт JS» existing compiler выдаёт actual independent nested code, без нового executor или fake sealed package success.

7 new studio-composites tests: real body/caller/undo, nested scopes/storage/canvas, cycles/signatures/delete/atomic leaf, author String inputs/output, pins/missing metadata, unchanged v1/unused delete undo, independent new-process generated execution и fanout limit. Browser creates Sum, edits body to x+10, creates Outer→Sum, expands both, root=12 и reopen=12 с definitions. Existing editor mouse/download/import-copy/reopen flow и actual P1/M0 explorer продолжают проходить.

Baseline d201b72: 517/517 tests, 92/92 verify (/tmp/ems-composite-editor-baseline-tests.log, /tmp/ems-composite-editor-baseline-verify.log). Итог /tmp/ems-composite-editor-tests.log, /tmp/ems-composite-editor-final-verify.log, /tmp/ems-composite-editor-all-browser.log. Target model 14/14, browser editor 2/2. Schemas16 parsed/local refs resolved, external schema engine не запускался. git diff --check PASS; dependencies не устанавливались, VPS untouched.

Далее ready EMS-034 library logic/text/arrays и EMS-032 text/shared visual integration, затем UI/events/state counter и третья demo, полное MVP acceptance и owner-authorized deploy. Pure graph composites не full control visual mapping/public IDL authoring или arbitrary foreign JS import. Standalone module export не sealed package distribution/secrecy. Commit/push checked slices origin main git@github.com:Seriy615/EMS.git.

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
