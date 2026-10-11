# AI planner, security and supply chain

## Agent behavior

- Discover actual contracts and versions in registry; no fabricated method names.
- Output structured graph candidates and explicit assumptions.
- Validate types, effects, target capabilities, license compatibility and permissions deterministically.
- Generate acceptance and behavior tests, distinguish tests created by AI from tests passed.
- Support semantic diffs and human review on edits to existing apps.
- Ask for permission before irreversible effects (payments, physical hardware, external publication, deletion).

## Model restriction from owner

**Only GPT-6.1 Sol or GPT-6 Luna may be invoked as agents. Never GPT-5.6 Sol or Astra, including subagents.** Human-readable labels are not guaranteed SDK model IDs; resolve only against actual Codex model selector. If impossible to guarantee the permitted model, abort delegation. Nothing in this spec authorizes automatic model fallback.

## Security model

Threat actors: malicious package author, compromised dependency, flawed compiler, hostile natural-language prompt, over-privileged adapter, insider with access to secrets, tampered binaries. Trust boundaries: incoming prompt, parser, registry, plugin host, OS API, device, service, build pipeline, market packages.

Controls: signed package/lockfile, content hashing, declared effects, least-privilege grants, sandbox for untrusted plugins, secret handles, auditable AI changes, disabled default network and process-execution permissions, dependency audit, code review for privileged bindings, OS permission compliance, secure error redaction.

M0 security caveat: `registerAtomic` and `registerTrustedJSBindings` execute ordinary trusted JavaScript in-process, without sandboxing. This is a prototype convenience **not** production plugin isolation.

## Safety for physical devices and crypto

Physical actuator contracts require range validation, operator stop/abort, device capability discovery and safe failure. Crypto contracts cannot leak key bytes to UI inspector or debug traces. If the selected platform lacks secure key storage, surface that limitation. Never claim a local compiled atomic contract cannot be reverse engineered.
