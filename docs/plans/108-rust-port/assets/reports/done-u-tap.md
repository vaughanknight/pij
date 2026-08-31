# Done — u-tap pane observer

**Coder**: `pij-unpleasant-silkworm`  
**PM**: `pij-revolutionary-lungfish`  
**Implementation head before this report**: `e006ba9e`

## Result

The missing producer now exists as `pij_daemon::pane_observer::PaneObserver`. It observes only pane ids owned by registered seats, attaches one tmux output tap per pane, drains raw bytes, captures the rendered composer with a measured cursor pair, and feeds `InteractionGate` without turning absence into permission.

R3-AMEND-6 widened the existing `TmuxPort`—not a beside-the-port concrete API—with exactly four ratified items:

1. `Pane::{cursor_x,cursor_y}: Option<u32>`, zero-based and meaningful only as a pair;
2. `attach_pane_tap(pane, caller_owned_sink) -> Result<()>`;
3. `drain_pane_tap(pane) -> Result<Vec<u8>>`, where empty means attached-and-quiet and unattached is `Err`;
4. `detach_pane_tap(pane) -> Result<()>`, with an already-gone pane treated as the successful terminal outcome.

`TmuxAdapter`, `FakeTmux`, the shared contract, every pane constructor, parser fixtures, and adapter tests carry the amendment. The fake records attach/drain/detach; `fake_tmux_honours_the_shared_contract` asserts every recording.

## What happens when the observer cannot tell

**Unknown blocks.** This is true at boot, after a registry/list/capture/drain error, when either cursor coordinate is absent, when the composer layout is unrecognised, and when tap activity makes the cursor snapshot potentially stale.

`InteractionGate::record_unknown(pane)` removes any prior clear state. The transition test `a_clear_observation_can_return_to_unknown_and_block` proves that stale permission does not survive an inability to see.

The observer drains the tap both before and after capture. If bytes arrive while a capture is being made and that capture appears blank, it records unknown rather than clear; one later quiet pass must corroborate the blank composer. Removing that second check can only permit more injections, never choose a different target: it is a one-directional **brake**, not policy.

## Decision table and first-sight policy

| Observation | Gate state | Delivery consequence |
|---|---|---|
| no observation / missing cursor / unknown layout / dependency error | unknown | blocked |
| positively recognised nonblank composer | interaction active | blocked |
| positively recognised nonblank → blank transition on a quiet pass | composer cleared | permitted only if tmux `pane_in_mode` is also clear |
| unchanged nonblank composer, however old | interaction active | blocked |

The TypeScript 60-second first-sight release was deliberately **not ported**. Age cannot distinguish a parked draft from a human paused mid-thought. A stale nonblank composer therefore remains blocked until a positively observed clear transition. No threshold was invented to make the pointer rung reachable.

`record_enter` was clean-cut renamed `record_composer_cleared`: nonblank → blank proves that the composer cleared, not that Enter caused it. Enter, cancel, and deletion are intentionally indistinguishable.

## Required transient-failure loop proof

COMMON §1.3 is covered by the long-lived-loop test named exactly:

```text
observer_loop_survives_one_tmux_error_and_processes_the_next_pane
```

It starts the spawned observer loop, scripts the first attached pane’s `drain_pane_tap` to return a transient adapter error, then proves the next registered pane is still drained, captured, and moved to a clear gate state. Assertions read both fake drain recordings. This drives `PaneObserver::start` and its loop; it does not call `observe_once` by hand.

## Real-pane proof

Command:

```text
CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=/tmp/pij-w5-u-tap-target \
  cargo test --locked -p pij-daemon pane_observer -- --nocapture
```

Observed: 6 pane-observer tests passed, including `real_tmux_pane_observation_blocks_on_a_visible_composer`. That test creates an entropy-named detached real tmux session, lists its real cursor facts, attaches the real output tap, draws an OMP-shaped visible composer through tmux, runs the observer, and proves the shared `InteractionGate` blocks. `Drop` owns isolated-session teardown.

The real adapter proof `pane_tap_drains_each_raw_byte_once_and_detaches_cleanly` separately proves raw bytes are returned once, a quiet attached tap is empty, unattached is error, and detach removes the 0600 sink. The first full gate exposed a real timing defect in this test: a fixed 100 ms sleep sometimes drained before tmux’s pipe process delivered bytes. The test now waits for the named bytes and two quiet drains, bounded at 2 seconds; the targeted test and final gate pass.

## Mutation transcript

Mutation: replace the unknown gate’s

```rust
.is_some_and(|state| !state.tap_active && !state.composer_non_empty)
```

with

```rust
.map_or(true, |state| !state.tap_active && !state.composer_non_empty)
```

Command:

```text
cargo test --locked -p pij-harnesses unknown_observation_blocks_injection
```

