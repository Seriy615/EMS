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
