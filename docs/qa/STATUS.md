# Current implementation status

## Последняя проверка — ядро перед IDE

`npm test` **431/431 PASS**, `npm run verify` **67/67 PASS**, Node 22.21.0. EMS-010..014 DONE для начальных профилей AC-025..031. EMS-015 IN_PROGRESS: state/events/cancellation AC-032, control-flow AC-033, typed errors AC-034, algebraic values/match AC-035, async/Future AC-036, Stream AC-037 и ResourceHandle/using AC-038 реализованы через общий IR/runtime; supported standalone paths проверены отдельно.

AC-038: 30 новых resource tests, typed owned cells и independent standalone, lexical ownership/escape и LIFO cleanup на всех exits, отдельные cleanup signal/deadline вне maxSteps. Trusted native lifecycle binding реально закрывает OS file descriptor (EBADF); preflight и pinned versions проверены. Cancelled acquisition и active read получают bounded wait/late exact-once release attempt, не фиктивный physical cleanup. Native binding export явно UNSUPPORTED_TARGET. Reactor commit ждёт cleanup; отказ освобождения откатывает owned state. Подробности: docs/spec/CONTROL_RESOURCES.md.

Baseline AC-038: `0fbee2a`, 401/401 tests, 62/62 verify. Логи `/tmp/ems-resource-tests.log`, `/tmp/ems-resource-verify.log`; schemas JSON parsed и local refs resolved (11 schemas), внешний schema engine не запускался. `node examples/resource-file.mjs examples/resources.ems` реально прочитал файл. Внешние зависимости не устанавливались.

Следующий срез: завершить описания full error/resource IDL и stable conformance (EMS-016/017); standalone state export остаётся открыт. Глобальная цель активна; M1/P1/browser/WEB IDE MVP/deploy не завершены. Владелец разрешил WEB IDE и deploy, уточнил core-first и origin `git@github.com:Seriy615/EMS.git`. TLS SAN mismatch ранее обнаружен; VPS services в этом срезе не изменялись. Проверенные изменения commit/push в main, без force.

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

**Next action:** continue full error/resource IDL and conformance after EMS-015 resource slice, from `docs/qa/PROGRESS.md`. Bootstrap sections below describe the original scaffold, not completed M1.

Точная ревизия без Git: `docs/qa/evidence/2026-10-11-core.json` содержит SHA-256 implementation/test/spec-format файлов и aggregate snapshot `2495e5f62507e4819ee55a7b8a7c4b73638d096b13b88fae991f98ccb7d78602`. Metadata состояния QA обновляется отдельно от этого semantic/source snapshot.

## Evidence log

- Local bootstrap validation: see ZIP delivery report; rerun on extraction.

## Bootstrap test evidence (packaging environment)

Node.js `v22.16.0`; `npm test` -> **16/16 PASS**; `npm run verify` -> **18/18 PASS**. Local static viewer GET routes tested: `/`, `/web/app.mjs`, `/src/reference/index.mjs`, `/examples/avg5.graph.json`, `/README.md` => HTTP 200; access to `/.agents/policy.json` => HTTP 403. Backlog dependency-order check: **44 tasks** valid. These are M0 proofs only, not a production launch.
