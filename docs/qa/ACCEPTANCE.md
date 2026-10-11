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
