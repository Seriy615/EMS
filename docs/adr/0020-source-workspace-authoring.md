# ADR-0020: Source files own module-aware authoring

## Status
Accepted for the finite AC-138 source workspace profile; broader visual coverage remains open.

## Decision
Keep `ems-source-project/1` as the authoritative input in a distinct catalog `source`
record. Do not convert a linked program into an independently edited native snapshot.
Use the existing common linker, checker, IR, native/UI kernels and standalone emitters.

Persist invalid text and incomplete canvas edits as separate bounded drafts. Check
source/draft bytes before commits. Retain geometry by IDs without using stale graph
semantics as a source of truth. Return isolated cached catalog reads only for the
same exact storage bytes.

Expose source body locations as compiler sidecar metadata, outside the semantic module.
Patch only actual authored graph body spans, preserve original imports/signatures, and
verify intended bindings against recompiled authored graphs. Reject unnameable/private
references and ambiguous owner/helper mappings even when their types match. A shared
stateful definition is rewritten once and every instance is rebuilt from it.

## Consequences
Text authoring, execution and independent export work for existing common source
profiles. Ordinary graph editing updates the same files for the documented authored
body subset. Current source-aware UI authoring uses text and real preview; full visual
UI inverse, structured-body graph inverse, stable presentation across file renames,
and transactional multiwriter storage are subsequent work, not placeholder successes.
