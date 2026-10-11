# Current implementation status

## EMS-035/033 — owner MVP proof и подготовка publication

678/678 Node PASS,130/130 verify PASS,24/24 browser PASS. Исправлен symlink CLI entrypoint, добавлен настоящий process regression; первый deployment412bf38 выявил это, не прошёл readiness и не объявлен успешным. Domain certificate выпущен, fixed release pending publication. Named local scenarios и границы — docs/qa/WEB_IDE_MVP.md. Реальный composite AVG5/вложенность/shared edit/reopen, точная graph failure location/lifecycle log. Deployment tooling подготовлен; public domain пока имеет TLS SAN mismatch, remote success требует actual release/auth/HTTPS/Chromium/recovery/rollback evidence. Глобальная цель и full step/control/source debugger остаются открытыми.

## Последняя проверка — EMS-050 unified local project catalog, AC-062

Каталог `/web/projects.html` объединяет graph/text/UI проекты: create/open/copy/rename/import/export, старые JSON импортируются копиями. Managed graph сохраняет graph+draft в одной записи; UI сохраняет applied source после Worker restart. Старые storage не мигрируются и не удаляются. Existing core codecs проверяют IR/pins/UI/source witnesses; no handler execution during import. Scope — docs/spec/PROJECT_MANAGER.md.

Baseline f295dd5:668 tests/128 verify/20 browser. `npm test` **672/672 PASS**, `npm run verify` **129/129 PASS**, `npm run browser:test` **22/22 PASS**; final targeted6/6 после улучшения malformed-version errors и browser graph refresh oracle. Browser draft Run12→Apply graph→refresh Run12, UI edited handler4→refresh4, creation/import originals/copy/rename. No new deps/VPS changes. Full AC-012/AC-014/owner MVP production deployment/global goal remain open.


## Последняя проверка — EMS-032 catalog/typed lexical ports, AC-061

`npm test` **668/668 PASS**, `npm run verify` **128/128 PASS**, `npm run browser:test` **20/20 PASS**. Baseline1c69b3e:664/127/19. Node22 / actual Chromium156. Arbitrary wires/full control canvas/collection projection/unified manager/MVP/deploy/global goal открыты.

Actual registry/source-function catalog содержит signatures/policies/kinds/native handle metadata без execution. Typed graph показывает parameters/locals/definition-use edges и named call inputs. Lexical connection переиспользует binding, а не копирует computation; actual effectful producer executes once. AST identity/visibility protects sibling/function/scope selection, frontend types/policies validate candidate before commit. Browser parameter1 after2 events/catalog call3/computed local2. Initial connection via forms, not arbitrary mouse wiring. Логи `/tmp/ems-graph-ports-{tests,verify,browser}.log`; details — docs/spec/CONTROL_GRAPH.md.


## Последняя проверка — EMS-032 structured graph operations, AC-060

`npm test` **664/664 PASS**, `npm run verify` **127/127 PASS**, `npm run browser:test` **19/19 PASS**. Baseline c3a4556:660/126/18. Node22 / actual Chromium156. Full AC-012/free wiring/layout/unified manager/MVP/deploy/global goal открыты.

Literal/operator/call и single-statement insert/delete структурируют реальные source node edits. Own AST ranges/exact stale guard/category/schema/single-fragment checks; ordinary frontend проверяет types/scope/policy/IR/UI closure до commit. Runtime/standalone values, signed zero, Undo, wrong types/syntax injection/missing return negatives PASS. Actual Chromium forms call3/insert63/delete3/literal4/operator5, invalid call preserves source/preview. Логи `/tmp/ems-graph-ops-{tests,verify,browser}.log`; scope — docs/spec/CONTROL_GRAPH.md.


## Последняя проверка — EMS-032/050 control source graph, AC-059

`npm test` **660/660 PASS**, `npm run verify` **126/126 PASS**, `npm run browser:test` **18/18 PASS**. Baseline75e5e65:656/125/17. Node22 / actual Chromium156. Full AC-012/free control canvas/unified manager/MVP/deploy/global goal открыты.

