# Acceptance tests and proof requirements

Each AC ID must link to executable test output / exact command / revision. The M0 tests are reference-only; future targets have separate gates.

| AC | Scenario | Expected result | Phase |
|---|---|---|---|
| AC-001 | Arithmetic Ao5 graph runs | arithmetic result 12.566666... for fixture | M0 |
| AC-002 | Same algorithm expressed in textual subset | identical result / graph | M0 |
| AC-003 | Reject number ↔ incompatible type | `TYPE_MISMATCH` | M0 |
| AC-004 | Reject cycle / missing contract | deterministic error | M0 |
| AC-005 | Recursive composite referencing atomic | normal execution | M0 |
| AC-006 | Compile pure graph to standalone ESM | module has no EMS imports, same result | M0 |
| AC-007 | Seal composite to atomic package | manifest + module, no original graph | M0 |
| AC-008 | Load sealed artifact as atomic into second graph | same result through public signature | M0 |
| AC-009 | Trusted ESM library exports map to multiple atomic blocks | typed contracts execute with adapters | M0 |
| AC-010 | Capability checks reject ungranted action | `PERMISSION_DENIED` before effect | M0 |
| AC-011 | Compiler rejects effectful operations | explicit unsupported-target error | M0 |
| AC-012 | Text and visual full language round-trip | same semantic AST/IR, source-map trace | M1/M2 |
| AC-013 | Composite double-click Expand/Collapse | nested graph inspectable | M2 |
| AC-014 | Browser UI binds to state and events | button updates scoreboard state | M3 |
| AC-015 | Standalone Web build independent from IDE | host without EMS IDE can execute | M4 |
| AC-016 | Real WASM/C ABI lib import | library functions -> atomic blocks, ABI conformance | M5 |
| AC-017 | Real crypto via vetted library | known vectors, invalid tag rejected; no secrets logged | M5 |
| AC-018 | Same graph executes on two true targets | differential results/semantics tested | M6 |
| AC-019 | Device adapter | device discovery, permission, real event | M8 |
| AC-020 | Distributed graph | roles/events with retries and partitions | M7 |
| AC-021 | AI creates validated graph from available registry | nonexistent contracts rejected | M9 |
| AC-022 | Compiled commercial atom | no graph shipped; license respected; no secrecy claim | M10 |
| AC-023 | Package trust | signature validation / dependency hashes / revoke | M10 |
| AC-024 | Correct WCA Ao5 | penalties, DNF, ties, rounding, fixtures | M8 |
| AC-025 | Finite core semantic conformance | runtime and standalone agree on values, signed zero, intermediate checks, error codes/details, shared nodes and port order | M1 core |
| AC-026 | Typed versioned core IR | canonical text/graph roundtrip, signed-zero literals, contract version/type/ref checks, canvas sidecar, independent CLI export | M1 core |
| AC-027 | Own EMS grammar and located AST | modules, contracts, generic functions, expressions, control/error/resource/async syntax; negative cases and frontend limits; parsing executes no host code | M1 frontend |
| AC-028 | Located AST type checker and pure lowering | rigid generic bodies, independent inference, aliases, collections/unions/resources, pattern exhaustiveness, scope/control checks; AST → shared IR → runtime/standalone; unsupported semantics rejected | M1 type pass |
| AC-029 | Runtime transitive policy preflight | reject nested/unused unauthorized declarations before any host call; independent effect/capability grants; reject malformed policy; authorized nested execution preserves grants | M1 effects slice |
| AC-030 | Explicit effect IR sequence | canonical policy and order roundtrip; reject forged declarations, omissions and reversed dependencies; nested preflight, once-only calls, failure stops later actions; pure compiler rejects hidden effects | M1 effects IR |
| AC-031 | Textual effect inference and execution | fixed-point transitive/generic/recursive inference; located pure/budget rejection; linked extern policy; interface requirements roundtrip; ordered SSA/expression execution and pure sequence export; CLI grant file | M1 effects frontend |
| AC-032 | Finite state/event session and cancellation | typed state contracts through text/shared IR; FIFO/replay, rollback, isolated copies, queue overflow, active/queued abort, late-write rejection, close, permissions and invalid bindings | M1 state slice |
| AC-033 | Structured finite control IR and standalone | typed scopes, eager statements, branches/short circuit, mutable locals, loops/break/continue, generics/recursion, arrays/index, matched errors/budgets/depth guards, effects and reactor rollback, independent CLI export | M1 control slice |
| AC-034 | Typed user exceptions and finalization | primitive/alias/generic catch, rethrow, finally on returns/loop exits, protected cancellation/budgets, profile/version checks, permissions, state rollback/replay, payload-free failure traces, matching standalone/CLI export | M1 error slice |
| AC-035 | Option/Result constructors and nested exhaustive match share typed IR/runtime/standalone | malformed tags/types/IR rejected, exact budget/order/policy parity, actor rollback/replay and independent export; `tests/control-algebraic.test.mjs` | M1 частично |
| AC-036 | Language async/Future through shared IR/runtime/standalone | typed scoped hot tasks/await, single-flight, supervised failures and cancellation, future/depth/step budgets, events join/FIFO/rollback, profile/ownership boundaries and independent export; `tests/control-futures.test.mjs` | M1 async slice |
| AC-037 | Stream snapshot/bounded channel and for await share IR/runtime/standalone | actual FIFO/backpressure/end, copied values/ownership, localEffects and grants, limits/cancel/terminal producer wakeup, actor rollback/replay, strict IR and independent CLI export; `tests/control-streams.test.mjs` | M1 Stream slice |
| AC-038 | ResourceHandle/using lifecycle shares IR/runtime/standalone | copied typed cells, ownership/escape/LIFO/all exits, separate cleanup budget, actual file descriptor closure, native preflight/pinned versions, cancel/late IO/timeouts/errors, reactor rollback/replay and independent CLI export; `tests/control-resources.test.mjs` | M1 resource slice |
| AC-039 | Separate versioned interface/binding IDL and finite adapter checks | strict canonical snapshots, exact pins/targets/types/policy and backward compatibility, actual runtime/standalone pre/post and error gates, CLI and independent export; `tests/contracts-idl.test.mjs` | M1 initial IDL slice |
| AC-040 | Composite public interface preserves inspectable graph and execution guards | graph/IR/text runtime/standalone pre/post/error parity, nested ordering/memo scopes, edited graph/policy/version negatives, seal/reimport, independent export and event rollback; `tests/contracts-composite.test.mjs` | M1 composite IDL slice |
| AC-041 | Typed public resource lifecycle IDL preserves execution ownership | per-phase pre/post/type/errors, factory post ownership-before-check, readonly/versions/policy, nested guards/single release, cancellation/late IO, real file fd closure and state rollback; `tests/contracts-resource.test.mjs` | M1 resource IDL slice |
| AC-042 | Program lock verifies transitive contracts and actual source artifact provenance | program/target/graph/IDL/source drift, private intrinsic identities, verified SDK DAG/staging, no callback hashing, snapshots, actual file closure, CLI and independent export; `tests/program-lock.test.mjs` | M1 dependency lock slice |

