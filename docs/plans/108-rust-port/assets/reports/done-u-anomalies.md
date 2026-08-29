# Wave 2 done report — u-anomalies

**Seat**: `pij-defensive-parrot` · **PM**: `pij-revolutionary-lungfish`  
**Branch**: `s108/w2-anomalies` · **base**: `b51d928a91ea832dd56c563c36c8df41e5311aed`

## Outcome

`crates/core/src/anomalies.rs` now provides pure synchronous detectors over an
immutable typed `AnomalyView` for:

- `status-stale`
- `delivered-unacked-stale`
- `unverified-done`

Each row carries the measured observable, a runnable remediation command, a
stable source-evidence occurrence identity, and open/acknowledged state. Durable
`anomaly.ack` and `anomaly.clear` event constructors use the existing Spine;
there is no eighth port and no schema migration. A clear dominates later acks
for that occurrence and remains effective until the detector's source sequence
changes.

The status detector keeps the PM's two-axis ruling intact: staleness is strictly
card age `> configured threshold`; `waiting`, `hold`, `blocked`, and `question`
do not suppress the anomaly. Those states suspend watchdog nudging only.
Activity shown in the observable comes only from Spine-derived `ActivityFact`;
`SystemState` is never inferred to be activity.

## Contract deviations and consumers

The packet's `delivered-unacked` spelling was wrong. Per the PM's D6 ruling and
req-0002 parity, the implementation preserves the live TypeScript consumer's
`delivered-unacked-stale` spelling.

Existing consumers: the unscoped anomaly surface and alert sweep; the PM observed
live `unverified-done` rows against wave-1 coders. Intended disposition consumer:
**u-cli**, which will append the core-produced ack/clear events. No fourth
detector was added.

## Persistence proof

`crates/store/tests/anomaly_dispositions.rs` uses a real `FreshStore` and
`SqliteSpine`, closes and reopens SQLite after acknowledgement and again after
clear, then proves:

1. acknowledgement survives reopen and renders `Acknowledged`;
2. clear survives reopen;
3. rescanning unchanged evidence stays clear;
4. a new card source sequence opens a new occurrence.

Command:

```text
PATH="$HOME/.cargo/bin:$PATH" CARGO_TARGET_DIR=/tmp/pij-w2-anomalies-target CARGO_INCREMENTAL=0 cargo test --locked -p pij-store --test anomaly_dispositions
```

Result: `1 passed; 0 failed`.

Core detector command:

```text
PATH="$HOME/.cargo/bin:$PATH" CARGO_TARGET_DIR=/tmp/pij-w2-anomalies-target CARGO_INCREMENTAL=0 cargo test --locked -p pij-core anomalies
```

Result: all anomaly tests passed. The canonical gate later ran the full workspace
and reported eight `pij-core` unit tests and the SQLite persistence test green.

## Mutation evidence

### Status predicate

Mutation: `age_ms <= status_stale_ms` → `age_ms < status_stale_ms`.

```text
cargo test --locked -p pij-core status_staleness_is_clock_only_and_parking_suspends_nudging_not_detection
```

Result: **FAILED for the intended boundary property**:

```text
the contract is older than ten minutes, not ten minutes old
test result: FAILED. 0 passed; 1 failed
```

Restored predicate: targeted tests and the full gate passed.

### Clear matching

Mutation: replace exact occurrence lookup
`cleared.contains(&row.occurrence)` with
`cleared.contains("mutated-occurrence")`.

```text
cargo test --locked -p pij-core cleared_occurrence_stays_cleared_until_source_evidence_changes
```

Result: **FAILED for the intended clear property**:

```text
assertion failed: StatusStaleDetector.scan(&cleared).is_empty()
test result: FAILED. 0 passed; 1 failed
```

Restored exact matching: targeted tests, the reopen persistence test, and the
full gate passed.

## Canonical Rust gate

```text
PATH="$HOME/.cargo/bin:$PATH" \
CARGO_TARGET_DIR=/tmp/pij-w2-anomalies-target \
CARGO_INCREMENTAL=0 \
cargo run --locked -p pij-testkit --bin pij-gate
```

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

The gate included `crates/store/tests/anomaly_dispositions.rs`: `1 passed; 0
failed`. `git diff --check` was empty after restoration. Immediately after the
gate, status named only the three intended source/test changes; this receipt was
added afterward. No lockfile or generated fixture mutation occurred.

## Engineering-harness result

`harness boot` and the required `harness checks` were also attempted. Both fail
on the pre-existing Node-tooling absence recorded by wave 0, not on this Rust
diff: every TypeScript sensor reports `tsx: command not found` (typecheck, lint,
test, windows-compat, smoke, pkg-audit, snapshots). The Rust definition of done
for plan 108 is the all-green `pij-gate` above. This harness difficulty was
captured with `harness observe`.

## Toolchain and disk

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
1.98.0-aarch64-apple-darwin (overridden by '/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-anomalies/rust-toolchain.toml')
/dev/disk3s5   1.8Ti   1.6Ti   244Gi    87%   /System/Volumes/Data
```

## Composition recipe

**N/A by PM ruling D8.** This unit is pure core logic, not a real adapter; there
is no `AdapterChoice::Real` refusal or daemon match arm to replace. The future
composition edge builds `AnomalyView` from Registry/Spine snapshots and invokes
`scan_all`.

## Shared-merge and derived files

Shared-merge file touched:

- `crates/core/src/lib.rs` — one `pub mod anomalies;` line.

No dependencies, migrations, `Cargo.lock`, architecture allow-list rows, or
derived architecture fixtures changed. `crates/testkit/src/fakes.rs` and
`crates/core/src/error.rs` remained frozen as allocated by the PM.

## Assumptions

1. Persisted cards supplied to detection have `Card.seq = Some`; a card without a
   durable source sequence is omitted because it cannot support stable clear
   identity.
2. The composition edge validates and decodes dispatch id, packet SHA, activity,
   and done/verification projections. Detectors never parse registry guesses.
3. A verification only satisfies a done claim when `verified_seq > done_seq`;
   an older verification does not bless a later claim.
4. Clear is terminal for one occurrence. A later ack of that same occurrence
   cannot reopen it; only changed detector source evidence creates a new row.
5. Threshold defaults preserve the existing surface (10 minutes for cards, 15
   minutes for delivered-unacked), but thresholds are values on every view and
   therefore caller-configurable policy, not embedded detector constants.