Checked source AST→ephemeral typed graph с source ranges/data/control/sequence/helper edges, public atomic interfaces и SVG selection. Node fragments применяются через тот же frontend/IR/UIProjectEditor; type/stale/source/ID negatives не меняют source/history/preview. Helper constant edit runtime+standalone3; browser expression edit preview2/type rollback/Undo1/Save/reopen2. Source witnesses и storage прежние. Synthetic collection projection/missing witnesses explicitly rejected. Initial first full test run659/660 exposed outdated data-edge direction assertion; fixed assertion verifies zero arguments and actual value-consumer edge, final660/660 PASS. Логи `/tmp/ems-control-graph-{tests-final,verify,browser}.log`; scope — docs/spec/CONTROL_GRAPH.md.


## Последняя проверка — EMS-061 IDE application download, AC-058

`npm test` **656/656 PASS**, `npm run verify` **125/125 PASS**, `npm run browser:test` **17/17 PASS**, `npm run export:ui` PASS. Baseline e740aad:653/124/16. Node22 / actual Chromium156. EMS-061 IN_PROGRESS: IDE package download завершён в initial finite scope; full control canvas/unified manager/PWA/native/maps/state locks/MVP/deploy/global goal открыты.

Общий buildUIProjectPackage работает Node/Web, CLI и IDE создают identical four files. UI button ждёт queued applied edits, проверяет actual source/IR/ref/policy и скачивает deterministic bounded regular-file TAR. Системный tar подтверждает exact UTF-8/empty/block bytes; paths/non-text/oversize отвергаются. Actual Chromium edited handler даёт preview3; скачанный/распакованный пакет после остановки EMS origin имеет initial0/first click3. Unsupported export сохраняет source/preview1 без нового archive. Логи `/tmp/ems-ui-download-{tests,verify,browser}.log`; scope/API — docs/spec/UI_EXPORT.md.


## Последняя проверка — EMS-061 independent DOM package, AC-057

`npm test` **653/653 PASS**, `npm run verify` **124/124 PASS**, `npm run browser:test` **16/16 PASS**; `npm run export:ui` PASS. Baseline ac01032:646/122/15. Node22 / actual Chromium156. EMS-061 IN_PROGRESS для initial finite profile; full IDE package export/control handler canvas/unified manager/PWA/native/maps/state locks/MVP/deploy/global goal открыты.

UIRuntime и compiled output используют один UIKernel, прежний ReactorKernel и existing mountDOMRuntime. CompileUIJS проверяет semantic UI+IR, сохраняет signed values/own port names; runtime проверяет ui.render и все handler policies до preview. CLI требует explicit policy, проверяет source→IR witness и pins до записи четырёх static files. Fresh Node executes semantic UI без EMS imports. Actual Chromium воспроизводит те же clicks/inputs/checkbox, rollback/disabled/focus/labels/inert text/close на nested independent static host после остановки EMS origin, без `/src/`/`/web/` requests. Логи `/tmp/ems-ui-export-{tests,verify,browser}.log`; limits/API — docs/spec/UI_EXPORT.md.


## Последняя проверка — EMS-060 standalone state session, AC-056

`npm test` **646/646 PASS**, `npm run verify` **122/122 PASS**, `npm run browser:test` **15/15 PASS**. Baseline44e1eaa:638/120/14. Node22 / actual Chromium156. EMS-060 IN_PROGRESS; независимая finite state session доказана, production/native backend/source maps/state lock/full UI/MVP/deploy/global goal открыты.

Interpreted ReactorSession и compiled output используют один ReactorKernel: FIFO, execution-owned draft, typed copies, commit/rollback, bounded admission/queue, cancellation/close и detached trace. compileReactorJS проверяет semantic manifest/handlers/kernel witness до build; generated module createSession/replayEvents не импортирует EMS. CLI экспортирует реальный typed source-owned UI project reactor. Node и actual Chromium differential tests доказывают same outcomes/traces, failure rollback/subsequent reads/replay и independent execution после остановки EMS origin. Control IR v2 state + pure graph IR v1; state graph v1/native IO explicit unsupported. Полный DOM/UI package пока не создан. Логи `/tmp/ems-reactor-export-{tests,verify,browser}.log`; scope/API — docs/spec/STATE_COMPILER.md.


## Последняя проверка — EMS-060 state handler compiler, AC-055

`npm test` **638/638 PASS**, `npm run verify` **120/120 PASS**, `npm run browser:test` **14/14 PASS**. Baseline a26af74:630/118/14. Node22 / actual Chromium156. EMS-060 IN_PROGRESS: независимый compiler обработчиков завершён в указанном профиле; standalone reactor/UI, production backend, full MVP/deploy/global goal открыты.

