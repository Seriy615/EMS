# EMS Contract IDL — proposed public fields

The `schemas/contract.schema.json` file is a deliberately small M0 validation draft. The following richer IDL is an architectural example, not accepted executable schema yet:

```json
{
  "schemaVersion": "1.0-draft",
  "id": "std.camera.capture",
  "version": "1.0.0",
  "interface": {
    "inputs": {"format": "ImageFormat", "resolution": "Resolution"},
    "outputs": {"frame": "ImageFrame"},
    "errors": ["PermissionDenied", "Unavailable", "Interrupted", "UnsupportedFormat"],
    "events": ["CaptureStarted", "CaptureEnded"]
  },
  "semantics": {
    "determinism": "nondeterministic",
    "effects": ["device.camera.read"],
    "capabilities": ["camera.present"],
    "permission": ["camera.capture"],
    "preconditions": ["camera.present", "permission.granted"],
    "postconditions": ["success returns ImageFrame of negotiated format"]
  },
  "resources": {
    "threadAffinity": "implementation-defined-declared",
    "lifecycle": "explicit-close",
    "maxLatencyMs": null
  }
}
```

**Implementation registry:** platform bindings live elsewhere and may be developed independently, for example `android.cameraX`, `ios.avFoundation`, `web.mediaDevices`. Compiler must verify compatibility, not assume they are behaviorally identical.

## Atomic/composite example

```
contract interface: std.math.average5arith
implementation A: composite EMS graph (inspectable)
implementation B: compiled standalone JS atomic package (opaque on canvas)
implementation C: native binary atomic package (opaque on canvas)
```

Atomic/composite is a property of provided implementation/representation, while a stable contract interface can be served by either mode. The original composite and sealed package may share semantic version when equivalent and tested.

## Future formal checks

IDL must support contract pre/postconditions, permissions and target capability sets; compatibility rules for minor/major versions; deterministic serialization and type evolution; error algebra; behavior conformance suites; resource ownership and effect constraints. Do not convert free-text claims into unearned formal guarantees.
