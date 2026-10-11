---
name: ems-security
description: Evaluate EMS plugin, device, AI and package risks; permissions, secrets and trust boundaries.
---
# EMS security procedure
1. Read `docs/architecture/AI_SECURITY.md`; describe threat actor + trust boundary.
2. Inventory capabilities and effects of every component.
3. Verify untrusted imported code cannot be executed with full host privileges.
4. Treat signed packages as integrity/authenticity, not proof of safety.
5. Keep secrets out of UI, error logs and agent traces; never ship private keys.
6. Enforce owner agent policy: GPT-6.1 Sol or GPT-6 Luna only, no Sol 5.6 or Astra.
7. Add negative tests before accepting safety controls.
