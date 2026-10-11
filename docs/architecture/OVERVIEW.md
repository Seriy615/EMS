# Архитектура EMS: контуры и границы

```text
        Human / AI user                     Engineering user
               |                                  |
         NL Intent                            Text EMS
               |                                  |
       AI agent planner        Graphical IDE       |
               +-----------------+----------------+
                                 |
                           AST / HIR
                                 |
                  Contract catalog + type/effect rules
                                 |
                 Validation & capability resolution
                                 |
                     Canonical EMS IR vN
                                 |
        +------------------------+-----------------------+
        |                                                |
   Runtime interpreter/compiler                    Toolchain backends
        |                                                |
  capability broker and state                     optimizer / linker
        |                                                |
  Platform implementation registry            independent build artifact
        |                                                |
  OS APIs / device / network                    Web/native/server/WASM
```

## Source & semantic boundaries

- `Contract IDL`: logical operations and explicit pre/post/effect semantics; independent of implementation.
- `Atomic`: opaque EMS execution leaf (not necessarily private), adapter/native/binary/compiled IR.
- `Composite`: inspectable EMS graph with public contract interface.
- `Representation`: visual canvas, textual source and machine IR are distinct artifacts with common semantics.
- `Binding`: implementation chosen for a target and capability environment, version-locked.
- `Package`: distribution envelope, not identical to a contract; may contain many contracts/implementations.

## Execution phases

**Compilation time:** syntax, names, types, effects, constraints, resources where statically known, target capabilities, license compatibility, dependency pinning, binding selection, verification, artifact.

**Runtime:** actual OS entitlement checks, device availability, side-effect authorization, retries, resource ownership, exceptions, tracing, secret policy, backpressure and cancellation.

## M0 implementation boundary

`src/reference` is an ES module-based evaluator of acyclic pure number graphs and trusted atoms. It is intentionally not the full EMS interpreter. Production implementation will likely change representation substantially after milestone ADRs. Do not retrofit every long-term feature directly into reference modules.

## Module ownership candidates (future)

```text
compiler/frontend/      parser, AST, name binding
compiler/typecheck/     types, constraints, effects
compiler/ir/            canonical graph IR
compiler/optimizer/     safe transformations
compiler/backends/      JS/WASM/native
runtime/core/           evaluator/scheduler/state
runtime/security/       capability broker, isolation
platform/web/           DOM, browser storage, media
platform/native/        OS API bindings
platform/server/        server storage, networking
ffi/                    binding generators and ABI adapters
packages/               registry, lock, signature, supply chain
studio/                 visual/text IDE, debugger
agents/                 AI planning layer, gated by model policy
```

Use these as intended module boundaries, not mandatory immediate directories.