| AC-043 | Common finite differential conformance gate | same fixtures through runtime, serialized IR and fresh standalone processes; exact values/signed zero/error details/typed throws, independent oracle and negative gate tests; `tests/conformance.test.mjs`, `npm run conformance` | M1 reference conformance |
| AC-044 | Real Node/Web pure-core P1 with standalone application | 57 fixtures through 5 actual Node/Chromium executors, browser lock drift rejection, byte-identical exported application and actual form after runtime origin shutdown; `npm run browser:test`, `npm run browser:verify`, `tests/portable-export.test.mjs` | P1 initial pure-core proof |

| AC-045 | Initial working typed visual editor and persistent project | real create/connect/Run=5, type/cycle rollback, canvas IR independence, actual mouse drag/undo/redo/zoom, project download/import-copy and original reload; `tests/studio.test.mjs`, `tests/browser/studio.test.mjs` | M2 finite editor slice |

| AC-046 | Studio creates, edits, reuses and persists nested composite graphs | actual nested expansion/edit/caller result, undo, signature/cycle/pin/deletion negatives, v1/v2 closure transport, fanout budget, independent compilation and browser reopen=12; `tests/studio-composites.test.mjs`, `tests/browser/studio.test.mjs` | M2 initial pure composites |

| AC-047 | Initial Studio text mode with shared semantics and bounded execution | supported canonical graph/text roundtrip, eager sequence/unused errors, typed source locations/provenance, atomic apply/undo, local invalid draft persistence, control execution with explicit unsupported conversion, actual browser Stop/deadline; `tests/studio-text.test.mjs`, `tests/browser/studio.test.mjs` | M2 initial integration; full AC-012 open |

| AC-048 | Real finite standard library and searchable typed Studio catalog | all36 value/logic/comparison/select/text/array operations through runtime/serialized IR/standalone with independent oracles; negative ports/format/index, copy/eager semantics, public IDL/binding and lock drift; actual Chromium all36 runtime and independent standalone plus UI graph/search/example/reopen; `tests/stdlib.test.mjs`, `tests/browser/stdlib.test.mjs` | M2 initial library; typed Map/Filter remain open |