`compileStateControlJS` допускает реальные kernel state read/write и pure bindings; callback/ID/version/signature/policy witness отвергает подмены. Generated code проверяет grants/inputs/cancellation и сохраняет existing control budget/errors/async semantics. Differential tests сравнивают результаты и state call order; fresh Node process исполняет output без EMS imports. Контекст транзакции должен предоставить execution owner; scheduler/commit/rollback этим шагом не экспортированы. Ограничения: `docs/spec/STATE_COMPILER.md`. Логи `/tmp/ems-state-compiler-{tests,verify,browser}.log`.


## Последняя проверка — EMS-050 worker preview, AC-054

`npm test` **630/630 PASS**, `npm run verify` **118/118 PASS**, `npm run browser:test` **14/14 PASS**. Node22 / actual Chromium156. Baseline b2f038e625/115. EMS-050 IN_PROGRESS; full handler graphical representation/unified manager/standalone state/UI/AC-014/full MVP/deploy/global goal открыты.

Persistent worker endpoint использует существующий UIRuntime/ReactorSession с actual installed core/state registry. Typed project/source witnesses/refs и policy повторно проверяются до ready. Monotonic IDs/exact fields, detached result/error/committed snapshot/view/optional trace. Same DOM adapter supports local and ready worker runtime; main UI rendering remains original safe properties/listeners. New preview worker initializes before old session closes.

Deadline/default5s(init separate), Stop/active abort terminate whole worker, reject all pending, clear timers/listeners, ignore late messages и keep last-confirmed data; unknown unacknowledged internal outcome не объявляется rolled back/success. Already-aborted event does not dispatch; pending maxQueue+1<=65, overflow rejects before send. Core runtime step budget preserved. Worker custom foreign JS registry/sandbox не реализован.

5 новых Node tests use actual worker_threads/common endpoint: local runtime FIFO/output/snapshot/trace parity, typed failures/state rollback, invalid/permission init, close/late state rejection, actual EMS loop deadline, abort/queue overflow. All existing UI browser scenarios now execute preview in actual module Worker; new browser test modifies editor field while loop pending, verifies timeout/terminal session/confirmed snapshot, fresh healthy worker=1 and Stop cancels pending without late update. Target10/10 passed, final full630/118/14 includes factory guard. Logs /tmp/ems-ui-worker-{tests,verify,browser}-final.log. Schemas unchanged19; no external schema engine. git diff --check PASS. No new dependencies/VPS changes. Revision — commit containing report, parent b2f038e.

Limits/next: session Stop is coarse termination, not individual queued-event cancellation; no external IO rollback or plugin isolation. Compiler/validation/rendering remain local. Need standalone state/UI compiler/shared transaction conformance and independent browser application after runtime shutdown; graphical control handler/source maps/unified project integration/full owner MVP gate remain. Then authorized isolated auth/HTTPS/rollback deploy. Verified slices commit/push origin/main git@github.com:Seriy615/EMS.git. No subagents/model fallback.

## Предыдущая проверка — UI authoring

## Последняя проверка — EMS-050 UI forms + EMS source, AC-053

`npm test` **625/625 PASS**, `npm run verify` **115/115 PASS**, `npm run browser:test` **13/13 PASS**. Node22 / actual Chromium156. Baseline e3e6b8a621/112. EMS-050 IN_PROGRESS; full control handler graph/UI contracts factory/worker preview/standalone UI/AC-014/full MVP/deploy/global goal открыты.

Forms создают пустой UI project, primitive state, hierarchy/properties и typed event bindings через actual linked handler signature. EMS source uses original parser/checker/control lower; helpers remain in shared IR, runtime uses existing ReactorSession. Project v2 сохраняет source/entry witnesses для real handlers, повторно compile-ит и сравнивает canonical IR при parse/serialize. SOURCE_IR_MISMATCH, stale signatures и malformed source reject before accepted program/preview replacement. v1 transport backwards compatible. Aggregate Undo/Redo/Save/Open/download/import сохраняют source+IR. Widget click selects actual ID/event binding; handler open shows actual authored text/IR. No invented decompilation or JS business counter.

