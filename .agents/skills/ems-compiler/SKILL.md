---
name: ems-compiler
description: Work on EMS IR, semantics, compiler targets, standalone output and composite-to-atomic sealing.
---
# EMS compiler procedure
1. Read `docs/architecture/COMPILER_AND_IR.md` and `docs/spec/EMS_FULL_SPEC.md` sections 4, 5, 9.
2. Maintain separation of graph data, HIR/IR and canvas metadata.
3. For every optimization, verify semantic equivalence and effect preservation.
4. Reject unsupported targets rather than synthesize fake bindings.
5. When sealing composite to atom, ship manifest+module, not internal graph; do not promise binary secrecy.
6. Run evaluator/compiled differential fixtures and negative cases.
