# Current implementation status

## Последняя проверка — ядро перед IDE

`npm test` **401/401 PASS**, `npm run verify` **62/62 PASS**. EMS-010..014 DONE для документированных начальных профилей (AC-025..031); M1 целиком не завершён. Новый текстовый AST frontend типизируется и реально исполняет чистые программы/generic helpers через общий IR/runtime, экспортирует standalone. Finite state/events и отмена host futures реализованы по AC-032. Structured control-flow и pure standalone реализованы по AC-033. Typed user exceptions/finally добавлены по AC-034; Option/Result/match исполнение и standalone добавлены по AC-035 (33 tests); language async/Future исполнение и standalone добавлены по AC-036; Stream/backpressure/for-await и computed localEffects добавлены по AC-037; ResourceHandle lifecycle ещё впереди.

EMS-014 DONE для начального finite effect/capability kernel: транзитивный policy preflight встроен в `executeGraph` (AC-029). Вложенные/unused декларации проверяются до первого host-вызова; раздельные grants и ошибочные списки проверены в `tests/effects.test.mjs`. Effect IR и explicit nested sequencing проверены по AC-030; AST effect pass, straight-line lowering, interface requirements и pure sequence export проверены по AC-031. EMS-015 IN_PROGRESS: transactional state events, bounded FIFO, replay и cancellation проверены; control IR v2/runtime/standalone также проверены по AC-033; typed user exceptions/finally также проверены по AC-034; Option/Result/match проверены по AC-035; async/Future проверены по AC-036; Stream проверен по AC-037; следующий срез — ResourceHandle/using lifecycle; production permissions и IO compiler bindings остаются впереди. Глобальная цель остаётся активной. WEB IDE MVP и деплой разрешены, но по уточнению владельца сначала продолжается ядро. Deploy не выполнен; TLS SAN mismatch остаётся обнаруженным инфраструктурным дефектом.

Baseline перед AC-037: 8c20120, 365/365 tests и 57/57 verify. Текущие логи: `/tmp/ems-stream-tests.log`, `/tmp/ems-stream-verify.log`; Node 22.21.0. Новые схемы разделяют finite/error, algebraic, future и stream profiles; executable validation — обязательный gate. Полная история — PROGRESS.md.

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

**Next action:** continue EMS-015 ResourceHandle/using lifecycle, from `docs/qa/PROGRESS.md`. Bootstrap sections below describe the original scaffold, not completed M1.

Точная ревизия без Git: `docs/qa/evidence/2026-10-11-core.json` содержит SHA-256 implementation/test/spec-format файлов и aggregate snapshot `2495e5f62507e4819ee55a7b8a7c4b73638d096b13b88fae991f98ccb7d78602`. Metadata состояния QA обновляется отдельно от этого semantic/source snapshot.

## Evidence log

- Local bootstrap validation: see ZIP delivery report; rerun on extraction.

## Bootstrap test evidence (packaging environment)

Node.js `v22.16.0`; `npm test` -> **16/16 PASS**; `npm run verify` -> **18/18 PASS**. Local static viewer GET routes tested: `/`, `/web/app.mjs`, `/src/reference/index.mjs`, `/examples/avg5.graph.json`, `/README.md` => HTTP 200; access to `/.agents/policy.json` => HTTP 403. Backlog dependency-order check: **44 tasks** valid. These are M0 proofs only, not a production launch.
