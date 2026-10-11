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

M0 baseline passes. The core has normative semantics, typed versioned IR, a located AST parser and type checker. Pure SSA functions and inferred generic helpers execute through the shared IR/runtime and export to standalone JS; structured control-flow/loops/recursion now execute and export, typed user exceptions/finally and Option/Result with exhaustive pattern matching execute through the same control IR. Typed async/Future tasks and await now execute through the same IR and export to independent async JS; Typed Stream snapshots/bounded FIFO channels and for-await loops now execute and export; ResourceHandle/using lifecycle now executes and exports owned cells, with bounded native cleanup and explicit trusted bindings; see [`CONTROL_RESOURCES.md`](docs/spec/CONTROL_RESOURCES.md). Separate public contract interface/binding IDL now checks exact versions, targets, typed signatures and policy before execution; finite atomic adapters and inspectable composite boundaries preserve executable pre/postconditions and declared errors in runtime and standalone; direct composite graph/IR includes a mandatory interface reference and rejects missing bindings (see [`CONTRACT_IDL.md`](docs/spec/CONTRACT_IDL.md)). Public native resource IDL now declares per-phase conditions/errors and preserves runtime ownership during failed/late acquisition (see [`RESOURCE_IDL.md`](docs/spec/RESOURCE_IDL.md)); native standalone export remains unsupported. Finite event sessions now add transactional typed state, FIFO replay and cancellation; Verified program dependency locks now pin semantic IR, typed contract closure and explicitly trusted SDK source bytes before runtime/export (see [`PROGRAM_LOCK.md`](docs/spec/PROGRAM_LOCK.md), runnable [`pinned-lock.mjs`](examples/pinned-lock.mjs)); this is integrity checking, not a sandbox or runtime binary attestation. The common conformance gate now compares 54 core/language/interface fixtures across runtime, serialized IR and fresh standalone processes (`npm run conformance`; see [`CONFORMANCE.md`](docs/qa/CONFORMANCE.md)). The actual browser gate now passes 57 fixtures across Node and Chromium runtime/standalone, including browser lock verification and an independent static application (`npm run browser:verify`, [`BROWSER_P1.md`](docs/qa/BROWSER_P1.md)). Pure-core P1 is proven; the first working Studio editor now supports typed graph editing, Run, undo/redo and local project save/open/import/export (`npm run studio`; see [`STUDIO_PROJECT.md`](docs/spec/STUDIO_PROJECT.md)). Composite authoring, nested expand/edit/reuse, v2 dependency persistence and standalone JS export now work (see [`STUDIO_COMPOSITES.md`](docs/spec/STUDIO_COMPOSITES.md)). Initial text mode now uses the same frontend/IR/runtime, preserves eager versus dataflow semantics, supports source diagnostics and cancellable worker execution (see [`STUDIO_TEXT.md`](docs/spec/STUDIO_TEXT.md)); full control visual mapping remains open. The standard library now adds 36 working typed value/logic/comparison/select/text/array operations, categorized search and independent public IDL/catalog (see [`STANDARD_LIBRARY.md`](docs/spec/STANDARD_LIBRARY.md)); Typed static Map/Filter now work in text through the same control IR and budgets (see [`COLLECTION_TEMPLATES.md`](docs/spec/COLLECTION_TEMPLATES.md)); visual authoring/persistence remain open. Interactive UI and higher-order library support are next parts of the owner-approved Web IDE MVP; follow [`docs/qa/PROGRESS.md`](docs/qa/PROGRESS.md) and [`docs/plans/ROADMAP.md`](docs/plans/ROADMAP.md). The complete language and IDE remain under development.

## Constraints and caveats

- No single ABI or API maps perfectly to every OS; capabilities, permissions and platform features must be explicit.
- Not all program properties can be statically verified. Type safety is not equivalent to correctness of business logic.
- Native/closed binaries cannot be guaranteed secret from decompilation.
- Generic automatic import of arbitrary C++, Rust, Python or crypto binaries is **not** implemented; requires language-specific adapters, audit and platform bindings.
- The M0 JavaScript registry executes trusted host functions with full host permissions. **Never run unknown imported modules as plugins.**

See `docs/spec/EMS_FULL_SPEC.md` for the long-term vision and exact boundaries.

Initial semantic UI/DOM backend: run `npm run studio` and open `/web/ui-demo.html`. Its buttons execute the EMS counter handler through the existing transactional reactor; UI/state permissions are explicit. Typed text/checkbox events, reactive properties and lifecycle are documented in [UI_TREE.md](docs/spec/UI_TREE.md). Typed signed-value UI project transport and local Save/Open/import/export/Undo are implemented (see [UI_PROJECT.md](docs/spec/UI_PROJECT.md)). Initial UI/state/event forms, widget selection and persisted EMS handler editing are implemented (see [UI_AUTHORING.md](docs/spec/UI_AUTHORING.md)). Handler graph editing, unified project management and standalone state/UI export remain in progress; this backend demo does not complete the WEB IDE MVP.

UI preview handlers now run in a persistent Worker with the same reactor semantics, bounded pending requests, deadlines and Stop. The editor keeps the last confirmed snapshot on termination and starts a new session from saved initial values; see [UI_WORKER.md](docs/spec/UI_WORKER.md). This is CPU isolation for the reference preview, not a production plugin sandbox.
