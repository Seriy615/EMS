# ADR-0002: Atomic/composite is an editor decomposition property

**Status:** Accepted as owner's explicit clarification.

**Context:** Earlier discussion confused “закрытый контракт” with commercial source closure. Owner clarified meaning: atomic, i.e. not expandable as a graph, while higher-order composite contracts normally open for inspection.

**Decision:** Use `atomic` when the public node has no explorable EMS subgraph and `composite` when it has a nested EMS graph. Source availability, inspectability, edit rights, distribution licenses, payment and implementation artifacts are independent properties.

**Consequences:** External library functions naturally become atomic EMS blocks. A compiled composite may be distributed as atomic. Neither atomicity nor binary packaging promises trade-secret security.