| AC-049 | Typed static collection parameters normalize into shared control semantics | real Map/Filter atomic/generic/composite references, strict signature/effect/local-value rejection, hygiene/aliases/locations, order/signed zero/empty/throws, shared budget/depth/cancel and exact lock/version pins; actual Studio text/independent Chromium modules; `tests/collections.test.mjs`, `tests/browser/collections.test.mjs` | M2 source collections; visual authoring/persistence open |

`AC-001` is NOT official WCA Average of Five. Real WCA rules are a separate contract acceptance test.

## Proof storage

Record command outputs, test counts, environment and revision in `docs/qa/STATUS.md` (or release-specific evidence files). Do not mark AC-X PASS from static markdown or screenshot alone if it requires executable behavior.

| AC-050 | Visual typed collection binding authoring shares control semantics and strict project persistence | real typed atomic/composite callbacks, editing/undo/caller result, v3 signed authoring+pins+verified IR, malformed/cycle/effect/signature gates, lazy/sequence and shared budgets, fresh Node standalone and actual DOM creation/reopen/independent browser export after runtime shutdown; tests/studio-collections.test.mjs, tests/browser/studio-collections.test.mjs | M2 initial NumberArray library; full AC-012/MVP open |

| AC-051 | Semantic UI tree + DOM adapter drive real EMS event/state programs | typed bindings/signatures/permissions/hidden handler preflight, actual counter FIFO/rollback/control throw/budget/cancel, safe String/Boolean DOM controls/focus/labels, busy host and close/listener lifecycle; tests/ui.test.mjs, tests/browser/ui.test.mjs | M3 initial backend; full AC-014/UI authoring/standalone/MVP remain open |

| AC-052 | Typed UI transport and transactional authoring workspace preserve the actual program | signed Number/NumberArray vs String marker, validated call/control IR, transitive unused pins/version negatives/no host invocation, limits/malformed refs, atomic Undo/storage/quota/corrupt preservation; actual browser Apply/Undo/Redo/Save/download/file import/reopen; tests/ui-project.test.mjs, tests/browser/ui.test.mjs | M3 authoring transport; visual/source UI editor/standalone/full AC-014 open |

| AC-053 | Real UI/state/event authoring forms and reproducible EMS handler source | create counter from empty UI without IR edits, shared frontend/control functions/reactor, typed whole-candidate rollback/signature/source-IR negatives, source-owned v2 persistence/undo/restore, safe prototype metadata, widget binding/handler inspect, actual browser edit1→2/invalid preserve/undo/reopen; tests/ui-authoring.test.mjs, tests/browser/ui.test.mjs | M3 initial authoring; full control graph/worker/standalone/MVP open |

| AC-054 | Real persistent Worker preview preserves kernel event/state semantics and responsive editor | actual worker/local output/snapshot/trace FIFO/rollback/type/policy parity, exact IDs/protocol, queue bound, hard deadline/Stop/abort/late-reply termination, actual browser field responds while EMS loop pending and fresh worker recovers; tests/ui-worker.test.mjs, tests/browser/ui.test.mjs | M3 worker preview; full standalone/handler graph/MVP open |

| AC-055 | Independent stateful control handlers preserve finite kernel semantics | interpreter/compiler values, call order, signed zero, errors, step limits, async; policy/context/cancellation/spoof gates and fresh Node process without EMS imports; tests/state-compiler.test.mjs | M4 initial handler compiler; standalone reactor/UI open |

| AC-056 | Independent finite state session uses the same transaction scheduler as interpreted EMS | FIFO/commit/rollback/replay, detached state/arrays/traces/signed zero, grants/inputs/queue/cancel/close, unsupported bindings and fresh Node CLI output; actual Chromium session after EMS origin shutdown; tests/reactor-compiler.test.mjs, tests/browser/reactor-compiler.test.mjs | M4 finite session proof; whole UI/native/source locks open |

| AC-057 | Actual semantic UI exports as independent DOM application using common kernels/adapter | typed events/FIFO/state/view/trace/error/disabled/policy parity, invalid project/source/backend gates and retained output, signed values/own ports, fresh Node execution; actual Chromium controls/focus/labels/inert text/cleanup under nested static URL after EMS origin shutdown; tests/ui-compiler.test.mjs, tests/browser/ui-compiler.test.mjs | M4 finite UI package; IDE export integration/PWA/native/MVP open |

| AC-058 | IDE downloads actual edited UI application through the shared Web/Node builder | independent system tar exact extraction/determinism/UTF-8/bounds/path negatives and CLI parity; actual Chromium authoring preview=3/download/extract/independent execution after origin shutdown with initial=0, failure preserves source/preview and creates no archive; tests/ui-package.test.mjs, tests/browser/ui-compiler.test.mjs | M4 initial IDE package download; control canvas/unified manager/full MVP open |

