# Backlog для Codex

Требования: только **GPT-6.1 Sol или GPT-6 Luna** для агентной работы. Sol 5.6 и Astra запрещены.

Подробная машинная версия: `tasks/backlog.json`. **DONE** у M0 обозначает готовность к проверке, не production.

| Task | Milestone | Priority | Dependencies | Status | Deliverable |
|---|---|---|---|---|---|
| EMS-001 | M0 | P0 | — | DONE | Reference typed graph validator and evaluator |
| EMS-002 | M0 | P0 | EMS-001 | DONE | Reference textual EMS subset |
| EMS-003 | M0 | P0 | EMS-001 | DONE | Pure standalone JS backend |
| EMS-004 | M0 | P0 | EMS-003 | DONE | Composite-to-atomic packaging |
| EMS-005 | M0 | P0 | EMS-001 | DONE | Trusted ESM functions -> atoms |
| EMS-006 | M0 | P0 | EMS-001, EMS-005 | DONE | Reference QA and Codex bootstrap |
| EMS-010 | M1 | P0 | EMS-006 | DONE | Normative language semantic draft |
| EMS-011 | M1 | P0 | EMS-010 | DONE | Typed HIR and canonical IR schema |
| EMS-012 | M1 | P0 | EMS-010 | DONE | Full textual grammar and parser |
| EMS-013 | M1 | P0 | EMS-011, EMS-012 | DONE | Type checker and generics |
| EMS-014 | M1 | P0 | EMS-011 | IN_PROGRESS | Explicit effect/capability system |
| EMS-015 | M1 | P0 | EMS-011, EMS-013 | TODO | Control-flow async and state semantics |
| EMS-016 | M1 | P0 | EMS-013 | TODO | Contract IDL + compatibility rules |
| EMS-017 | M1 | P0 | EMS-015, EMS-016 | TODO | Differential conformance harness |
| EMS-030 | M2 | P1 | EMS-011, EMS-016 | TODO | Visual node editor |
| EMS-031 | M2 | P0 | EMS-030 | TODO | Nested composite expand/collapse |
| EMS-032 | M2 | P0 | EMS-012, EMS-030 | TODO | Text & visual unified source maps |
| EMS-033 | M2 | P1 | EMS-031, EMS-015 | TODO | Debugger and contract inspector |
| EMS-050 | M3 | P0 | EMS-015, EMS-030 | TODO | Browser DOM/UI backend |
| EMS-051 | M3 | P0 | EMS-050 | TODO | Reactive state & lifecycle |
| EMS-060 | M4 | P0 | EMS-011, EMS-017 | TODO | Production IR lowering & JS backend |
| EMS-061 | M4 | P0 | EMS-050, EMS-060 | TODO | Web app packaging & PWA export |
| EMS-062 | M4 | P0 | EMS-016, EMS-060 | TODO | Composite sealing to module bundle |
| EMS-120 | M5 | P0 | EMS-016, EMS-062 | TODO | FFI package and binding manifest |
| EMS-121 | M5 | P0 | EMS-120 | TODO | Foreign type mapping & ownership |
| EMS-122 | M5 | P0 | EMS-121 | TODO | WASM component and C ABI loader |
| EMS-123 | M5 | P0 | EMS-122 | TODO | Import package auto-block generator |
| EMS-124 | M5 | P0 | EMS-122 | TODO | Audited crypto library demonstration |
| EMS-125 | M5 | P0 | EMS-122, EMS-014 | TODO | Plugin isolation & safe host |
| EMS-140 | M6 | P0 | EMS-061, EMS-122 | TODO | Second OS/backend proof |
| EMS-141 | M6 | P1 | EMS-051, EMS-140 | TODO | Universal UI native implementation |
| EMS-142 | M6 | P0 | EMS-140 | TODO | Platform capabilities and binding discovery |
| EMS-160 | M7 | P0 | EMS-015, EMS-051, EMS-142 | TODO | Distributed graph execution |
| EMS-161 | M7 | P1 | EMS-160 | TODO | Offline mode and reconciliation |
| EMS-162 | M7 | P0 | EMS-160, EMS-061 | TODO | Musical Bingo E2E demo |
| EMS-180 | M8 | P0 | EMS-125, EMS-142 | TODO | Device adapters and SDK |
| EMS-181 | M8 | P1 | EMS-180, EMS-051 | TODO | Realtime media/render adapters |
| EMS-182 | M8 | P0 | EMS-180, EMS-160 | TODO | Speedcubing competition demo |
| EMS-200 | M9 | P0 | EMS-016, EMS-030, EMS-017 | TODO | AI contract discovery and graph plan |
| EMS-201 | M9 | P0 | EMS-200, EMS-125 | TODO | AI test generation and safe changes |
| EMS-220 | M10 | P0 | EMS-120, EMS-125 | TODO | Package registry and signature verification |
| EMS-221 | M10 | P1 | EMS-220, EMS-062 | TODO | Commercial license variants |
| EMS-222 | M10 | P0 | EMS-201, EMS-220 | TODO | Enterprise review and hardening |
| EMS-240 | M11+ | P2 | EMS-140, EMS-222 | TODO | Extended targets and SDKs |

## Порядок продолжения

EMS-010 проверена на AC-025. EMS-011 проверена на AC-026. EMS-012/013 проверены по AC-027/028. Сейчас EMS-014 (effects/capabilities), затем EMS-015 (control/state/async), после проверенного ядра — WEB IDE MVP и разрешённый деплой. Не начинать Android/iOS компилятор без IR и совместимых тестов.

Каждый task закрывается только с test evidence и обновлением `docs/qa/STATUS.md`.
