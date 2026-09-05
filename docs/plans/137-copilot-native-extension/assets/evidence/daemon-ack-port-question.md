# Native ACK authority lookup — PM decision

Contract v2 requires current Copilot tuple plus exact job-recipient check before acknowledgement; other-harness semantics stay unchanged.

Existing `Queue` (`crates/core/src/ports.rs:126-210`) provides claim/peek by kind and `ack_delivery(job_id, origin)`, but no lookup of a particular running job. `ack_delivery` returns authoritative recipient only AFTER terminal commit (`DeliveryService::acknowledge_inbox`, delivery/mod.rs:556-560). HTTP currently ignores request.seat by design; `http/tests.rs:1697` explicitly proves a forged request seat does not affect queue-authority audit attribution.

Checking only the request's named seat is insufficient: a stale native reader can claim to be a non-Copilot seat and send another job_id through the legacy path. Checking all seats/peek rows would be an inefficient incomplete by-id lookup, not a sound design.

Proposed minimal seam: add `Queue::claimed_delivery(job_id) -> Result<Option<Job>>` to inspect the named currently-running delivery before HTTP acknowledgement; service derives actual recipient, applies Copilot-only tuple + exact request-recipient checks, then performs existing terminal acknowledgement. Store and FakeQueue implement it; delegating queue wrappers forward it. This adds a method to an existing port, not an eighth port; necessary to enforce persisted native capability. A stronger atomic incarnation check may require a store transaction/API, but the v2 requirement presently says verify current descriptor before ack.

Requested narrow scope permission: core/src/ports.rs new method plus `crates/testkit/src/fakes.rs` implementation and affected delegating test wrappers (including sidecars tests if compiler requires). Alternative: authorize exact-seat check for ALL harness ack requests, which changes the explicitly preserved non-Copilot semantics and still needs by-id information.

Only ACK-dependent work waits; native ownership, registration and RPC cleanup continue. No port edit made pending decision.

## Resolved

PM approved the exact Queue lookup and real/fake/test-wrapper scope in `pm-queue-lookup-ruling.md`, carried into contractv3. Implemented service-level authority lookup and a shared registration/claim/ack mutex. Normal HTTP and shim routes pass through it; native-as-other-seat and stale tuple regression tests preserve the running job. Existing non-Copilot machine-grade audit semantics remain unchanged.