| AC-059 | Source-owned control handler exposes checked typed graph and transactional node-fragment edits | typed regions/data/sequence/local-function edges and atomic interface boundaries, exact ranges/runtime+compiler edit outcome, stale/type/ID/collection/source negatives, storage/undo; actual Chromium graph selection/edit preview2/type rollback/undo1/save/reopen2; tests/control-graph.test.mjs, tests/browser/control-graph.test.mjs | M2/M3 initial source graph; free wiring/full AC-012/MVP open |

| AC-060 | Structured visual source-node operations use existing semantic validation | literal/signed zero/operator/call and real runtime+compiler outcomes, single-statement insertion/deletion/Undo, type/syntax injection/category/field/stale/missing-return negatives; actual Chromium forms call3/insert63/delete3/literal4/operator5/error rollback; tests/control-graph-ops.test.mjs, tests/browser/control-graph.test.mjs | M2/M3 structured source editing; free wiring/full AC-012/MVP open |

| AC-061 | Actual contract catalog and lexical value→typed call port connection | real signatures/policies/native handle metadata/no execution; parameter/local runtime+compiler/Undo; effectful producer executes once/direct-copy refusal; types/branch/function/port/stale negatives; actual Chromium catalog/port1/call3/local2 and definition-use edges; tests/control-graph-links.test.mjs, tests/browser/control-graph.test.mjs | M2/M3 initial port connection; arbitrary wires/full canvas/MVP open |

| AC-062 | Единый локальный каталог графовых/текстовых и source-owned UI проектов: create/open/copy/rename/import/export; typed codecs и draft сохранены; refresh восстанавливает source и реальное исполнение; invalid/corrupt/quota не перезаписывают bytes | `tests/project-manager.test.mjs`, `tests/browser/project-manager.test.mjs`, `tools/verify.mjs`; scope — `docs/spec/PROJECT_MANAGER.md` |

| AC-063 | Named owner MVP AVG5 and actual run diagnostics | `tests/studio-avg5.test.mjs`, `tests/runtime-observer.test.mjs`, `tests/browser/avg5.test.mjs`: unchanged arithmetic semantic IR, six-operation composite/reuse/nesting/body edit/reopen, exact runtime node/caller failure without semantic error mutation, actual Worker lifecycle log |
| AC-064 | Isolated authenticated development publication | `tests/ide-server.test.mjs`, `tools/deploy.mjs`, `tools/deploy-smoke.mjs`, `deploy/*`; **remote success requires actual SHA/TLS/auth/live browser/restart/rollback evidence in docs/qa/DEPLOYMENT.md, prepared files alone do not pass** |

| AC-065 | Actual call-graph debugger pauses the existing evaluator, steps and continues with payload-free exact nested locations | `tests/graph-debugger.test.mjs`, `tests/browser/graph-debugger.test.mjs`, `tools/verify.mjs`: pre-operation pause/dependency memoization, nested types/path detached, stale tokens, observer rejection/cancellation, actual Chromium Step/Continue/Stop/recovery/deadline and unsupported text/collection profile; full control/source/state debugger remains open |

| AC-066 | Actual control/text stepping keeps semantic IR independent of source coordinates | `tests/control-debugger.test.mjs`, `tests/browser/control-debugger.test.mjs`, `tools/verify.mjs`: snapshot structural operation→fresh AST ranges, unchanged IR under source comment shift/parse roundtrip, actual lazy branches/loops/nested calls/futures and compiled parity, payload-free events, invalid observers/protected cancellation/budgets/resource cleanup, queued tokens, Chromium exact source selection/Unicode/stale-source guard/Continue6/Stop/recovery; full UI/state/native/source debugger remains open |

| AC-067 | Real UI event debugger controls original FIFO transaction and confirmed state | `tests/ui-debugger.test.mjs`, `tests/browser/ui-debugger.test.mjs`: actual Worker/source witness/handler event ID+token, Step/Continue FIFO0→1→2, paused draft write not published/Stop retains confirmed1, direct signal cancellation rollback, stale commands/invalid hooks/grants/deadline, Chromium source selection/commit/Stop/restart; full debugger/native/platform scope remains open |

| AC-068 | Понятный путь проекта к запуску и единое оформление редакторов | `tests/browser/design.test.mjs`: подсказка пустого графа → пример → результат5, меню файла открывается реальной мышью, все три экрана без горизонтального переполнения при390px, код существующего UI-обработчика показан при открытии. Существующие проверки редакторов/отладки/экспорта обязательны; визуальная проверка Chromium1440px. Это не полноценная touch IDE или аудит WCAG. |

