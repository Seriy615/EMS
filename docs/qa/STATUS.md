# Current implementation status

## Последняя проверка — EMS-034 typed source Map/Filter

`npm test` **596/596 PASS**, `npm run verify` **103/103 PASS**, `npm run browser:test` **8/8 PASS**. Node22/actual Chromium156. Baseline8b946bd:578/578 tests,100/100 verify. AC-049 реализован для static pure NumberArray templates через обычный control IR. EMS-034 IN_PROGRESS до visual authoring/persistence; full MVP/AC-012/UI counter/deploy/global goal остаются открыты.

Map/Filter принимают static source/generic/atomic/composite references, с actual signature/effect/local-effect gates до execution. Hygienic normalization генерирует checked functions/for/if/calls, shared control steps/depth/cancellation и existing runtime/compiler; новый evaluator/IR opcode не добавлен. Array argument once, order/empty/signed zero preserved, Filter возвращает original values, exceptions stop iteration. Alias/user-name/source-append shadow tests passed. Original AST unchanged; generated locations anchor source call. Catalog v2 различает36 installed primitive contracts и2 typed templates.

18 новых model tests проверяют runtime/serialized IR/standalone, generic/atomic/composite refs и async entry, shape/local-value/arity/async-output/effects/hidden graph/local resources negatives, actual source locations/nonmutation, namespace hygiene, shared step/depth/cancel diagnostics, throws/catches, actual lock/version drift. Browser Studio text pipeline [-3,0,2]→[9,4] показывает actual IR/helper/mapper functions, rejects unsupported Apply, independent static module исполняется после shutdown runtime origin без source requests. Existing P1/core/IDE/library remain green. Логи /tmp/ems-collections-tests-final.log, /tmp/ems-collections-verify.log, /tmp/ems-collections-browser.log, target18/18 и browser1/1. git diff --check PASS, schemas unchanged/dependencies не добавлены/VPS untouched. Revision — commit содержащий отчёт, parent8b946bd.

Limits: static Number→Number/Boolean refs, no dynamic callable values/closures/effectful or Future-output callback. Pure foreign metadata is trusted, не sandbox. Immutable append reference cost может быть quadratic; production builder optimization не заявлена. Text drafts остаются local и не project control persistence. Следующий шаг — real visual collection/control workspace model и persistence на тех же semantics/shared budgets; затем DOM counter/full MVP/auth HTTPS deploy. Checked slices push origin/main git@github.com:Seriy615/EMS.git; без субагентов.

## Предыдущая проверка — finite standard library

## Последняя проверка — EMS-034 finite standard library

`npm test` **578/578 PASS**, `npm run verify` **100/100 PASS**, `npm run browser:test` **7/7 PASS**. Node22/actual Chromium156. AC-048 реализован; EMS-034 **IN_PROGRESS** до typed Map/Filter acceptance. Baseline 3a9db53: 534/534 tests, 97/97 verify. Global goal/full MVP/AC-012/DOM counter/deploy остаются открытыми.

36 typed pure atomic operations: values, logic, numeric comparison/rounding, eager selection, Unicode-aware text length/slice/strict decimal conversion, copying NumberArray operations. Separate public IDL data, declared errors/pure deterministic policy и trusted operational bodies; existing compiler emits actual standalone без EMS imports. New stdlib intrinsic ABI witness/lock drift gate не является binary attestation. Каталог имеет categories/search-by-id-name-type и visible ordered signatures. Source/Studio example «Массив → текст» реально возвращает sum=6.

44 новых Node tests: все36 независимых value oracles, runtime/serialized IR/standalone и direct copy checks; index/format/type negatives; isolated new-process output; loops/source, eager Select vs lazy if, intrinsic drift, public IDL binding/error parity и shipped examples. 2 новых browser tests: all36 actual Chromium runtime плюс independent modules после shutdown runtime origin, без /src requests; UI filter/text/comparison/select/array graphs/example/signed zeros/reopen. Existing P1/core/IDE continue green. Логи /tmp/ems-library-tests.log, /tmp/ems-library-verify.log, /tmp/ems-library-browser.log; targeted model44/44, browser2/2. git diff --check PASS; dependencies не добавлялись, VPS untouched; revision — commit содержащий отчёт, parent3a9db53.

Далее: завершить EMS-034 typed higher-order Map/Filter с contract signature/effect checks и shared execution budgets; затем UI/DOM event counter и whole MVP acceptance, authorized deploy с auth/HTTPS/rollback. Map/Filter не показаны как фиктивные contracts или String callback port. Checked slices commit/push origin/main git@github.com:Seriy615/EMS.git. Субагенты не запускались.

## Предыдущая проверка — EMS-032 text integration

## Последняя проверка — EMS-032 начальный text mode

`npm test` **534/534 PASS**, `npm run verify` **97/97 PASS**, `npm run browser:test` **5/5 PASS**. Node22 / actual Chromium156. AC-047 реализован в начальном документированном профиле; EMS-032 **IN_PROGRESS**, full AC-012/WEB IDE MVP/deploy/global goal открыты. Baseline 28c3e91: 524/524 tests, 94/94 verify.

Source использует существующие frontend/IR/runtime/compiler. Supported graph → text → graph сохраняет canonical IR, binding identifiers, signed literals/zero и separate canvas/inputs. Обычный text сохраняет eager sequence и unused failures; generated lazy SSA profile явно call. Helpers сохраняются editable definitions. Source Apply проверяет whole project/callers и входит в Undo/Redo; control text исполняется/экспортируется, но dataflow conversion явно запрещена. Source errors показывают location/selection и IR viewer реальный provenance. Полная control visualization/runtime trace/portable source пока не реализованы.

Run графа/текста использует disposable Worker, существующий executor, Stop/CANCELLED и deadline 5s; control steps10000/depth32. Strict local bounded draft record сохраняет invalid source и предыдущую запись при quota failure. Draft не входит в project export. Source fanout отвергается до execution/export; arbitrary JS import/sandbox не добавлен.

Evidence: 10 новых Node tests (canonical/signed literals, eager/order/helpers/provenance/standalone, async/control rejection, locations/collisions, selected composite edits, quota/corrupt records, partial sequences и fanout), actual Chromium text UI (Run/IR/Apply/Undo/Redo/roundtrip/control/location/Stop/deadline/reopen/signed input). Existing P1/editor/composites остаются зелёными. Логи /tmp/ems-text-studio-tests-final.log, /tmp/ems-text-studio-verify-final.log, /tmp/ems-text-studio-browser-final.log, targeted model10/10. git diff --check PASS; dependencies не добавлялись, VPS unchanged. Revision — commit содержащий этот отчёт, parent 28c3e91.

Следующий ready task EMS-034 actual typed logic/text/array contracts; затем UI/events counter и full MVP acceptance, после него authorized HTTPS/auth/rollback deployment. Verified slices commit/push origin main git@github.com:Seriy615/EMS.git без force. Субагенты не запускались.

## Предыдущая проверка — composite editor

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
