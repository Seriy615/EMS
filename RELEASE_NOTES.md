# EMS Codex package — first handoff

This is a **project repository + exhaustive product spec + executable reference M0 prototype**, NOT a fully implemented universal language. 44 dependency-ordered Codex tasks cover M0 to M11+.

## Demonstrated locally

- Graph arithmetic Avg5: `12.566666...` example.
- Tiny textual EMS contract parsed and interpreted.
- Typed connections and runtime input errors.
- Nested composite graph execution.
- Pure standalone JS compilation, including nested composite inlining.
- Composite sealed to atomic module with manifest; source graph not distributed.
- Sealed module used as an atom in a larger graph.
- Explicit import of a trusted ESM math library into 3 atomic contracts.
- Local readonly SVG graph explorer and execute button.
- `npm test`: 16 tests passed in packaging environment.
- `npm run verify`: 18 checks passed in packaging environment.

## Deliberately NOT implemented yet

Full textual language, full visual editor, formal IR, universal API adapters, real crypto binding, foreign ABI C/Rust/Python, arbitrary package sandbox, Android/iOS/native cross-target compilation, distributed multi-device deployment, AI prompt-to-app and marketplace.

## Model policy

Every agent and subagent: ONLY GPT-6.1 Terra / GPT-6.1 Luna. Never GPT-5.6 Sol / Astra. No unknown-model fallback. Config is a policy declaration, not a guarantee that third-party Codex runtime model defaults will respect it. Read `AGENTS.md`.

## Launch

Use `CODEX_START.md` as starting instruction. First run tests, then continue at `EMS-010` from `tasks/backlog.json`.