| AC-069 | Exact operation breakpoints keep the original runtime semantics | `tests/breakpoints.test.mjs`: leaf/composite addressing, graph+control cursor provenance, lazy dead branch/no phantom pause, repeated loop stops, concurrent queue, copied bounded policies/stale tokens, cancellation/permission preflight, independent compiled parity. `tests/browser/breakpoints.test.mjs`: graph run-to-point/live clear, text cursor three loop stops, source invalidation/input preservation. `tools/verify.mjs` and public live graph5/text-loop3. UI event breakpoint editing and full debugger remain open. |

| AC-070 | Activation-aware Over/Out follows original graph/control/UI execution | `tests/step-frames.test.mjs`: unique nested/recursive/async frame IDs, actual frame exit, mixed control→graph ancestry, same-frame subtree Over/ancestor Out, explicit breakpoint priority, stale token/missing metadata refusal, IR/compiled parity, resource cleanup/cancellation/budgets/error-preserving detached exit hook. `tests/browser/step-frames.test.mjs`: actual AVG5 Over completion, control Over→next statement/Out→caller or7, private UI state0→Over→Out commit1 and next-event draft write Stop retains1. Public live proof required for published artifact. Full debugger/native/compiled scope remains open. |

| AC-071 | Source-owned UI breakpoints preserve FIFO transactions and source identity | `tests/ui-breakpoints.test.mjs`: real Worker private write pause, queued event live clear, repeated point/event IDs/Out/Stop confirmed1, stale source/absent address/SOURCE_IR mismatch, stale ID/token/policy ignored, metadata budget/orphan/disabled-debug rejection before Worker. Chromium source+graph point, exact return source selection, repeated snapshot0→commit1→private1→live clear→2→3, idle edit retains3/unapplied source rejected/applied source invalidates (AC-072 adds checked safe reattachment). Verify actual host/private pause→commit1; published artifact requires public smoke. Full debugger remains open. |

| AC-072 | Checked source anchors survive safe edits and reject ambiguous/changed operations | `tests/source-anchors.test.mjs`: shifted control path actual pause/standalone parity, changed binding/condition/operation rejection, duplicates/deletion/Undo, regenerated call node IDs/dependency checks, branch/argument role isolation, detached bounded/corrupt sidecar. `tests/browser/source-anchors.test.mjs`: actual UI edit/reload/private0→commit1/changed point inactive/Undo and quota preserves original policy; Studio invalid draft→shifted source exact pause1→changed inactive result2. Verify137 includes a fresh shifted anchor/refusal. UI durable sidecar only; full Studio persistence and full debugger remain open. |

| AC-073 | Studio persists separate checked graph/text debugger contexts with project ownership | `tests/debugger-storage.test.mjs`: new storage instance→shifted actual pause, graph/text/entry/lowering isolation, binding version/library drift vs canvas/name/inputs, corrupt/owner/schema/duplicate/budget/quota preservation/no callback invocation, source/point mismatch/absent graph refusal, export/copy/import sidecar isolation. `tests/browser/debugger-storage.test.mjs`: actual reload/mode graph+text stops, failed paused clear retains policy/repeated stop/successful global clear, library edit inactive/Undo restore, real File import fresh owner despite existing orphan metadata/old records preserved. Verify138 adds checked restore; public artifact requires live authenticated reopen/pause proof. Full value/native/compiled debugger remains open. |

| AC-074 | Explicit typed control inspection observes actual scopes and preserves payload-free defaults | `tests/inspection.test.mjs`: default/no values, real pre-operation variable states/IR+standalone parity, detached array/ADT/signed zero, ungranted sentinel and protected-program barrier, effectful/local handle exclusion, byte/string/array budgets/no prefixes, recursive IDs/for/catch/match declared types, actual future/stream/opaque resource wrappers/cleanup, invalid grants before callback/ambiguous bindings, mutation/observer errors/mixed graph refusal, no accessor invocation/prototype-inherited option/grant rejection. Chromium core grant/protection and explicit Worker transport refusal/default pause without values; verify139 adds actual x1 snapshot/default absence. Core API only; UI panel/transport/native/compiled/value taint remain open. |

| AC-075 | По запросу владельца основной редактор показывает понятный путь пример → запуск → результат и раскрывает сложные инструменты отдельно | `tests/browser/design.test.mjs`: actual mouse onboarding/result5, repeated Code/Graph activation preserves view, debugger disclosed/pause/Stop, compact390px catalog disclosure/no overflow; existing studio/text/storage suites preserved. Published artifact requires live HTTPS actual mouse example5/stable views/mobile evidence. Inspection panel remains open; redesign does not complete full IDE/language. |

