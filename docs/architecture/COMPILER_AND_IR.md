# Compiler, IR and target portability

## Frontend

Text parser and visual editor both produce canonical AST/HIR. Semantic names, function scopes, typed values, control flow, events and effect annotations must agree. Visual node position, color and spacing cannot change program meaning.

## IR proposal (NOT frozen)

- SSA/value edges for pure data computation.
- Explicit control/event/state edges for non-pure operations.
- Effects and capabilities as first-class requirements.
- Typed multi-output operations and structured errors.
- Lifetimes, resource handles and ownership annotations for FFI.
- Placement boundaries and transport contracts for distributed apps.
- Provenance/source-map links back to text and visual nodes.
- Versioned serialization; migration rules.

## Code generation

Backend selects implementation per target, calling convention and permissions. JS backend may inline pure math nodes; WASM backend requires host imports; native backend needs platform SDK and linker. A successful build of a standalone artifact must be accompanied by runtime evidence for that target.

## Binding choice

Algorithm: expand dependency DAG → unify required capabilities and permission constraints → enumerate compatible implementations → apply version lock and quality policy → reject unsupported environments → link selected modules → test. The quality/performance preference cannot override security and compatibility constraints.

## Composite -> atomic

Compiler can turn a composite EMS graph into code + ABI manifest. The exported package omits the source graph. The IDE then uses it as atomic. **This is structural opacity, not cryptographic secrecy or DRM.**

## M0 compiler (implemented)

`compileStandaloneJS` handles the tiny pure subset including nested composite inlining. For all capability/effect operations it MUST fail rather than silently erase side effects. Generated `.mjs` has no EMS import. Full optimizing compiler/IR is future work.

## Conformance

Differential tests: same inputs through reference evaluator and target artifact, compare results/errors (within declared numeric semantics). For event/stateful contracts additionally replay traces and verify ordering, cancellation and effects. Source maps must associate runtime errors with originating graph nodes.

## Проверенное начальное ядро M1

`docs/spec/LANGUAGE_SEMANTICS.md` фиксирует профиль `ems-core-finite/1`. `src/ir/index.mjs` реализует начальный typed call-IR `ems-ir/1` с точными версиями непосредственно вызываемых контрактов, канонической сериализацией, проверкой типов/ссылок и JSON Pointer provenance отдельно от семантики. См. `docs/spec/IR.md` и AC-025/026. SSA control-flow, state, async, ownership и production backend остаются будущими расширениями; исходное предложение IR выше не объявляется реализованным целиком.