4 новых Node tests: UI/state/source/event creation/execution/storage, helper control functions and changed result/undo/redo source, whole-candidate source/signature/IR negatives/atomic rollback, own prototype-named handler metadata. Actual new browser scenario creates count/display/plus/handler from empty forms without JSON editing: click1, source edit click2, invalid source retains program/preview, Undo1, Redo/Save/OpenHandler, reopen source and click2. Existing signed transport/download/import/corrupt records, core/P1/IDE/library/UI tests remain green. Target Node+UI browser8/8 before added invalid browser candidate assertion; final full gate includes assertion. Schemas19 parsed/local refs resolved; external schema engine not run. Logs /tmp/ems-ui-author-{tests,verify,browser}-final.log. git diff --check PASS. No new dependencies/VPS changes. Revision — commit containing report, parent e3e6b8a.

Next: control handler graphical representation/text linking and proper event/state project integration, worker preview isolation, independent standalone state/UI compiler proof then full owner MVP gate/auth HTTPS isolation/rollback deploy. Current UI forms/source editor is real initial authoring, not full IDE/global completion. Verified slices commit/push origin/main git@github.com:Seriy615/EMS.git. No subagents/model fallback.

## Предыдущая проверка — UI transport

## Последняя проверка — EMS-050 typed UI project, AC-052

`npm test` **621/621 PASS**, `npm run verify` **112/112 PASS**, `npm run browser:test` **12/12 PASS**. Node22/actual Chromium156. Baseline4bdcb34:615/615 tests,109/109 verify. EMS-050 IN_PROGRESS; full AC-014, visual UI/source authoring, standalone UI/MVP/deploy/global goal остаются открытыми.

ems-ui-project/1 отделяет runtime application от transport: explicit typed state initial/literal bindings сохраняют Number/NumberArray -0 и String marker distinction. Handler IR использует существующий codec. Whole application validation и exact transitive references включают unused nested composite dependencies/interface implementations/resource chains; missing/duplicate/extra/drift pins reject before any invocation. Pins не byte provenance или подпись. Limits1MiB/100slots+handlers/1000nodes/depth32/10000refs/depth256. Strict source parsing и canonical write не исполняют handlers/imported code.

UIProjectEditor transactional replace/Undo/Redo с revalidation при dependency drift; single atomic local storage record preserves previous on quota/corrupt validation failures. UI browser workspace имеет typed JSON Apply/Undo/Redo/Save/Open/download/import, preflight policy до закрытия прежнего preview и recover-to-example without overwriting corrupt record. Save содержит program/initial values, не текущее runtime state.

6 новых Node tests: signed scalar/array/String marker and executable restored state, call/control rollback, transitive unused version drift/no host call, malformed data/limits/record order, undo/quota/corrupt storage preservation и undo dependency-drift preflight. Actual new browser scenario edits initial=-0/delta2, Apply/Undo/Redo, invalid source preserves accepted model, Save, real downloaded file/import initial10, reload saved initial=-0, corrupt load fallback preserves invalid record. Existing12 browser tests/core/P1/IDE/library/UI regressions pass. Target combined9/9 and browser3/3. Schemas19 parse/local refs resolve; separate schema engine not run. Logs /tmp/ems-ui-codec-{tests,verify,browser}-final.log. git diff --check PASS; dependencies/VPS unchanged. Revision — commit containing report, parent4bdcb34.

Next: full UI authoring on shared state/IR, handler text+graph edits with portable source persistence and widget→handler inspector, unified project storage; then actual standalone state/UI compiler/browser output, third owner scenario/full MVP/auth HTTPS isolation/rollback deploy. Typed JSON textarea/workspace is not full visual UI editor. Verified slices commit/push origin/main git@github.com:Seriy615/EMS.git. No subagents/model fallback.

## Предыдущая проверка — UI/DOM backend

## Последняя проверка — EMS-050 первый semantic UI/DOM backend

`npm test` **615/615 PASS**, `npm run verify` **109/109 PASS**, `npm run browser:test` **11/11 PASS**. Node22 / actual Chromium156. Baseline2c4a422:608/608 tests,106/106 verify. AC-051 реализован для initial semantic backend; EMS-050 IN_PROGRESS. Full AC-014/control UI-authoring/WEB IDE MVP/standalone state-UI/deploy/global goal открыты.

UI tree отделён от IR handlers и editor canvas. Typed String/Boolean properties/state refs, explicit Number display и press/change event routing используют реальную linked signature. UIRuntime владеет существующей ReactorSession; нет JS business counter/второго executor. All handlers preflight, explicit ui.render capability/effect plus state grants. Actual buttons run examples/counter.ems derived IR; verify compares actual source lowered IR to saved example. Failure/cancel/budget keeps committed snapshot, including controlled input restore. DOM text/value properties, fixed kind mapping, preserved elements/focus, aria labels, duplicate mount rejection и idempotent close/listener removal.