| AC-076 | Явное разрешение владельца связывает просмотр значений с checked EMS source и реальной паузой Worker | `tests/inspection-transport.test.mjs`: actual scopes/result/detachment/signed zero, stale/disabled/graph/call profile rejection, strict typed DTO/name/status/protection/provenance/frame/token/accessor/budget checks, mixed graph pauses, client forged/replay refusal before callbacks. Chromium: opt-in x1/default absence, protected refusal, source edit cancellation/revocation, Continue/Stop/reload clearing, inert String rendering/no snapshot storage. Verify140 и public live panel proof обязательны для публикации. Pure control interpreted adapter; effectful UI state, formal taint, compiled/native adapters остаются открытыми. |

| AC-077 | Ограниченная QA-диагностика Worker отличает загрузку модулей, native error, первое сообщение и завершение | Node `tests/worker-diagnostics.test.mjs`: URL/header/body/message redaction, bounded detached telemetry, native argument/error forwarding и late error после terminate; server trace opt-in. Chromium `tests/browser/worker-diagnostics.test.mjs`: реальные404/401/throw/reply/terminate и12 actual UI restarts→counter1/один текущий Worker. `tests/browser/ui.test.mjs` прикрепляет server trace к сбою. Диагностика не исправляет и не доказывает причину исходного intermittent Worker failure; Worker не приостанавливается и не перезапускается автоматически. |

| AC-078 | Разрешение просмотра связано с конкретным typed declaration в допустимых lexical scopes | `tests/inspection-declarations.test.mjs`: actual Number/String sibling branches/non-disclosure, parameter/loop/catch/pattern lifetime, old name policy compatibility, mixed/unknown/accessor/prototype grants rejection, v2 DTO identity/type/downgrade checks, Future/Stream protection/whole-value limits, aliased in-memory IR non-disclosure и runtime/standalone parity. Chromium: explicit then declaration inactive99/active7, no sibling sentinel, clear/protection/default behavior preserved. Verify141 и live HTTPS declaration proof обязательны для публикации. Полное shadowing grammar, taint и остальные profiles остаются отдельными работами. |

AC-077 дополнительная приёмка при AC-078: complete metadata-only private0600 failure artifact переживает reporter truncation/browser cleanup; actual12 deadline terminate→immediate healthy startup сохраняет confirmed0/recovered1 и один текущий Worker без retries/delay. Target interception отдельный opt-in; original intermittent native cause не объявляется исправленной.

| AC-079 | Graph/call-IR kernel поддерживает explicit bounded inspection без дополнительного вычисления | `tests/graph-inspection.test.mjs`: actual memo dependency, input/array detachment, uncomputed selected node не запускается, repeated composite frames/input isolation, protected-program/effects barrier, invalid domain/grant/observer before callbacks, byte/array limits, inherited context и accessor input без extra reads; runtime/standalone parity. Chromium actual call-IR value25/memo5/ungranted sentinel/default no payload. Extended declaration recursion/forAwait/using/cleanup fixtures. Verify142. Core API only: Studio graph transport/panel остаются unsupported до отдельного checked adapter. |

| AC-080 | Checked graph/call-IR transport и opt-in панель используют actual kernel без дополнительного исполнения | Node canonical project/library/selection witness, stale body/selection refusal и input/layout/name preservation; root/call path/frame/location/typed DTO/current-output/protected/forged/accessor guards и client replay refusal. Chromium visual pending/memo5/result25/clear/protection/edit revoke и exact text call input3/result25. Control v1/v2 и default no-values preserved. Verify143/live visual proof обязательны. Effectful/native/compiled/full taint/collections открыты. |

| AC-081 | Понятный запуск Studio: видимые входы, целый граф и отдельный результат | Реальная мышь: изменение Number 2→8 и запуск11, TYPE_MISMATCH сохраняет прежние данные, reopen8. String без JSON-кавычек, Boolean выбор, NumberArray проверяет элементы. «Весь граф» показывает все блоки при1440/390px, без горизонтального overflow. Existing editor/inspection/debugger + exact Node/verify/Chromium gates и live input8/result11 обязательны. |

| AC-082 | Постоперационная пауза даёт actual результат без повторного исполнения | Node runtime memo once-only, detached output, failure/no exit, cancellation, effects/protection/limits, default/v1 refusal и v2 closed witness/DTO/client checks. Nested/repeated frames/source, Over→completed composite и Out→caller exit; breakpoints только enter. Chromium visual last output5/Stop/recovery и call child2→3/5→6/result9/source/clear, control option disabled. Verify144 и public last-output5 proof обязательны. Full debugger/native/compiled/control post-operation/collections открыты. |

