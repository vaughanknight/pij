# Wave 2 done report — u-report

**Coder**: `pij-identical-wolf`  
**PM**: `pij-revolutionary-lungfish`  
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-report`  
**Branch**: `s108/w2-report`

## Result

`pij-core::report::ReportService` now provides:

- durable `now(did, next)` cards over the existing `Spine`;
- independent 280-character limits after Unicode whitespace collapse;
- `done`, `blocked`, `question`, and `clear` state verbs;
- Registry-first authoritative state followed by Spine note/history;
- an explicit truthful error when the state lands but its note/history append fails;
- latest-card reads preserving absent versus present-empty;
- injected-clock freshness with a configured threshold, strict `>` comparison, and backwards-clock saturation.

No report table or migration was added. Cards use the existing append-only Spine, avoiding parallel truth.

## Toolchain and disk

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
/dev/disk3s5   1.8Ti   1.6Ti   242Gi    87%   /System/Volumes/Data
```

Required environment:

```text
CARGO_TARGET_DIR=/tmp/pij-w2-report-target
CARGO_INCREMENTAL=0
PATH=$HOME/.cargo/bin:$PATH
```

## Behavioral proof

Focused command:

```text
cargo test --locked -p pij-core --test report
```

Result:

```text
ok: 6 pass, 0 fail, 0 skip
```

The six tests at `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-report/crates/core/tests/report.rs` prove:

1. both card fields at post-collapse lengths 279, 280, and 281, plus multibyte character counting;
2. absent card versus a present card whose `did` is empty;
3. staleness immediately below, exactly at, and immediately above the configured threshold, plus a backwards clock;
4. state visibility, correction, completion, clearing, and independent Spine history;
5. the ruled partial failure: Registry state landed, Spine note did not, and the returned error names both facts and preserves the real adapter words;
6. malformed latest-card payloads report an error instead of making the card disappear.

## Mutation transcripts

### Limit comparison

Mutation in `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-report/crates/core/src/report.rs`:

```text
len > CARD_LIMIT  ->  len >= CARD_LIMIT
```

Command:

```text
cargo test --locked -p pij-core --test report card_fields_enforce_279_280_281_after_whitespace_collapse -- --exact
```

Observed failure:

```text
test card_fields_enforce_279_280_281_after_whitespace_collapse ... FAILED
did at boundary must fit: ReportTooLong { len: 280, limit: 280 }
test result: FAILED. 0 passed; 1 failed
```

Restored `>`; the complete focused suite returned 6 passed.

### Staleness comparison

Mutation in `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-report/crates/core/src/report.rs`:

```text
age_ms > stale_after_ms  ->  age_ms >= stale_after_ms
```

Command:

```text
cargo test --locked -p pij-core --test report stale_is_strictly_past_the_configured_threshold_and_ignores_clock_reversal -- --exact
```

Observed failure:

```text
test stale_is_strictly_past_the_configured_threshold_and_ignores_clock_reversal ... FAILED
left: (600, true)
right: (600, false)
test result: FAILED. 0 passed; 1 failed
```

Restored `>`; the complete focused suite returned 6 passed.

## Six-stage gate

Command from `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-report`:

```text
CARGO_TARGET_DIR=/tmp/pij-w2-report-target CARGO_INCREMENTAL=0 \
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

`git diff --check` produced no output after the gate.

## Composition recipe

Report has no `AdapterChoice::Real` match arm and replaces no wave-0 `not_yet(...)` refusal. It is core logic over the already-composed Registry and Spine ports. The PM adds:

```rust
use pij_core::report::{ReportConfig, ReportService};

let reports = ReportService::new(
    services.registry.as_ref(),
    services.spine.as_ref(),
    clock,
    ReportConfig {
        stale_after_ms: configured_report_stale_ms,
    },
);
```

The clock returns Unix-epoch milliseconds. `configured_report_stale_ms` defaults to ten minutes at the configuration boundary; `ReportService` consumes the configured value and does not consult semantic state when computing freshness.

## Shared-merge files touched

- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-report/crates/core/src/lib.rs` — one `pub mod report;` line.
- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-report/crates/testkit/src/fakes.rs` — PM-granted additive `FakeSpine::script_append_error`, queued and one-shot, with default behavior unchanged.

No `Cargo.toml`, `Cargo.lock`, architecture allow-list, architecture fixture, migration, or composition-root file changed.

## Assumptions

1. Registry `semantic_state` is authoritative. Spine state events are durable note/history records tied to the Registry write by `registry_seq`.
2. The frozen Registry and Spine ports provide no cross-port transaction. Registry-first is ruled. A later Spine failure leaves the state applied and returns `PijError::Adapter` whose message states that the state changed and the note/history did not land.
3. Each of `did` and `next` has its own 280-character post-collapse limit. The limit counts Unicode scalar values, not UTF-8 bytes.
4. Empty normalized card fields are valid because the packet explicitly distinguishes present-empty from absent. No-card remains `None`.
5. A card is stale only when `age_ms > configured threshold`; equality is fresh. A backwards clock produces age zero through `saturating_sub`.
6. Semantic state never changes card freshness. Parking affects watchdog nudging, not staleness display.
7. The ten-minute value in `ReportConfig::default` is a default only; callers may configure the threshold.
8. State notes have no separate length contract in the settled packet. They are whitespace-collapsed and retained losslessly in the Spine event payload.
9. Existing Spine persistence is sufficient; a report-specific SQL table would create a second source of truth.

## Harness observation

`harness boot` could not reach the Rust gate because its configured first stage remains the unrelated TypeScript `just typecheck`, which failed without diagnostic lines. This is the already-recorded wave-0 harness gap; the authoritative plan-108 proof remains `pij-gate`. No `.harness/**` file was touched because it is outside the wave fence.
