# EMS — universal contract-oriented programming platform

> **EMS = language, contracts, compiler, runtime, UI, system API adapters, plugin ecosystem and AI-assisted programming.** Not merely an event builder or a website constructor.

**Project type:** Codex-ready development repository and architectural specification.  
**Current implementation:** **M0 reference proof of concept only**, not a production compiler, complete IDE, FFI runtime, secure sandbox or true multi-platform toolchain.  
**Owner's mandatory agent policy:** ONLY **GPT-6.1 Sol / GPT-6 Luna**. **Do not use GPT-5.6 Sol or Astra.** See [`AGENTS.md`](AGENTS.md).

## Get started (Node.js 22+, no npm install required)

```bash
npm test
npm run verify
npm run demo
npm run text:demo
npm run build:demo
npm run seal:demo
npm run studio
```

Open `http://127.0.0.1:8787` after `npm run studio` to inspect and execute the example graph. Reference CLI:

```bash
node tools/ems.mjs validate examples/avg5.graph.json
node tools/ems.mjs run examples/avg5.graph.json '{"times":[12.4,11.85,13.2,12.1,14]}'
node tools/ems.mjs text-run examples/avg5.ems '{"times":[12.4,11.85,13.2,12.1,14]}'
node tools/ems.mjs seal examples/avg5.graph.json --out dist/avg5-atomic
```

The avg5 arithmetic demo computes `(sum - min - max)/3 = 12.566666…`, **not** an official WCA Ao5 implementation. The current textual syntax is a tiny draft and does **not** yet constitute the full EMS language. Generated standalone JS is a pure-operation target proof of concept; native/mobile compilers remain planned work.

## Read in order

1. [`AGENTS.md`](AGENTS.md) — mandatory rules and model selection.
   [`PROJECT_GOAL.md`](PROJECT_GOAL.md) — persistent project goal and measurable completion gates.
2. [`docs/spec/EMS_FULL_SPEC.md`](docs/spec/EMS_FULL_SPEC.md) — product and architectural specification.
3. [`docs/spec/REQUIREMENTS.md`](docs/spec/REQUIREMENTS.md) — tracked requirements.
4. [`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md) — modules and boundaries.
5. [`docs/plans/ROADMAP.md`](docs/plans/ROADMAP.md) — milestones with acceptance gates.
6. [`docs/plans/CODEX_EXECUTION.md`](docs/plans/CODEX_EXECUTION.md) — detailed Codex execution method.
7. [`tasks/backlog.json`](tasks/backlog.json) — machine-readable work items.
8. [`docs/qa/ACCEPTANCE.md`](docs/qa/ACCEPTANCE.md) — verifiable acceptance criteria.

## Core model

```text
Intent / Textual EMS / Visual EMS / Imported library
                     |
        Canonical typed program + contracts
                     |
          Semantic verification -> EMS IR
                     |
         +-----------+------------+
         |                        |
    EMS Runtime            Compiler + Linker
         |                        |
 Platform bindings       Standalone artifacts
         |                        |
    System APIs          Web / Native / Server
```

**Atomic contract:** public interface, implementation is an opaque or external boundary for visual decomposition (including imported API function, compiled program, library). Not synonymous with confidential or commercially closed.  
**Composite contract:** public interface with an inspectable EMS graph; can be nested and compiled into an atomic distributable artifact.  
**Library import:** each exported/selected callable may become a typed atomic block; an imported library becomes a package of such blocks.  
**Text + visual:** two authoring interfaces for a single language semantics.

## Repository structure

```text
AGENTS.md                   Codex rules + mandatory model policy
.agents/skills/             Five project-specific development skills
src/reference/              Executable M0 interpreter, compiler and binding demo
src/ir/                     Typed versioned core IR, validation and serialization
src/frontend/               EMS lexer/parser and located AST (new syntax execution pending)
schemas/                    Graph and contract JSON schemas (draft)
examples/                   Textual/graph demos + design manifests
web/                        Minimal browser graph explorer, NOT full editor
tools/                      CLI, local server and QA scripts
tests/                      Node built-in test runner
specs/docs in docs/spec/    Complete scope and requirements
architecture/               Decisions and API design boundaries
plans/                      Roadmap, task execution protocol, demos
qa/                         Acceptance & status evidence
tasks/backlog.json          Dependency-ordered task backlog
```

## Immediate engineering goal

M0 baseline passes. The core has normative semantics, typed versioned IR, a located AST parser and type checker. Pure SSA functions and inferred generic helpers execute through the shared IR/runtime and export to standalone JS; structured control-flow/loops/recursion now execute and export, typed user exceptions/finally and Option/Result with exhaustive pattern matching execute through the same control IR. Typed async/Future tasks and await now execute through the same IR and export to independent async JS; Stream and resource lifecycle execution remain pending. Finite event sessions now add transactional typed state, FIFO replay and cancellation; continue M1 with Stream and resource lifecycle, then the owner-approved Web IDE MVP; follow [`docs/qa/PROGRESS.md`](docs/qa/PROGRESS.md) and [`docs/plans/ROADMAP.md`](docs/plans/ROADMAP.md). The complete language and IDE remain under development.

## Constraints and caveats

- No single ABI or API maps perfectly to every OS; capabilities, permissions and platform features must be explicit.
- Not all program properties can be statically verified. Type safety is not equivalent to correctness of business logic.
- Native/closed binaries cannot be guaranteed secret from decompilation.
- Generic automatic import of arbitrary C++, Rust, Python or crypto binaries is **not** implemented; requires language-specific adapters, audit and platform bindings.
- The M0 JavaScript registry executes trusted host functions with full host permissions. **Never run unknown imported modules as plugins.**

See `docs/spec/EMS_FULL_SPEC.md` for the long-term vision and exact boundaries.
