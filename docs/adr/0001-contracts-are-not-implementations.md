# ADR-0001: Contract interface ≠ implementation

**Status:** Accepted as foundational design rule.

**Context:** EMS must support one program graph across OS APIs and foreign libraries. Binding a contract name directly to Windows/Swift/DOM would make graph nonportable.

**Decision:** Contract interface is independent of implementation. A resolver selects a target-specific implementation, performs compatibility checks, records the selected artifact and rejects unsupported targets.

**Consequences:** Adds resolver/metadata complexity, prevents accidental OS API leakage into core language. Same behavior is guaranteed only to the extent specified and verified by contract conformance tests, not universal physical equivalence.
