# Codex execution protocol

## Input

The owner supplied a conceptual and functional specification for EMS. This repository is the implementation project. **No more mass rewriting of specs in place of code.** Prioritize a verified, runnable vertical slice at a time.

## Hard agent routing requirement

**For any agent invocation, explicitly select GPT-6.1 Sol or GPT-6 Luna. NEVER GPT-5.6 Sol / Astra.** Applies to main/delegated/background/subagents. Do not rely on model defaults. If model cannot be explicitly verified, do not spawn the agent. Owner can later revise this policy; until then it is absolute.

## Startup procedure

```
1. Read PROJECT_GOAL.md, AGENTS.md, docs/spec/EMS_FULL_SPEC.md, docs/spec/REQUIREMENTS.md, docs/qa/PROGRESS.md.
2. Read docs/architecture/*, relevant local .agents/skills/.../SKILL.md.
3. Run npm test and npm run verify.
4. Select one ready task from tasks/backlog.json whose deps all are DONE.
5. Make one design decision when needed: docs/adr/NNNN-description.md.
6. Implement narrow end-to-end feature + negative tests.
7. Run relevant checks, then complete acceptance checklist.
8. Update task status, docs/qa/STATUS.md, feature docs.
9. Report exact passing evidence, what is still missing, and next work item.
```

## Scope order

**First:** language semantics / contracts / type safety / composite atom seal / text-to-IR mapping. **Second:** editor and UI. **Third:** richer compiler and importers. **Fourth:** native/remote/device and AI. Avoid launching a full mobile backend before language semantics have settled.

## Work item format

Every task includes: `id`, `title`, `phase`, `dependsOn`, `objective`, `deliverables`, `acceptance`, `status`, `priority` and `ownerModelPolicy`. A DONE task must have a test or documented reproducible manual evidence. Blocked items require blockers, not fabricated mocks.

## Definition of Done

- Code compiles; `npm test` and QA run green.
- API/IDL docs updated when public behavior changes.
- Negative cases and security boundaries tested.
- Source changes are minimal and reviewable.
- No secret, credential or test-only safety bypass is committed.
- All implementation evidence tied to a commit/ref before declaring production.
- Agent model usage meets policy, with actual model selection captured in report when available.

## Examples of unacceptable outcomes

- Report says "supports Android" because there is only a manifest sample.
- Report says "crypto implemented" because it drew an AES block icon.
- Imported untrusted JS executed to inspect available exports without sandbox.
- Sealed output described as mathematically unrecoverable.
- WCA Ao5 advertised based on arithmetic-only `(sum-min-max)/3`.
- Model switched from Sol 6.1/Luna 6 to forbidden fallback or unknown default.
- Agent spawns unreviewed third-party subagents automatically.