Observed RED:

```text
test interaction::tests::unknown_observation_blocks_injection ... FAILED
one clear detector cannot authorize injection before the other has observed the pane
test result: FAILED. 0 passed; 1 failed
```

After the anchored restoration, the same named test passed: `1 passed; 0 failed`.

## Six-stage gate

Environment:

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
/dev/disk3s5: 201 GiB available
CARGO_INCREMENTAL=0
CARGO_TARGET_DIR=/tmp/pij-w5-u-tap-target
```

Command:

```text
cargo run --locked -p pij-testkit --bin pij-gate
```

Final observed verdict:

```text
toolchain PASS  rustc 1.98.0 == pin
lock      PASS  Cargo.lock matches the manifests, and the tree
fmt       PASS  cargo fmt
clippy    PASS  cargo clippy
test      PASS  cargo test
arch      PASS  8 crates, 0 violations
pij-gate: all stages green
```

The earlier gate RED from the fixed-delay real-tap test is disclosed above; it was not suppressed or called flaky.

### Repo-wide engineering harness receipt

`harness checks` was also attempted. The first attempt reported all eight sensors as exit 127 because this linked worktree had no `node_modules`. After linking the canonical main-checkout dependencies, four sensors passed (`local-paths`, `typecheck`, `pkg-audit`, `snapshots`) and four unrelated baseline sensors remained red:

- `lint` and `windows-compat`: existing generated architecture JSON contains formatting/path drift from `s108-w4-spawn`;
- `test`: npm 11.5.1 emits the repository’s unknown `min-release-age` config warning on stderr, while existing flow-pair subprocess tests require empty stderr;
- `smoke`: timed out during third-party package clone/install in the fresh worktree.

No u-tap Rust path appears in those diagnostics. The worktree bootstrap gap was captured as harness observation `DL-001`; these reds are disclosed, not suppressed. The wave packet’s Rust `pij-gate` definition of done is green above.

## Composition recipe

The unit ships the recipe, not composition-root wiring. `crates/daemon/src/lib.rs` contains only the shared-merge `pub mod pane_observer;` line for this unit.

Before key publish, after constructing the shared interaction gate:

```rust
use pij_daemon::pane_observer::PaneObserver;

let pane_observer = Arc::new(PaneObserver::new(
    Arc::clone(&services.registry),
    Arc::clone(&services.tmux),
    Arc::clone(&interaction),
    state_dir.join("pane-signals"),
    Duration::from_millis(config.pane_observer_interval_ms),
)?);
```

After key publish:

```rust
let pane_observer = pane_observer.start();
```

Add `pane_observer: PaneObserverLoop` to `Daemon`. Shutdown order is HTTP first, then the delivery loop, then `pane_observer.shutdown().await`, then unrelated workers. `shutdown` joins an in-flight observation and detaches every tap before returning.

Config field: `pane_observer_interval_ms: u64`; default `600`, preserving the measured TypeScript daemon cadence. It is independent of `delivery_interval_secs` because observation and delivery are different schedules (E-028).

## Shared-merge and derived files

Shared/frozen-amendment files touched:

- `crates/core/src/ports.rs` — ratified R3-AMEND-6 methods;
- `crates/core/src/model.rs` — ratified optional cursor pair;
- `crates/core/src/config.rs` — dedicated observer cadence;
- `crates/daemon/src/lib.rs` — one `pub mod pane_observer;` line only;
- `crates/testkit/src/{fakes,contract}.rs` — mechanical implementer and shared proof updates.

No crate manifest, root manifest, architecture allowlist, fixture manifest, derived architecture snapshot, or `Cargo.lock` changed.

## Assumptions and explicit limits

1. Only registered seat pane ids are tapped. Unregistered shells and unrelated tmux panes are not observation targets.
2. Recognised layouts are OMP/Pi inline composers, Claude/wide-Copilot prompt regions between plain rules, and narrow-Copilot prompt regions with a recognised footer. Any other layout is unknown and blocks.
3. Cursor X and Y are consumed only as a pair. Missing or malformed coordinates are never fabricated as `(0, 0)`.
4. Tap sinks can contain pane output. The real adapter creates or re-secures them at mode 0600 and removes them on clean detach.
5. A pre-existing tmux output pipe is refused rather than replaced. After an unclean daemon death, an orphan pipe can therefore leave that pane unknown until the pipe is cleared; safety is preserved, automatic orphan-pipe recovery is not claimed.
6. A crash can leave a 0600 sink file. Clean shutdown removes owned sinks. Orphan-file sweeping is not implemented by this unit because filename age or residue cannot prove pipe ownership.
7. The observer starts unknown and its first poll waits one configured interval. The pointer rung remains conservatively blocked until composition starts the observer and it obtains a positive reading.
