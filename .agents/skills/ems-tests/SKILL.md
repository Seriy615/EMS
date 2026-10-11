---
name: ems-tests
description: Define EMS conformance tests, negative cases, target differential tests and acceptance evidence.
---
# EMS tests procedure
1. Read `docs/qa/ACCEPTANCE.md` and `docs/spec/REQUIREMENTS.md`.
2. Run `npm test` and `npm run verify` before and after work.
3. Test inputs, outputs, invalid types, cycles, effects, permissions, resources and target limitations.
4. A reference JS proof is not evidence of Android/iOS support.
5. Record exact command, revision, counts, unsupported scenarios in `docs/qa/STATUS.md`.
