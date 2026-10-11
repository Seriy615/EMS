# EMS Library Importer, FFI, external code

## Product behavior

User picks a supported library + version + target; EMS discovers exports/metadata, proposes mappings, asks for missing semantic metadata, generates bindings, tests ABI and emits an EMS package containing **a set of atomic blocks**. Mapping can be manual, semi-automatic or generated from trustworthy interface metadata.

## Binding options / priorities

1. **Trusted JS ESM (M0 demo only):** `registerTrustedJSBindings(...)` maps known exported functions into atomic blocks, no sandbox or broad type inference. Never load untrusted external JS.
2. **WASM Component Model + WIT:** preferred portable typed components where supported; WASM does not imply zero permissions or portability of host dependencies.
3. **C ABI:** headers/import library/platform binary; maintain memory ownership and ABI calling convention.
4. **Rust and C++:** typically must expose supported C ABI, WIT or generated bridge; no stable arbitrary C++ ABI promise.
5. **Python:** process/service binding with serialized values and lifecycle; do not embed unsafe arbitrary interpreter in Web target.
6. **HTTP/gRPC/IPC:** remote atoms and service-specific contracts, with auth, retries, trust and versioned schema.

## Critical import metadata

```text
library/source/target triple/calling convention/symbol
argument and return types, encoding and pointer ownership
alloc/dealloc responsibility, lifetime, thread affinity
exceptions, error model, callback lifetime
blocking/async semantics and cancellation
permissions/effects and resource limits
version/ABI compatibility, dependencies, license
known test vectors and contract conformance
```

## Crypto use case

Import proven implementations for AES-256-GCM, Ed25519, KDF etc. A private `Secret<Bytes32>` is not interchangeable with `Bytes`; bind key storage through secure capability. Standardize nonces/AEAD tag conventions, in-place vs out-of-place behavior, byte order, failure paths and constant-time claims. Do not write original cryptography in EMS merely to prove its power.

## Security gate

Parsing untrusted metadata is separate from executing a candidate plugin. All imported executable code needs an isolation policy: host sandbox, WASM restrictions, subprocess container, code signature and permission granting. M0 ESM import is explicitly **trusted only**. A Codex agent must not fetch/exe arbitrary libraries just because an import feature is being built.

## Delivery tasks

`EMS-120` module manifests → `EMS-121` type mapper → `EMS-122` package of atomic contracts → `EMS-123` ABI/ownership → `EMS-124` crypto reference vectors → `EMS-125` safe plugin host. Trace in `tasks/backlog.json`.