| AC-083 | Visual Map/Filter inspection использует actual shared control IR | Source/IR/compiler/project format unchanged; ephemeral original input/node→typed binding mapping, grants только mapped declarations. Actual Map callback-2/0/3→-4/0/6 with distinct frames, Filter Boolean predicate/signed-zero/order/duplicates и runtime/standalone parity; protected/source drift/generated helper/forged value/caller-chain отказ. Default allow[] передаёт0 values. Actual IDE readable aliases/map output/clear/default debug, verified145 и live example callback2→4/3→6/result[4,6]. Collection post-operation/native/compiled/full taint остаются отдельными профилями. |

| AC-084 | Control/collection post-operation snapshots follow actual common runtime scopes | Runtime optional onControlExit, successful expressions/statements only, no extra ticks/compute, initialized let/assignment/loop values; return/break/continue/try/for/forAwait cleanup and standalone parity. Cancel post-using closes once, failure/no exit, observer isolation, detached limits/protection. Explicit v2 survives client, v1 exit denial/current-let absent rejection. Chromium Over let0/loop2/result2, materialized Map[4,6] before return, sibling declaration labels/clear; verify146 + exact full gates/public control and collection exits. Native/compiled/UI-effect transports/full taint open. |

| AC-085 | UI operation exit remains precommit; client accepts only checked metadata | Original ReactorKernel forwards exit hooks, no new evaluator/commit order. Explicit afterOperations fixed per session, default enter-only. Local program/source/IR reconstruction validates handler/node/kind/type/location/frames/caller edges; no values/inspection/speculative snapshot. Tokens reject replay/overlap/disabled exits, stale source before Worker. Real worker queued events0→ACK1→next exit/Stop keeps1, actual local abort rollback and later failure rollback; source-free graph profile. Chromium banner pending vs acknowledged, verify147/full gates/public proof. Full effectful value/taint/native/compiled debugger scope open. |

| AC-086 | Pure nested helpers cannot bypass transitive entry effect inspection guard | Pre-fix host.secret→helper sentinel disclosure reproduced. Validated entry effects/capabilities/localEffects close all frames before getters; own-function/protected priority retained. Source DTO independently refuses scalar helper payload; named/addressed and enter/exit compatible. Capability-only/recursion, Resource/Stream/cleanup/once-only/ordinary outputs/runtime-standalone parity; unreachable effects leave pure entry capture and Future opaque exclusion intact. Chromium helper closed/result7/clear, verify148/full gates/public proof. Full dynamic taint/declassification/actor-UI/native/compiled capture not claimed. |

## AC-087 — Читаемая схема Studio

Русские типы и порты результата, пояснения базовых арифметических операций, различимые входы/операции/ответ, раскрываемая справка с порядком соединения портов; справка открывается и закрывается реальной мышью, затем Graph/Code/debug продолжают работать. Существующие вход8→ответ11, fit и viewport390px без горизонтального переполнения сохраняются. `tests/browser/design.test.mjs`, `tools/deploy-smoke.mjs`; полные gate и public HTTPS обязательны. Это улучшение IDE, не новый языковой milestone.

## AC-088 — Статическое происхождение control IR

Validated IR2→non-executing versioned sidecar и CLI `module-origins`; inputs/literals(no payload)/assignment/control/recursive calls/container/pattern/await/catch/resource alias/stream dependencies. Nested early exit controls retained, shared-state/opaque/exception uncertainty explicit, declaration occurrences distinct, deterministic output. Origin overflow absorbing and seed-safe; nodes/edges/steps/bytes refusal; malformed IR/options refused. `tests/control-origins.test.mjs` и executable verification. Existing debugger barrier and execution remain unchanged. Full static/dynamic confidentiality policy is not accepted by this gate.

## AC-089 — Классификация источников и дополнительный запрет диагностики

Closed host input/literal annotations, real checked root validation, public<private<unknown join, unclassified/foreign/unknown refusal, no literal/runtime payloads in reports. Private/unknown runtime mask before scope/cell reads; existing allow/effects/protected/type/budgets unchanged. Fresh source client refuses forged private payload/status downgrade; real Worker shows public13, masks secret/hidden and returns13 without leakage. Graph/collection mapping explicitly unsupported. API/CLI + negative schema/roots/getters/control/calls/assignment/barrier tests; full gate/public proof mandatory. Dynamic taint/declassification/noninterference/actor/native/compiled policy not accepted by this gate.

## AC-090 — Semantic binding сохранённых root labels

