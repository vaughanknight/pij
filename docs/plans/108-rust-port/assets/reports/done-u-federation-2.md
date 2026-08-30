# Done — u-federation-2

## Outcome

The deferred roster and event half of req-0017 now ships as a federated view. Local registry rows remain authoritative and machine-free at rest; `/v1/seats` stamps the daemon's current alias and combines those rows with retained peer snapshots. `/v1/events` multiplexes the local EventBus with bounded remote views. Remote events are never appended to the local Spine and therefore never receive a second sequence or become a forwarding cycle.

## Wire delivered

- `SeatDescriptor.machine: Option<String>` is additive and serde-defaulted. SQLite reads always produce `None`; the HTTP view stamps `Some(current_alias)`. A machine rename therefore changes the view instead of leaving durable rows with stale identity.
- `GET /v1/seats` returns `FederatedRoster { seats, unavailable }`. `unavailable` is typed data, never `Envelope.meta`; a consumer can distinguish an empty peer roster from an unreachable peer without branching on prose.
- `GET /v1/events?since=<URL-encoded JSON object>` accepts one per-machine cursor map. An absent map is live-only for every source.
- `scope=local` on seats and events is the daemon-to-daemon source read. Ordinary local-client calls remain federated. This prevents two mutually configured daemons from recursively fanning in each other's federated views even though neither appends remote events.
- Stream lines after Hello are a tagged `StreamFrame` union: `type=event` carries `{machine,cursor,event}` and `type=peer_state` carries connected, unavailable/retrying, or lagged state without inventing a cursor for a control observation.
- Authenticated peer primitives now cover JSON GET, JSON POST, and incremental NDJSON GET with Hello/version validation.

## Worker behavior

`FederationWorker` owns and joins the existing remote-send loop plus one roster-poll loop and one event-source loop per configured peer. One watch signal stops every task; shutdown awaits every handle before returning.

Policy is injected from `Config`:

- `federation_poll_interval_secs` defaults to 1 second and is the roster cadence/reconnect base.
- `federation_retry_max_secs` defaults to 300 seconds and caps exponential send/reconnect backoff.
- Existing `event_buffer_capacity` bounds each peer's remote event view and each broadcast channel.

A successful roster replaces that peer's last snapshot. A failed poll retains the last successful rows and adds the peer to typed `unavailable`; it never replaces unknown/unreachable with an invented empty roster.

A remote stream first attaches live-only. After observing a cursor it reconnects with `{peer_alias:last_cursor}`. Duplicate replay frames are suppressed. A cursor gap, a subscriber that falls behind its bounded channel, or a requested cursor older than the retained buffer emits a named `PeerStreamState::Lagged` control before remaining frames. Connection failure/EOF emits `Unavailable` with the next retry delay; successful reconnect emits `Connected`.

`/v1/events` is the explicit streaming exception to R4. The handler attaches to local and worker-owned streams; peer network IO remains in owned workers rather than request handlers.

The long-lived stream client has a connect timeout but deliberately no total request timeout. Reusing the 30-second remote-send client would have killed every healthy event stream after 30 seconds.

## Required transient-failure loop tests

### `roster_loop_survives_one_peer_error_and_processes_the_next_poll`

The configured peer address initially refuses connection. The test observes typed degraded state, starts a real authenticated peer router at that address, and proves the next poll returns both `alice@desktop` and `alice@laptop`. It then stops the peer and proves the two rows remain while `unavailable` marks `laptop` stale. A `scope=local` request to A returns only A's row.

### `event_loop_survives_one_stream_error_and_processes_the_next_frame`

A real Axum peer serves a finite authenticated stream. The first connection yields cursor 1 and ends; A emits an in-band unavailable/retrying frame, reconnects with `{"laptop":1}`, and processes cursor 2. The test also proves `scope=local` excludes the remote view and that A's local Spine remains empty after both remote events.

Additional bound proof: `cursor_older_than_bounded_buffer_emits_named_lag_before_remaining_frames` fills a two-frame peer buffer with cursors 1–3, attaches at 0, and observes `Lagged { dropped: 1 }` before cursors 2 and 3.

Focused results:

```text
cargo test --locked -p pij-daemon loop_survives_one -- --nocapture
cargo test: 2 passed

cargo test --locked -p pij-daemon cursor_older_than_bounded_buffer -- --nocapture
cargo test: 1 passed

cargo test --locked -p pij-daemon
cargo test: 83 passed
```

## Mutation transcripts

### Machine-qualified same-name roster

Mutation: changed the remote roster stamp from `seat.machine = Some(source.alias.clone())` to `seat.machine = None` with an anchored edit.

Probe:

```text
cargo test --locked -p pij-daemon roster_loop_survives_one_peer_error_and_processes_the_next_poll -- --nocapture
```

Observed failure:

