# Wave 2 done report — u-orchestration

**Coder**: `pij-fashionable-genar` · **PM**: `pij-revolutionary-lungfish` · 2026-08-29

## Result

Implemented the governance layer in `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-orchestration`:

- descriptor equivalence on exact `(pid, proc_start)` OR non-empty `spawn_id`, with secondary mismatches retained rather than rejected;
- explicit freshness ordering: missing or tied `verified_at` returns `Undecided` and writes nothing;
- durable `spawn_id -> spawner` records and parent attribution whose `Unknown` outcome names the missing evidence;
- projects, streams, batons, roles, one prime designation, dispatch/ack, and single-holder leases;
- one exhaustive read-only capability chokepoint;
- ordinal inventory across clone, linked worktrees, and all local branch heads;
- stream worktree creation from a dirty source checkout, with the reservation persisted before Git runs.

No eighth port, no in-memory process-local lock, no local fake, and no edit to the frozen composition root.

## Toolchain and disk

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
1.98.0-aarch64-apple-darwin (overridden by /Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-orchestration/rust-toolchain.toml)
/dev/disk3s5  1.8Ti  1.6Ti  238Gi available  88%
```

Build environment:

```text
CARGO_TARGET_DIR=/tmp/pij-w2-orchestration-target
CARGO_INCREMENTAL=0
PATH=/Users/jordanknight/.cargo/bin:$PATH
```

## Focused behavioral proof

```text
cargo test --locked -p pij-core --test orchestration
  5 passed, 0 failed

cargo test --locked -p pij-store --test orchestration
  7 passed, 0 failed

cargo test --locked -p pij-daemon --test orchestration_repo
  2 passed, 0 failed
```

The daemon fixture creates a real Git repository named `s007-clone`, a linked worktree/branch at `s011`, and an unchecked-out local head at `s013`; the scanner mints `14`. The dirty-tree test then modifies a tracked file without committing, durably reserves ordinal 14, creates `s014/orchestration`, and confirms the original dirt remains.

The generated lease property test drives 256 deterministic seeds × 16 claim/release transitions and checks the database holder after every transition. A separate 16-way concurrent claim test observes exactly one `Claimed` result.

## Mutation evidence

### Equivalence predicate: OR changed to AND

Command:

```text
CARGO_TARGET_DIR=/tmp/pij-w2-orchestration-target CARGO_INCREMENTAL=0 \
  cargo test --locked -p pij-core --test orchestration \
  equivalence_merge_is_the_complete_five_row_table -- --exact
```

Observed failure:

```text
equivalence table failures:
same-pid-pair: expected true, got false
same-spawn-id: expected true, got false
tolerant-secondary-mismatch: expected true, got false
test result: FAILED
```

Restored `same_process || same_spawn`.

### Equivalence predicate: exact process pair changed to pid-only

Same focused command. Observed failure:

```text
equivalence table failures:
recycled-pid: expected false, got true
test result: FAILED
```

Restored exact `ProcIdentity` equality.

### Capability chokepoint: `CreateStream` bypassed

Command:

```text
CARGO_TARGET_DIR=/tmp/pij-w2-orchestration-target CARGO_INCREMENTAL=0 \
  cargo test --locked -p pij-core --test orchestration \
  read_only_capability_is_enforced_at_one_exhaustive_chokepoint -- --exact
```

Observed failure:

```text
read-only decision drifted for CreateStream
left: false
right: true
test result: FAILED
```

Restored the single `ReadOnly && operation.mutates()` predicate. All three focused suites then passed.

## Canonical gate

Command:

```text
cd /Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-orchestration
PATH=/Users/jordanknight/.cargo/bin:$PATH \
CARGO_TARGET_DIR=/tmp/pij-w2-orchestration-target \
CARGO_INCREMENTAL=0 \
  cargo run --locked -p pij-testkit --bin pij-gate
```

First run correctly failed only `clippy` on `large_enum_variant`; `ReconcileDecision::Merge` now boxes the rare 600-byte merge payload rather than placing it in every decision value. Final run:

```text
pij-gate verdict
  toolchain PASS  rustc 1.98.0 == pin
  lock      PASS  Cargo.lock matches the manifests
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      PASS  cargo test
  arch      PASS  8 crates, 0 violations

pij-gate: all stages green
```

## Composition recipe

Public core entry point: `pij_core::orchestration::OrchestrationService`.

Paste into `/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/crates/daemon/src/lib.rs` at compose time:

```rust
#[path = "orchestration/repo.rs"]
pub mod orchestration_repo;

use pij_core::orchestration::OrchestrationService;

let orchestration = Arc::new(OrchestrationService::new());
// Add `orchestration` to Services beside EventBus. Handlers authorize through
// orchestration.execute(role, operation), then invoke SqliteOrchestration.
```

There is intentionally no `AdapterChoice::Real` arm: orchestration composes existing store and daemon IO rather than implementing an eighth port. It replaces no wave-0 `not_yet(...)` refusal. `crates/daemon/src/lib.rs` remained frozen.

## Shared/compose files touched

- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-orchestration/crates/core/src/lib.rs` — one `pub mod orchestration;` line.
- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-orchestration/crates/store/src/lib.rs` — orchestration module/re-exports.
- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-orchestration/crates/store/src/migrate.rs` — sole wave-2 schema bump, 3 → 4.
- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-orchestration/Cargo.lock` — regenerated derived artifact.
- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-orchestration/crates/testkit/fixtures/arch/clean-metadata.json` — regenerated derived artifact.
- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-orchestration/crates/testkit/fixtures/arch/drifted-metadata.json` — regenerated derived artifact with the two deliberate forbidden edges re-planted.

No dependency or allow-list row was added.

## Assumptions

1. A non-empty `spawn_id` is globally unique for a launch. Re-attributing an existing spawn record is a conflict, never an overwrite.
2. Self-declared `SeatDescriptor.parent` remains authoritative when present; the spawn record is the fallback only when it is absent.
3. `verified_at` is supplied by a live-verification caller. Missing or tied values cannot pick a survivor and therefore produce no database write.
4. Secondary freshness applies to harness/pane/folder/model/provider/effort. Role, parent, and runtime state are independent governance/telemetry facts and are not overwritten by descriptor reconciliation.
5. Local branch heads reserve ordinals even without a linked worktree; closed/tombstoned ordinals remain represented by their durable stream row and are never recycled.
6. Stream reservation is intentionally not rolled back if `git worktree add` fails: persist-before-mutate leaves a recoverable durable intent rather than making a partial side effect invisible.
7. Capability enforcement is cooperative service policy, not an adversarial security boundary; future orchestration operations must enter the exhaustive `Operation::ALL` vocabulary.
8. The PM composes the daemon module/public service after branch convergence; this unit did not edit the frozen composition root.
