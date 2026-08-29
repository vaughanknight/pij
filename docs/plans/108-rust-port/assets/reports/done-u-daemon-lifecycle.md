# Done — u-daemon-lifecycle

Branch: `s108/w3-lifecycle`

## Delivered

- `crates/daemon/src/lifecycle.rs`: local `MachineIdentity` resolution and workload-agnostic `TickLoop`.
- Configured alias wins without a hostname lookup; absent alias defaults through the portable OS hostname API.
- Tick interval is injected and independent of watchdog policy. First tick is delayed one interval, ticks never overlap, missed ticks delay rather than burst, action errors stop the loop, and shutdown drains an accepted tick.
- Existing OS bind guard, Axum graceful connection drain, per-boot key ordering, and `BUILD` identity are preserved rather than duplicated.
- `docs/plans/108-rust-port/assets/daemon-lifecycle.md`: restart/upgrade contract, client observations, safe drain boundary, and explicit unimplemented work.

## Toolchain and capacity

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
/tmp filesystem: 1.8 TiB total, 199 GiB available
CARGO_TARGET_DIR=/tmp/pij-w3-lifecycle-target
CARGO_INCREMENTAL=0
```

## Tests and gate

Focused lifecycle tests:

```text
cargo test --locked -p pij-daemon lifecycle::tests::
6 passed; 0 failed
```

Daemon crate:

```text
cargo test --locked -p pij-daemon
40 passed; 0 failed
```

Authoritative gate:

```text
cargo run --locked -p pij-testkit --bin pij-gate
pij-gate verdict
  toolchain PASS  rustc 1.98.0 == pin
  lock      PASS  Cargo.lock matches the manifests
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      PASS  cargo test
  arch      PASS  8 crates, 0 violations
pij-gate: all stages green
```

`harness boot` remains unavailable for this Rust wave worktree because the pre-existing TypeScript `just typecheck` stage has no usable node-tooling diagnostics here. This is D8 from the ruled ack; `pij-gate` is authoritative.

## Mutation evidence

### Single-instance refusal is the guard

Mutation: removed `— another daemon may already hold it` from the bind error, leaving the OS refusal but no operator diagnosis.

```text
cargo test --locked -p pij-daemon --test first_light \
  a_second_daemon_cannot_take_a_held_port -- --exact

FAILED
The refusal must name the likely cause: daemon: could not bind 127.0.0.1:<port>
(Address already in use (os error 48))
```

After restoring the message, the exact test passed. This proves the actionable bind text, not a lock file or secondary mechanism, is the complete second-daemon guard promised by the packet.

### Configured alias precedence

Mutation: changed both match arms to call hostname resolution, so a configured alias no longer short-circuited it.

```text
cargo test --locked -p pij-daemon \
  lifecycle::tests::a_configured_alias_wins_without_consulting_hostname -- --exact

FAILED
panicked: a configured alias must not consult hostname
```

After restoring `Some(alias) => alias.to_string()`, the lifecycle suite passed.

### Hostname default

Mutation: replaced the absent-alias hostname lookup with the constant `localhost`.

```text
cargo test --locked -p pij-daemon \
  lifecycle::tests::an_absent_alias_defaults_to_hostname -- --exact

FAILED
left: "localhost"
right: "host-17"
```

After restoring the injected hostname result, the lifecycle suite passed.

## Composition recipe

Public signatures:

```rust
MachineIdentity::resolve(configured_alias: Option<&str>)
    -> pij_core::error::Result<MachineIdentity>;
MachineIdentity::alias(&self) -> &str;
MachineIdentity::build(&self) -> &'static str;

TickLoop::start<F, Fut>(interval: Duration, tick: F)
    -> pij_core::error::Result<TickLoop>
where
    F: FnMut() -> Fut + Send + 'static,
    Fut: Future<Output = pij_core::error::Result<()>> + Send + 'static;
TickLoop::shutdown(self) -> pij_core::error::Result<()>;
```

PM composition:

```rust
use std::time::Duration;
use pij_daemon::lifecycle::{MachineIdentity, TickLoop};

let identity = MachineIdentity::resolve(config.machine_alias.as_deref())?;
let ticks = TickLoop::start(
    Duration::from_secs(config.tick_interval_secs),
    move || tick_services_once(),
)?;
let router = http::router(services, token, identity.clone());
```

- Add `machine_alias: Option<String>` and `tick_interval_secs: u64` to composed config.
- `/health` serializes `identity.alias()` and `identity.build()`.
- The boot banner prints the same alias and build, plus u-daemon-http's LAN/loopback exposure.
- `Daemon` owns `ticks`. Shutdown signals HTTP graceful shutdown first, then awaits `ticks.shutdown()` so accepted requests and the current tick drain.
- Peer-map validation rejects duplicate peer aliases and a peer alias equal to the local alias; u-daemon-http owns that validation. Unqualified seat names remain local.

The same recipe is a doc comment on `MachineIdentity::resolve`.

## Shared-merge and derived files

Shared-merge files touched:

- `Cargo.toml`: workspace `hostname` dependency and Tokio `test-util` feature.
- `crates/daemon/Cargo.toml`: `hostname` dependency.
- `crates/testkit/arch-allowlist.toml`: reviewed `hostname` edge with rationale.
- `crates/daemon/src/lib.rs`: only `pub mod lifecycle;`, as fenced.

Derived files regenerated, not hand-merged:

- `Cargo.lock`
- `crates/testkit/fixtures/arch/clean-metadata.json`
- `crates/testkit/fixtures/arch/drifted-metadata.json`

## Assumptions and explicit limits

1. PM's D1 ruling owns the `Config` field and `/health` + banner integration at compose; this branch exports the exact lifecycle API and recipe only.
2. PM's D2 ruling keeps workload selection outside the scheduler. `tick_interval_secs` is not `watchdog_interval_secs`.
3. PM's D3 ruling preserves existing boot, shutdown, bind guard, and build reporting. No second implementation was added.
4. The packet explicitly overrides the COMMON docs freeze for `assets/daemon-lifecycle.md`.
5. Local alias resolution does not inspect peers. Peer uniqueness and local-alias collision checks belong to u-daemon-http at compose.
6. Core `Config` docs and `core_unit_exemplar` still say loopback-only; PM owns their req-0017 correction at compose (D6).
7. Current graceful restart drains Axum connections and one in-progress tick. Admission draining, worker join sets, peer withdrawal, listener handoff, and rollback automation are designed but explicitly unimplemented.
8. A configured alias is accepted verbatim except that whitespace-only values refuse. Cross-machine naming policy beyond uniqueness is not invented here.
