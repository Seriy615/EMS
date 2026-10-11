# ADR-0004: Restrict autonomous Codex agent models

**Status:** Owner-mandated policy.

**Revision, 2026-10-11:** The owner's latest instruction and confirmation replace the earlier Terra/Luna labels with GPT-6.1 Sol and GPT-6 Luna. This changes repository policy declarations, not the host's model configuration. No subordinate agents were started; the current chat selection was confirmed by the owner, without independent model-ID telemetry.

**Decision:** Any agent or subagent must run only on **GPT-6.1 Sol** or **GPT-6 Luna**. Do not call **GPT-5.6 Sol** or **Astra**. Model fallback to any unknown/forbidden model is not permitted. If the environment lacks explicit selection or verification, do not start delegated agents. Policy is declared in `AGENTS.md` and `.agents/policy.json`.

**Note:** UI model labels may not be valid API identifiers. Do not invent model slugs or claim this repository's JSON can override platform defaults by itself.
