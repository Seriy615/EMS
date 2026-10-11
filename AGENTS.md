# Codex operating contract — EMS

Read this file before modifying the repository. Language of specs and reports: Russian. Code, identifiers and public API docs: English.

## Non-negotiable model policy (owner instruction)

- **Permitted agent models: GPT-6.1 Sol and GPT-6 Luna ONLY.** This applies to main agents, delegates, background agents and sub-agents.
- **DO NOT invoke GPT-5.6 Sol or any Astra model.** Do not silently fall back to either model or start a subordinate agent with another model.
- If the current Codex environment cannot explicitly guarantee Sol 6.1/Luna 6 selection, **do not spawn agents**; proceed in the current execution environment only where permitted, or request model configuration from the owner.
- These are owner-provided product labels; confirm the environment's actual model IDs before attempting model-specific configuration. Do not fabricate an API model slug.
- Prefer no subagents for small changes. When delegating, explicitly set an approved model, scope, acceptance criteria and budget; never dispatch automatically under an unknown default.

## Mission

Build EMS, a language + contract framework + visual and textual programming ecosystem. The user-visible end goal is one application graph built once, portable across supported execution targets via platform bindings, runnable in EMS or exported as a standalone program. **Contracts are stable boundaries, not a substitute for implementation or tests.**

## First entrypoint

1. Read `PROJECT_GOAL.md`, `README.md`, `docs/spec/EMS_FULL_SPEC.md`, `docs/spec/REQUIREMENTS.md`, `docs/qa/PROGRESS.md` and the current milestone in `docs/plans/ROADMAP.md`.
2. Run `npm test` and `npm run verify`. Record baseline results.
3. Read `docs/plans/CODEX_EXECUTION.md` and choose the next task from `tasks/backlog.json` whose dependencies are complete.
4. Implement one coherent vertical slice with tests, examples and docs. Do not claim another milestone is finished without its acceptance evidence.
5. Update `docs/qa/STATUS.md` and matching backlog task status after tests.

## Architectural invariants

- Keep **contract interface, implementation, package, license, visibility and capability policy** distinct.
- **Atomic = no decomposable EMS graph in the consuming editor**; it may be complex, compiled or foreign. **Composite = expands to an inspectable EMS subgraph.** Atomic does not imply secret, proprietary or secure from reverse engineering.
- Text and visual EMS must share the same semantic IR; do not ship two independent programming languages.
- `EMS IR` is a versioned semantic artifact, separate from canvas node positions.
- External libraries become **sets of typed atomic contracts** through explicit adapter/FFI/binding; do not claim arbitrary binaries auto-port across OSes.
- Platform APIs are behind capability-checked contract implementations; preserve platform-specific semantics and failure modes.
- Pure graph semantics must match interpreted and compiled outputs; keep test vectors as conformance fixtures.
- Importing a third-party library must never execute untrusted code in the build host by default. The current reference binding supports **trusted local ESM only**; it is not a sandbox.
- Crypto: integrate verified libraries, require standard test vectors; do not invent primitives, leak key material or silently downgrade algorithms.
- AI generates a candidate program; platform validates typed graph, permissions, effects, and actual behavior. **AI correctness is never assumed.**
- Native/DOM UI equality is semantic where defined, not identical layout, pixels, system entitlements or capabilities.
- Exported code should run without EMS IDE or centrally hosted EMS service when its declared dependencies permit it.
- Check every new runtime or compiler feature against `docs/qa/ACCEPTANCE.md`.

## Development rules

- Owner-designated Git repository: `git@github.com:Seriy615/EMS.git`. Commit validated changes and push to this repository; preserve existing history and never commit credentials.
- The included Node.js M0 implementation is a **reference semantics prototype**, not final production architecture or an arbitrary-code sandbox. Keep that boundary explicit.
- Never commit API keys, credentials or private keys.
- No network dependency, payment acceptance, device permissions or production deployment without explicit owner consent.
- Add tests for new behavior, negative tests for prohibited behavior, and document any assumptions.
- Avoid drive-by rewrites of working components. Prefer smallest testable vertical slice.
- No dummy production successes, fake claims of mobile compiler support or invented FFI ABI.
- Preserve `examples/avg5.*` as **arithmetic demonstration, NOT the WCA-official average** (DNF/penalties separately).
- Do not make costly multi-hour agent runs or autonomously trigger payments/deployments without owner approval.

## Project-local skills

Use relevant local procedural skills in `.agents/skills/` (`ems-contracts`, `ems-compiler`, `ems-ffi`, `ems-security`, `ems-tests`) after reading their `SKILL.md`. They are authored for this repository; no external downloads are required for starting M0.

## Per-task report template

```
Task: EMS-...  |  Model: GPT-6.1 Sol or GPT-6 Luna (only if actually selected)
Changed: ...
Tests: commands + pass/fail counts
Acceptance evidence: ...
Risks/limits: ...
Next unblocked task: ...
```