7 new Node tests проверяют FIFO/isolated copies/snapshot/descriptor mutation, typed throw/rollback/disabled/input shape, hidden host policy/no invocation, malformed tree/unsupported DOM escapes/binding/event types, signed zero/cancel/close, saved counter и default shared control STEP_LIMIT rollback. 2 new actual browser tests: real demo click/reset/close plus policy-before-host-write, busy host, controlled String/Boolean changes and rollback, focus/labels/inert malicious-looking text, disabled button/detached event/session rejection; rejected async error observer handled. Existing11 browser suites include old core/P1/editor/collections regression. Schemas18 parsed/local refs resolved; external schema engine not run. Logs /tmp/ems-ui-tests-final.log, /tmp/ems-ui-verify-final.log, /tmp/ems-ui-browser-final.log; targeted7/7 Node and initial8/8 combined before seventh Node addition. git diff --check PASS. No added dependencies/VPS mutation. Revision — commit containing this report, parent2c4a422.

Limits/next: current JSON UI example is fixed runtime backend proof, not full Studio UI editor. UI/state signed-value transport codec, UI contract factory/IDL, authoring/preview/inspect, hierarchy updates and standalone state/UI compilation remain next EMS-050/051 slices. Ordinary JSON Number loses -0 outside typed IR; runtime API preserves it and does not claim completed UI persistence. Native/UI visual parity and production plugin sandbox not implemented. Proceed to typed UI application authoring/persistence then independent UI export/third demo/full MVP and owner-authorized isolated auth/HTTPS/rollback deploy. Verified slices commit/push origin/main git@github.com:Seriy615/EMS.git. No subagents.

## Предыдущая проверка — visual collections

## Последняя проверка — EMS-034 visual typed collections

`npm test` **608/608 PASS**, `npm run verify` **106/106 PASS**, `npm run browser:test` **9/9 PASS**. Node22 / actual Chromium156. Baseline f743691:596/596 tests,103/103 verify,8/8 browser. AC-050 реализован; EMS-034 DONE для initial finite library/pure NumberArray typed parameters. Full AC-012, WEB IDE MVP, deploy и global goal открыты.

Visual bindings выбирают real typed atomic/composite callbacks с exact versions/transitive pure policy. Ordinary graph lowering preserves demand memo/sequence и inlines editable callbacks в existing control frontend/IR, без нового evaluator/per-element budget. Map/Filter/share budget/throws и standalone совпадают. v3 сохраняет root/definitions/canvas/inputs/refs/bindings и проверяемый root IR witness; tampered pins/IR и циклы отвергаются. v1/v2 unchanged; Undo/storage/text Apply preserve library.

12 новых Node tests: actual shared runtime/text/compiler, fresh independent Node process, callback edits/storage/undo, signatures/versions/cycles/effects/no invocation, order/signed zero/lazy/sequence, shared steps/depth/cancel, semantic closure version lock, strict codec shapes and JSON field-order independence. Actual browser создаёт predicate и Map→Filter, edits/Undo/Redo/Save/FromGraph/Run/reopen, затем saved graph exported module работает на independent origin после shutdown runtime server без /src requests. Example examples/studio-collections.ems.json returns[3]. Schemas17 parsed/local refs resolved; отдельный schema engine не запускался. Логи /tmp/ems-visual-collections-tests-final.log, /tmp/ems-visual-collections-verify-final.log, /tmp/ems-visual-collections-browser-final.log; targeted12/12. git diff --check PASS. No new dependencies/VPS changes. Revision — commit содержащий отчёт, parent f743691.

Limits: pure NumberArray visual callbacks, static source references; full control text→canvas Apply запрещён, direct source call visual binding ID unsupported. Owned public-interface collection graph lowering rejects rather than dropping guards. Native/dynamic callable/async mappings и production linear builder не заявлены. Next ready EMS-050 semantic UI/DOM/reactor counter; затем authoring/persistence/standalone UI/third demo/full MVP/authorized HTTPS auth deploy. Verified slices commit/push origin main git@github.com:Seriy615/EMS.git, без force и субагентов.

## Предыдущая проверка — source collections

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
