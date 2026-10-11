# Development validation plan

## Before every change

1. `node --version` >= 22.
2. `npm test` — Node reference tests.
3. `npm run verify` — repo structure + representative scenarios.
4. `node tools/ems.mjs validate examples/avg5.graph.json`.
5. `npm run seal:demo` + inspect `dist/avg5-atomic` (no source graph packaged).

## For every contract change

- Positive invocation with realistic values.
- Negative argument type/missing argument/unavailable implementation.
- Error and cancellation conditions.
- Capabilities / permissions.
- Version compatibility.
- Test equivalence of interpreter and compiler if pure.

## For every foreign adapter

- Ownership/ABI, type conversions, exceptions, failure, callback lifetime, resource disposal.
- Untrusted code import remains disabled without isolation.
- Crypto: known vectors, wrong tag, nonce and key restrictions, secret log audit.
- Native target matrix, never assert universal portability.

## For every compiler backend

- Reproducible build in fresh environment.
- Execute generated program outside EMS IDE.
- Compare outputs/observable effects to reference.
- Unsupported capabilities error before publish.
- Manifest declares runtime support libraries and external service dependencies.

## Release evidence

Each accepted feature has AC reference, repository revision, test output, target version, unsupported conditions and signing/security status.
