# Wave 1 u-store done report

**Coder**: `pij-rapid-gurgeh` · **PM**: `pij-revolutionary-lungfish` · 2026-08-29

## Delivered

- `Registry` contract enumerates all four frozen operations and proves absent row, SQL NULL, empty string, monotonic writes, exact filters, observable tombstones, revival, and absent-seat refusal against both `FakeRegistry` and `SqliteRegistry`.
- `Spine` contract enumerates both frozen operations and proves empty tail, monotonic append, exclusive cursor, oldest-first ordering, seat filtering, unowned events, opaque kinds, and store-assigned `Event.seq` against both `FakeSpine` and `SqliteSpine`.
- `SqliteSpine::append` now uses the shared `BEGIN IMMEDIATE` write path.
- `SqliteRegistry::put` persists and revives the additive tombstone fields already present in migration 0001. `get` and `list` return the same post-mortem facts.
- Interruption and contention integration tests use file-backed SQLite. Two concurrent writers both complete 32 writes and every registry row joins to its matching spine event.

No composition recipe applies: wave 0 already wired `SqliteRegistry` and `SqliteSpine`; there is no store `not_yet` arm and this unit introduced no new public entry point.

## Baselines

Deferred to `u-sidecars`, wave 4, by the PM's D2 ruling. There is no frozen baseline port, API, type, or schema. Implementing one in u-store would invent either an eighth port or a private contract.

## Schema and migrations

No schema change was required. Migration `0001_init.sql` already owns `seats.tombstoned_at` and `seats.tombstone_reason`; `spine_events.seq` is already AUTOINCREMENT. Existing migrations were not edited, no new migration was created, and `SCHEMA_VERSION` remains 2.

Directional skew remained green:

```text
cargo test --locked -p pij-store --test store_integration an_older_store_is_migrated_forward_rather_than_refused -- --exact
1 passed; older schema migrates forward

cargo test --locked -p pij-store --test store_integration a_store_from_the_future_is_refused_in_the_direction_that_matters -- --exact
1 passed; newer schema is refused
```

## Mutation evidence

### Atomicity rollback

Mutation: split the spine insert out of `Registry::put`'s transaction by using a deferred transaction plus a pool autocommit.

```text
cargo test --locked -p pij-store --test store_registry \
  interrupted_put_rolls_back_both_registry_row_and_spine_event -- --exact

FAILED at crates/store/tests/store_registry.rs:42:
an interrupted write must not leave a spine event for a row that never landed
```

Restored `begin_write` plus `fetch_one(&mut *tx)`:

```text
test interrupted_put_rolls_back_both_registry_row_and_spine_event ... ok
1 passed
```

### NULL versus empty

Mutation: map a SQL NULL `pane` to `Some(String::new())` in `row_to_descriptor`.

```text
cargo test --locked -p pij-store --test store_registry \
  absent_null_and_empty_are_three_distinct_registry_reads -- --exact

FAILED at crates/store/tests/store_registry.rs:78:
SQL NULL must read as None on a present row
left:  pane: Some("")
right: pane: None
```

Restored direct `Option<String>` decoding:

```text
test absent_null_and_empty_are_three_distinct_registry_reads ... ok
1 passed
```

## Contract and focused proof

```text
cargo test --locked -p pij-testkit
30 passed

cargo test --locked -p pij-store
24 passed

cargo clippy --locked -p pij-store -p pij-testkit --all-targets -- -D warnings
OK
```

The existing `every_public_store_operation_rejects_a_stale_schema` regression still enumerates all ten Registry, Spine, and Queue database operations.

## Gate

Environment:

```text
CARGO_TARGET_DIR=/tmp/pij-w1-store-target
CARGO_INCREMENTAL=0
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
Avail: 131 GiB on /System/Volumes/Data
```

Command:

```text
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

## Shared seams and merge files

- Merged PM-owned shared seam commit `4d84eb50`, which adds the additive `SeatDescriptor` tombstone fields and `Event.seq` plus existing literal migrations.
- Authored no dependency, lockfile, allowlist, module-export, or migration changes.
- `crates/testkit/src/fakes.rs` was explicitly allocated to u-store alone for this wave by the D3 ruling.

## Assumptions

1. `tombstoned_at` is the store's monotonic tombstone marker. The frozen `Registry::tombstone` contract supplies no wall-clock value; consumers may test presence and ordering through returned `Seq`, not interpret it as Unix time.
2. `Event.seq` is `None` before append and `Some(store sequence)` on every Spine read. Per the PM's ruling, it is store cursor metadata and must not alter R7's v1 event wire shape.
3. R5 items 3, 13, and 14 — spawn-id equivalence reconciliation plus pane/model/provider/effort bind evidence — belong to `u-harness`/`u-orchestration`; this unit did not widen the frozen Registry port.
4. Baselines remain a wave-4 sidecar concern, not an implicit u-store API.
5. Store concurrency is single-node SQLite. `BEGIN IMMEDIATE` serializes writers; both-success-after-serialization is the ruled outcome. A typed busy outcome would widen the frozen port and is intentionally absent.
