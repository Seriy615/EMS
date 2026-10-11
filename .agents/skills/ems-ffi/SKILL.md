---
name: ems-ffi
description: Import foreign libraries into sets of typed EMS atomic contracts and build safe platform-specific bindings.
---
# EMS FFI/import procedure
1. Read `docs/architecture/FFI_AND_IMPORT.md` and FFI-* requirements.
2. Enumerate symbols/metadata without executing untrusted code; manual schemas where needed.
3. Specify encoding, calling convention, resource ownership, errors, async, effects, target triple.
4. Represent each imported function as atomic block under one versioned package.
5. For crypto, use vetted implementations and official vectors, no bespoke cipher.
6. The current JavaScript M0 importer is trusted-only and is **not sandboxed**.
