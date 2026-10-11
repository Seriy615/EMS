# ADR-0003: Single EMS semantics with visual and textual authoring

**Status:** Accepted as design principle; implementation pending.

**Context:** EMS must support no-code users, professional textual EMS developers, and AI graph generation. Multiple engines would diverge in behavior.

**Decision:** Text and visual forms lower to the same typed AST/HIR and versioned EMS IR. Canvas layout and UX metadata are not semantic. Imported code is not translated blindly into EMS: foreign libraries are invoked through explicit typed atomic contracts.

**Consequences:** Backend interoperability becomes plausible and language tests can be shared across authoring modes. Bidirectional pretty-printing may be lossy in formatting, but not semantics.
