# Textual EMS — syntax exploration (NOT frozen)

Textual EMS is a first-class language, not a TypeScript wrapper and not a required visual macro. It MUST lower to the same semantic IR as visual EMS. M0 only supports a constrained SSA-style subset; examples below are proposals for M1 grammar and not accepted executable syntax yet.

Реализован новый самостоятельный frontend: `docs/spec/TEXT_GRAMMAR.md`, `src/frontend/index.mjs`, команда `node tools/ems.mjs parse examples/language-core.ems`. Он создаёт located AST для расширенной грамматики, но ещё не исполняет новые конструкции. Этот документ сохраняет предложения, включая неподдержанные формы fixed-size generics и binding declarations; реализуемая грамматика определяется TEXT_GRAMMAR.md. M0 `text-run` пока выполняет прежний поднабор.

## Proposed module & contract shape

```ems
package community.speedcubing @ "1.0.0"

contract AverageOfFive(times: Array<SolveResult, 5>) -> Result<Duration, WcaError>
  requires pure
{
  let normalized = times.map(result => applyPenalty(result))
  if count(normalized, isDNF) >= 2 {
    return Err(WcaError.DNF)
  }
  let sorted = sortByWcaRules(normalized)
  let included = sorted.slice(1, 4)
  return Ok(wcaRoundMean(included))
}
```

The example intentionally references domain functions and has no guarantee of exact WCA compliance without conformance tests. The actual WCA contract should explicitly cover rounding, DNF, penalties, ties and event-specific rules.

## Foreign binding declaration (proposed)

```ems
extern contract Crypto.AEAD.Encrypt(
    key: Secret<Key256>,
    nonce: Nonce96,
    plaintext: Bytes,
    aad: Bytes
) -> Result<AeadCiphertext, CryptoError>
requires capability("crypto.aead")
implementation @"vendor.crypto" version "1.0.0";
```

This is a contract declaration, not a native crypto implementation. Compiler binds to a real audited crypto provider where supported.

## Design questions Codex must settle via ADR before implementation

- Are function calls expression-first or separate graph operations? How are effects represented in the type system?
- Which numeric types, overflow semantics, Decimal scale, conversions and serialization are canonical?
- How are async and stream contracts typed? What is event ordering / backpressure?
- How is allocation/ownership represented for C FFI?
- How are nullable/optional vs error outcomes expressed?
- Can composite contracts be recursive, and what are recursion limits?
- How are state transitions serialized for deterministic replay?
- How to preserve source-maps between text, graph and IR?

**M0 executable grammar only:**

```
contract dotted.name(arg: Number|Number[]|Boolean|String) -> Type {
  let temp = add|sub|mul|div|min|max|sum(arg1, ...)
  return temp
}
```

This is deliberately narrow; not a production promise.
