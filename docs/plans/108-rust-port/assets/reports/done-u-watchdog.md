# Wave 2 u-watchdog done report

**Unit**: `u-watchdog`  
**Branch**: `s108/w2-watchdog`  
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-watchdog`

## Result

Implemented the pure watchdog scheduler at
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-watchdog/crates/core/src/watchdog.rs`.
The composition edge supplies immutable `WatchdogEntry` snapshots; core returns
`Nudge { seat, reason }` verdicts without clock, IO, persistence, or delivery.

The scheduler:

- consumes `Config::watchdog_interval_secs` rather than embedding a threshold;
- consults the settled `SeatDescriptor::nudgeable()` eligibility predicate;
- excludes tombstoned registry rows separately from semantic state;
- resolves pause precedence as live `exempt > compact > self`;
- re-arms exemptions exactly at their deadline;
- exposes pure reconciliation and working-transition helpers for later persistence;
- keeps staleness and nudging separate: parking suppresses nudges only;
- derives `NudgeReason::OverdueIdle` once, so adapters do not repeat the decision.

## Toolchain and disk

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
1.98.0-aarch64-apple-darwin (overridden by '/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-watchdog/rust-toolchain.toml')
/dev/disk3s5   1.8Ti   1.6Ti   238Gi    88%   /System/Volumes/Data
```

## Focused proof

Command:

```bash
cd /Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-watchdog
CARGO_TARGET_DIR=/tmp/pij-w2-watchdog-target CARGO_INCREMENTAL=0 \
  cargo test --locked -p pij-core --test watchdog
```

Result: **7 passed, 0 failed**. The exhaustive table covers all eight combinations
of self/compact/exempt controls across both system states and every semantic state,
plus relay, tombstone, due-boundary, exemption-deadline, compact-transition, and
future-clock cases.

## Required mutation evidence

### Eligibility predicate — healthy long tool call

Mutation in
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-watchdog/crates/core/src/watchdog.rs`:
replace the `SeatDescriptor::nudgeable()` filter with an unconditional filter.

```bash
CARGO_TARGET_DIR=/tmp/pij-w2-watchdog-target CARGO_INCREMENTAL=0 \
  cargo test --locked -p pij-core --test watchdog \
  healthy_long_tool_call_is_not_the_ts_false_stall -- --exact
```

Result with mutation: **FAILED: 0 passed, 1 failed**. The named incident regression
failed because the overdue `SystemState::Working` seat received a nudge. After
restoring the eligibility predicate: **7 passed, 0 failed**.

### Tier precedence

Mutation in the same file: resolve `compact` before a live `exempt`.

```bash
CARGO_TARGET_DIR=/tmp/pij-w2-watchdog-target CARGO_INCREMENTAL=0 \
  cargo test --locked -p pij-core --test watchdog \
  pause_precedence_is_exempt_then_compact_then_self -- --exact
```

Result with mutation: **FAILED: 0 passed, 1 failed**. The rows containing both a
compact pause and a live exemption detected the inversion. After restoring
`exempt > compact > self`: **7 passed, 0 failed**.

## Canonical gate

Command:

```bash
cd /Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-watchdog
export PATH="$HOME/.cargo/bin:$PATH"
export CARGO_TARGET_DIR=/tmp/pij-w2-watchdog-target
export CARGO_INCREMENTAL=0
cargo run --locked -p pij-testkit --bin pij-gate
```

Result:

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

Full gate log:
`/Users/jordanknight/.pij/pij-cloudy-caribou/bg-mtdn26fo-ds0yu2.log`.
After the gate, `git diff --check` was clean and `git status --short` contained
only the three authored code/test paths before this report was added; the gate
created no derived-file delta.

## Composition recipe

**N/A by PM ruling D5.** This unit is pure core logic, not a real adapter. There is
no `AdapterChoice::Real` arm or wave-0 `not_yet(...)` refusal to replace. Composition
requires only the exported `pub mod watchdog;` line in
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-watchdog/crates/core/src/lib.rs`.

## Shared-merge and derived files

Shared-merge file touched:

- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-watchdog/crates/core/src/lib.rs`
  — one `pub mod watchdog;` line.

No dependency or allowlist rows were added. `Cargo.lock` and both architecture
metadata fixtures were unchanged because the crate graph did not change.

## Assumptions

1. The composition edge joins registry rows, real activity timestamps, and
   persisted watchdog controls into `WatchdogEntry`; the frozen `Registry` port
   and `SeatDescriptor` remain unchanged.
2. Timestamps supplied to `WatchdogEntry::last_activity_at_secs` and
   `WatchdogService::tick` use the same seconds-based clock. Core compares them
   but does not read or interpret wall time.
3. The later adapter persists `WatchdogControl::reconciled` and
   `WatchdogControl::after_working_transition` results. Core deliberately does
   not hide writes inside `tick`.
4. `NudgeReason::OverdueIdle` is the only scheduler verdict this unit computes.
   Ordinals, delivery copy, and second-silent-response classification belong to
   later stateful coordination, not this pure scheduling table.
5. Card freshness and anomaly staleness remain independent clock decisions. This
   unit only suppresses outbound nudges for parked or controlled seats.
6. `crates/testkit/src/fakes.rs` stayed frozen; this pure tier-1 logic needs no
   fake or local double.
