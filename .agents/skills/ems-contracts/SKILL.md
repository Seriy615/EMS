---
name: ems-contracts
description: Develop and review EMS atomic/composite contract definitions, graph validation and formal interfaces.
---
# EMS contracts procedure
1. Read `docs/architecture/CONTRACTS.md` and normative requirement CONT-*.
2. Ensure all contracts have typed inputs, outputs, version, effects, capability declarations and canonical IDs.
3. Check whether the user means atomic (non-expanding graph) or proprietary (source licensing); never conflate.
4. Composite definitions must be inspectable and recursively usable; atomic definitions may be native, foreign or compiled.
5. Test bad graph connections and missing implementations, not only successful flows.
6. Update `docs/qa/STATUS.md` with test evidence.