V2 closed SHA-256 domain/canonical IR binding, actual source roots, literal/signed-zero/input order changes rejected; canonical object/function ordering accepted. No literal payloads in policy; no weak hash fallback or implicit v2 rebind/downgrade. Runtime rejects before callbacks, detached IR stable during await; source preparation pins request, real client and Worker independently verify. CLI bind/classify, Node/browser digest parity, stale source causes0 started jobs. Existing barriers/grants and normal result13 remain. Trusted host annotation authenticity, foreign bytes/package locks, persisted IDE authoring/native/compiled/visual/taint remain separate. Full gate/public proof required.

## AC-091 — IDE root-label authoring и отдельное storage

Actual root catalog without values, explicit public/private/unknown selection/apply, checked bound client/Worker, public shown13/private mask/result13/Continue clear. Project-owned bounded sidecar stores bound policy only; stale source review defaults unknown, reopen restores no grants/values/enabled flag, real mouse apply accessible. Source/label changes during hash refuse stale save. Storage owner/extra fields/v1 rejection; nonenumerable own binding data fields copy correctly. Existing diagnostics and graph/code flows preserved; metadata storage guarantee does not extend to pre-existing saved JSON input draft. Full gate/public proof required.

## AC-092 — Visual source roots и shared-IR bound diagnostics

Original inputs/operand-return literals→actual semantic roots, arrays/signed-zero/empty array, nested composite identity; derived output and ambiguous/missing source refusal. Demand/memo/sequence matches original runtime, independent compiler same8. Async actual graph client/Worker reconstruct and validate v2; UI public inputs/private+opaque outputs masked/result5/clear, original operation breakpoint projected to control declaration. Canvas/input changes keep binding; literal edit stale; source/text/collection previous workflows preserved. Full gate/public proof required; pure/frontend limits and opacity retained.

## AC-093 — Verified intrinsic propagation и mutable opaque refusal

Existing coreIntrinsic certificate exact callback/emitter/signature/version/flags, no interface facade; public/private/unknown operand joins preserved. Name/emitter replacement refused. Execution-local registry prevents callback substitution; opaque array mutation initially leaks sentinel then fixed before capture. Node/browser aggregate arithmetic and graph sum5 visible with grants/private input closed; old barriers unchanged. Full gate/public required; trusted host realm/no sandbox/noninterference claim.

## AC-094 — Structured module standalone atomic package

Pure synchronous finite public ABI, exact package/contract identity, manifest+module without graph/IR; recursion/loop/error/-0/type vectors equivalent. Trusted hash-checked import into new graph, consumer compile/reseal, ABI drift/refusal and proto-like input names. CLI fresh process outside workspace; actual IDE TAR/module Browser after EMS origin shutdown, no EMS requests. Async/local effects/nonprimitive/unknown target/host plugins refused before files/execute. Full gate/public proof required; production/rich ABI/isolation/signatures/source maps remain open.

## AC-095 — Sealed typed error ABI

V2 conservative canonical user-type set, dependency union/reseal, immutable module description and SHA binding; altered errors/signature/package ID and schema downgrade rejected. Runtime/compiler caller catches String/Number/-0/Option tags; terminal STEP_LIMIT bypasses user catches. Actual standalone browser consumer7/3 without EMS paths. Legacy v1 explicit load supported but v2 re-seal cannot erase missing ABI. Full gate/public proof; future shared budgets/async/native/rich returns remain open.

## AC-100 — единый граф и рабочее пространство конструктора

Критерии и границы: [WORKBENCH_REVISION.md](../plans/WORKBENCH_REVISION.md).
Проверки: `tests/browser/workbench-interactions.test.mjs`, `tests/flowchart.test.mjs`,
`tests/ui-designer.test.mjs`, полный набор тестов и публикационный gate.

## AC-101 — мобильный Studio, PWA и публичный доступ

Критерии: [MOBILE_PWA.md](../plans/MOBILE_PWA.md). Исполнимые проверки: `tests/pwa.test.mjs`, `tests/browser/mobile-pwa.test.mjs`, регрессия дизайна, полный gate и анонимный public smoke.

## AC-102 — контрактная нотация @ и :: через общий IR

`tests/native-contracts.test.mjs`, `tests/browser/native-contracts.test.mjs`: located AST, exact canonical IR parity, runtime/standalone30, fresh process60, visual roundtrip, main graph edit/reopen4, type/unknown/duplicate/syntax failures. Спецификация: [NATIVE_CONTRACT_SYNTAX.md](../spec/NATIVE_CONTRACT_SYNTAX.md). Полное ядро EMS-038 остаётся открытым.

## AC-103 — коннекторы, общая библиотека, жесты и представление управления

Критерии: [CONTROL_WORKBENCH.md](../plans/CONTROL_WORKBENCH.md). Исполнимые проверки: `tests/structured-view.test.mjs`, `tests/browser/loops-and-ports.test.mjs`, mobile/native/workbench regression и полный publication gate.
