# UI and multi-environment application model

## One application graph, many interfaces

One EMS project may include browser role UI, Android native UI, desktop operator UI, server event broker, projector overlay, camera capture and DMX controller. They share a typed state/event model, but compile/deploy into different artifacts where necessary.

## Universal UI tree

UI semantics: element identity, hierarchy, properties, reactive bindings, typed events, accessibility, navigation, lifecycle, permissions and layout constraints. DOM is a backend of this logical tree. Native UI is another; they are semantically equivalent only for the capabilities declared in contract. Pixel-perfect identity, file entitlement, keyboard behavior and accessibility primitives can differ and are not promised automatically.

## Runtime boundary

Never share mutable memory across devices by assumption. Remote contract edges must declare RPC serialization, auth, backpressure, delivery semantics, ordering, retry policy, dedupe and failure behavior. `offline` requires explicit consistency & reconciliation strategy.

## UI inspectability

Click the rendered UI widget → find its EMS node / state binding / event handler → recursively expand composite blocks → stop at atoms. Show source maps and permission boundaries, not just attractive boxes. Backend-specific properties can be exposed through optional capabilities without corrupting portable base contracts.

## Media/hardware realtime

GPU rendering, audio callback, frame processing and DMX output may use native optimized engines. EMS declaratively composes them and delegates timing-sensitive operations rather than implementing every frame via JS node interpreter.
