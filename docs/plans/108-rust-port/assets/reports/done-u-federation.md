# Done — u-federation

## Outcome

Wave 4 now supports durable cross-machine remote send. The origin request path validates the ordered peer table, enqueues once, and returns only `Queued`. A long-lived worker forwards with one shared `reqwest::Client`, stamps `from_machine`, relays the peer receipt without strengthening it, retries transient failures with durable exponential backoff, and terminally surfaces peer decisions. The destination always uses `DeliveryService::accept_forwarded`, so even a bound/reachable seat is queued and duplicate forwards collapse while that row remains live.

Registry and event fan-in were struck from wave 4 after the ack found that the frozen wire cannot represent machine-qualified seats or per-machine cursors. This unit therefore implements the remote-send half of req-0017 only.

## Remote delivery claim

The origin `/v1/send` response claims only `DeliveryOutcome::Queued`: it observed its own durable queue row and nothing on the peer. HTTP byte acceptance never becomes `InjectedToTransport`. When the authenticated peer later returns its own `Receipt`, the federation worker publishes that exact `DeliveryOutcome` as an event; it neither upgrades nor reinterprets the peer's evidence.

## Behaviour delivered

- Ordered `Config.peers: Vec<PeerDefinition { alias, url, key }>` preserves duplicate evidence until validation.
- Peer aliases are unique and cannot equal the local alias; unqualified destinations remain local.
- One validated `BTreeMap<String, PeerEndpoint>` and one `reqwest::Client` are owned by `FederationService`.
- Remote admission is durable before the `Queued` response.
- Forwarded requests carry `from_machine`; `bob@desktop -> bob@laptop` is not self-addressed, while local `bob -> bob` remains refused.
- Destination admission requires a live registry row, honors tombstones, and always queues even when its transport is reachable.
- Retry delay is exponential from 1 second through a 5-minute ceiling. `Job.attempt` comes from the durable queue; `Queue::retry` alone increments it and writes `not_before` atomically.
- Jitter is injected. FakeQueue's injected clock proves not-before without sleeping.
- Network failures, timeouts, and peer `ErrorKind::Adapter` responses retry. Peer auth/refusal/not-found/skew decisions are terminal and publish `delivery.remote-refused`.
- `FederationWorker` has explicit shutdown and joins its task; the idle-worker test proves no orphan task.
- Peer-key removal takes effect on router restart. `AuthRing` remains an immutable boot snapshot.

## Two-daemon proof

`http::tests::two_daemons_forward_remote_send_into_destination_queue_and_spine` runs two real axum routers on OS-assigned loopback ports. The destination seat is bound and its fake transport is reachable, so queueing cannot be an accident of a pre-bind fixture. The test sends `bob@desktop -> bob@laptop`, then proves:

1. A returns `Queued` after its own durable enqueue.
2. A's worker authenticates to B and forwards with `from_machine = desktop`.
3. B returns `Queued` despite a reachable transport.
4. B's delivery queue contains the original body and machine-qualified sender.
5. B's spine contains `message.pushed` and `delivery.outcome`.
6. A's later outcome event contains B's unchanged `Queued` evidence and never `injected-to-transport`.

Focused result: `cargo test --locked -p pij-daemon two_daemons_forward_remote_send_into_destination_queue_and_spine` — PASS.

## Auth proof

- Configured peer key accepted by the destination router.
- Wrong peer key returns a permanent decision, records `Outcome::Failed`, and creates no retry.
- Removing the key and rebuilding the router makes the same key return 401; the test name states restart-time revocation explicitly.

Focused result: `cargo test --locked -p pij-daemon peer_key` — 3 passed.

## Mutation transcripts

### Receipt honesty

Mutation: changed the origin admission receipt from `Queued` to `Held { reason: "mutation" }` with an anchored edit.

Probe: `cargo test --locked -p pij-daemon two_daemons_forward_remote_send_into_destination_queue_and_spine`

Observed failure:

```text
assertion `left == right` failed: the origin observed only its own durable queue
  left: Held { reason: "mutation" }
 right: Queued
```

The edit was reverted with an anchored edit and the daemon suite returned green.

### Origin-machine propagation