```text
assertion `left == right` failed
  left: [("alice", None), ("alice", Some("desktop"))]
 right: [("alice", Some("desktop")), ("alice", Some("laptop"))]
```

The anchored edit was reverted. Both required loop tests then passed.

### Per-machine reconnect cursor

Mutation: replaced `let since = source.last_cursor()` with `let since: Option<u64> = None` in the event loop.

Probe:

```text
cargo test --locked -p pij-daemon event_loop_survives_one_stream_error_and_processes_the_next_frame -- --nocapture
```

Observed failure:

```text
reconnect carries a cursor map
```

The anchored edit was reverted. Both required loop tests then passed.

## Gate

Environment:

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
Avail: 201 GiB on /System/Volumes/Data
CARGO_INCREMENTAL=0
CARGO_TARGET_DIR=/tmp/pij-w5-federation2-target
```

Command:

```text
cargo run --locked -p pij-testkit --bin pij-gate
```

Verdict:

```text
toolchain PASS  rustc 1.98.0 == pin
lock      PASS  Cargo.lock matches the manifests, and the tree
fmt       PASS  cargo fmt
clippy    PASS  cargo clippy
test      PASS  cargo test
arch      PASS  8 crates, 0 violations
pij-gate: all stages green
```

The pre-work engineering `harness boot` was unavailable because this linked worktree did not have JavaScript dependencies installed (`tsc: command not found`, exit 127). This did not affect the Rust gate and was not suppressed.

## Composition recipe

```rust
use std::sync::Arc;
use std::time::Duration;

use pij_daemon::federation::{FederationPolicy, FederationService, FederationWorker};
use pij_daemon::http::{HttpConfig, router_with_federation};

let federation = Arc::new(FederationService::new(
    identity.alias().to_string(),
    config.peers.clone(),
    Arc::clone(&services.queue),
    Arc::clone(&services.event_bus),
    FederationPolicy {
        poll_interval: Duration::from_secs(config.federation_poll_interval_secs),
        max_retry_delay: Duration::from_secs(config.federation_retry_max_secs),
        event_buffer_capacity: config.event_buffer_capacity,
    },
)?);
let federation_worker: FederationWorker = Arc::clone(&federation).start();
let router = router_with_federation(
    services,
    HttpConfig {
        local_key: token,
        peer_keys: config.peers.iter().map(|peer| peer.key.clone()).collect(),
        machine_alias: identity.alias().to_string(),
    },
    federation,
);

// Daemon owns `federation_worker`. After stopping HTTP service, call and await
// `federation_worker.shutdown()` so no poll, stream, or send task outlives boot.
```

Configuration fields: `Config::{peers, federation_poll_interval_secs, federation_retry_max_secs, event_buffer_capacity}`. Construction remains after bind/service/machine-identity resolution and before key publication. Policy/peer validation is fallible, so it remains above publication.

## Changed/shared-merge files

- `crates/core/src/model.rs` — allocated additive `SeatDescriptor.machine`.
- `crates/core/src/config.rs` — injected federation timing policy.
- `crates/store/src/registry.rs` — explicit `machine: None` at rest; no schema/migration change.
- `crates/daemon/src/federation/{mod.rs,fanin.rs}` — policy, roster/event sources, buffers, reconnect, shutdown.
- `crates/daemon/src/http/{client.rs,mod.rs,types.rs,tests.rs}` — GET/stream primitives, typed roster/control wire, source-only routes, real-router proofs.
- `crates/daemon/src/lib.rs` — minimal constructor policy injection; no shutdown shape change.
- `crates/daemon/tests/first_light.rs` — tagged event-frame contract.
- `crates/cli/src/{client.rs,lib.rs,main.rs}` — typed roster, shared stream frame, repeated `--since MACHINE=CURSOR`, rendering.
- `crates/cli/tests/spawn.rs` — typed roster response.

No `ports.rs`, migration, dependency, architecture allow-list, manifest, fixture-manifest, or `Cargo.lock` change was required.

## Assumptions and explicit limits

- Remote events are process-memory views, not replicas. They disappear when this daemon stops; callers reconnect through their own per-machine cursors. Nothing writes a remote event to the local Spine.
- Absent cursor means live-only, including the first peer connection. If a peer is unavailable before any cursor has ever been observed, events produced during that outage are not replayed later; the unavailable interval is explicitly visible rather than silently presented as completeness. Replaying from zero would violate bounded attach.
- A requested cursor older than the bounded remote buffer cannot be satisfied completely. The stream emits the exact lag/drop state and continues from the oldest retained frame; it never silently skips.
- Last successful roster retention is process-local. After daemon restart each peer is explicitly unavailable/not-yet-polled until its first successful GET.
- Peer source routes use the same boot-time immutable bearer ring as every route. Key revocation remains restart-time.
- `SeatDescriptor.machine` is address/view identity, not registry identity. Local routing continues to use unqualified local `SeatId`; remote routing uses `Destination.machine`.