Mutation: changed `forwarded.from_machine = Some(self.local_alias.clone())` to `None` with an anchored edit.

Probe: the same two-daemon test.

Observed failure:

```text
assertion `left == right` failed
  left: None
 right: Some("desktop")
```

The edit was reverted with an anchored edit and the daemon suite returned green.

### Fixture-strength correction

The first two-daemon proof used an unbound destination and passed for the wrong reason: all unbound recipients queue. The fixture was changed to a bound, transport-reachable recipient. It remained green only after `accept_forwarded` became the destination entry point. The origin and destination were then given the same seat name; this reproduced the machine-blind self-address defect (`Refused` instead of `Forwarded`) until the shared `core::route` seam became machine-aware.

## Gate

Environment:

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
Avail: 208 GiB on /System/Volumes/Data
CARGO_INCREMENTAL=0
CARGO_TARGET_DIR=/tmp/pij-w4-federation-target
```

Command:

```text
cargo run --locked -p pij-testkit --bin pij-gate
```

Final verdict:

```text
toolchain PASS  rustc 1.98.0 == pin
lock      PASS  Cargo.lock matches the manifests, and the tree
fmt       PASS  cargo fmt
clippy    PASS  cargo clippy
test      PASS  cargo test
arch      PASS  8 crates, 0 violations
pij-gate: all stages green
```

## Composition recipe

```rust
use std::sync::Arc;

use pij_daemon::federation::{FederationService, FederationWorker};
use pij_daemon::http::{HttpConfig, router_with_federation};

let federation = Arc::new(
    FederationService::new(
        identity.alias().to_string(),
        config.peers.clone(),
        Arc::clone(&services.queue),
        Arc::clone(&services.event_bus),
    )
    .map_err(|error| pij_core::error::PijError::Adapter {
        adapter: "daemon/federation".to_string(),
        message: error.to_string(),
    })?,
);
let federation_worker: FederationWorker = Arc::clone(&federation).start();
let peer_keys = config.peers.iter().map(|peer| peer.key.clone()).collect();
let router = router_with_federation(
    services,
    HttpConfig {
        local_key: token,
        peer_keys,
        machine_alias: identity.alias().to_string(),
    },
    federation,
);
// Store federation_worker in Daemon. During shutdown, stop the HTTP server and
// call federation_worker.shutdown().await so the worker cannot outlive boot.
```

Configuration field: `Config::peers`. Call site: daemon boot, after bind/service construction/machine-identity resolution and before key publication/serve. Validation is fallible and therefore remains above key publication.

## Shared-merge files touched

- `crates/daemon/src/lib.rs` — exactly one `pub mod federation;` declaration; no wiring.
- `crates/daemon/src/http/mod.rs` — optional federation state, federated router constructor, remote/local admission selection.
- `crates/daemon/src/http/types.rs` — additive `SendRequest::from_machine` wire field.
- `crates/daemon/src/http/tests.rs` — two-router, receipt, auth, revocation, and bound-destination proofs.
- `crates/core/src/config.rs` — allocated ordered peer definitions; clean cutover from `peer_keys`.

No dependency, allow-list, fixture-manifest, derived metadata, or `Cargo.lock` change was required by this unit. Shared core/store/testkit seam changes were PM-owned ratified amendments and arrived by merge.

## Assumptions and explicit limits

- Delivery is **at least once**, not exactly once. A duplicate forward collapses while the first destination row is pending or running. If the first copy has already been claimed and acked, a later ambiguous-network retry can deliver twice. Destination-side dedupe of delivered ids is deferred to wave 5.
- Registry fan-in and event-stream fan-in are not implemented. req-0017 remains incomplete until the deferred packet lands.
- Bootstrap is manual; there is no discovery.
- Pij supplies no TLS. Bearer keys are the only LAN control.
- Peer-key revocation is restart-time, not live mutation of an `AuthRing`.
- The PM composition root must own and shut down `FederationWorker`; this unit deliberately did not wire `crates/daemon/src/lib.rs` beyond its module declaration.
- The stale `Config::bind_addr` loopback-only prose was PM-owned and corrected on the composed branch; non-loopback binding remains deliberately loud through the existing exposure banner.
