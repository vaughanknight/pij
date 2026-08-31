# u-revive-verb — delivery receipt

**Branch:** `s109/u-revive-verb`  
**Code commit:** `d3b6595e`  
**Required mechanism ancestor:** `27a161b1` from `s109/u-spawn-rpc-port`

## Public surface

- `pij-rs revive <id> [--session <tmux>] [--name <name>]` is an explicit Clap verb.
- `DaemonClient::revive` posts `ReviveRequest` to authenticated `POST /v1/revive`.
- `ReviveRequest` carries only the stable id and placement. The route derives harness,
  folder, model, effort, parent and inbound-setting intent from the tombstoned
  descriptor. Those facts describe seat identity or launch intent across
  incarnations.
- The route carries neither `proc` nor `rpc_port_intent`: both describe resources
  held by one incarnation. It delegates allocation, argv construction, launch,
  rollback, stamping and persistence to the single unit-1 `launch_seat` transition
  with `ExistingSeatPolicy { allow_absent: false }`.
- Live and absent are distinct outcomes. A live id refuses by name because revive
  accepts only tombstoned ids. An id with no row returns typed `not_found`, names the
  id, and says revive requires an existing tombstone. Neither launches tmux.

`--attach`, no-id folder resolution and spawn overrides are intentionally absent;
the PM ruled those belong to the separately generated verb-parity backlog, not this
unit.

## Transition proof — observed state, not route success

`crates/cli/tests/revive.rs` runs the shipped binary through the authenticated Axum
router against a real `SqliteRegistry` and recorded fake tmux boundary.

1. Persist a Copilot tombstone with old `rpc_port_intent = 47777`, prior `proc`, pane,
   reason and durable launch fields.
2. Run `pij-rs revive pij-returning-seat --session fleet --name returned`.
3. Read through `Registry::get`: the descriptor is live, pre-bind (`proc = None`),
   has one non-zero fresh port unequal to 47777, and equals the response descriptor.
4. Observe exactly one tmux launch whose argv contains Copilot plus
   `--ui-server --port`.
5. Register the revived seat with the exact fresh `spawn_id`: its own first bind
   preserves the fresh port while adding the process identity.
6. Register again as a later incarnation without a matching `spawn_id`: the port
   becomes `None` immediately. The old 47777 never reappears.
7. Against separate real rows, absent returns `not_found`; live returns `refused`
   with the id and tombstone-only reason; tmux records zero calls.

This two-arm registration witness closes the **coincidence by construction** in the
original acceptance test. That test always registered immediately after a fresh
spawn, so “the launch allocated a port” and “registration preserved the launch
port” could not differ. The added register-again arm makes both directions
observable.

The composed mechanism also preserves the post-mortem this transition replaces.
Before overwriting the live row it publishes a readable spine payload from real
registry truth containing the prior tombstone time, reason, role and semantic state.
The payload is written before the overwrite; an empty event would only relocate the
row-loss defect into unreadable history.

`Registry::tombstone` still has no production caller. The reachable shipped
terminal writer is `pij-rs register --supersedes`, which tombstones its predecessor;
revive consumes an existing tombstone. No direct `Registry::tombstone` test is cited
as proof of a shipped teardown path.

## Pre-registered falsifiers and demonstrated reds

Pre-registration is committed before code at
`assets/reports/u-revive-verb-falsifiers-preregistered.md`. Every mutation ran
unfiltered with Cargo's own exit code, then the source was restored before the next
mutation. Unless noted, the command was:

```text
cargo test -p pij-cli --test revive
```

| Falsifier | Deliberately broken build | Observed discriminating red |
|---|---|---|
| RF1 explicit route | Client posts the narrow body to `/v1/spawn` | exit 101; absent arm got `Adapter` instead of `NotFound`; transition arm reported revive failure |
| RF2 tombstone-only | Invert both route and atomic launch guards | exit 101; live arm failed at “a live id cannot be revived”; tombstoned arm was refused |
| RF3 fresh replacement | Reuse the predecessor port after allocation | exit 101; `left: 47777`, `right: 47777` at “revive must replace the old port” |
| RF4 later-pass ownership | Spawn-id discriminator forced false, then forced true in separate runs | false: exit 101, first bind `None` vs fresh `Some(57711)`; true: exit 101, later incarnation `Some(57740)` vs `None` |
| RF5 real upsert | Remove only `rpc_port_intent=excluded.rpc_port_intent` | exit 101; response carried fresh `54627`, real persisted row retained old `47777` |
| RF6 derived intent | Drop persisted model while deriving the launch request | exit 101; `None` vs `Some("provider/prior-model")` |
| RF7 persisted response | Alter response pane after the durable write | exit 101; response `pane: None` vs persisted `pane: Some("%100")` |

The first pre-code public-surface probe also returned Clap exit 2 with
`unrecognized subcommand 'revive'`. After all mutation restoration, the focused
suite returned exit 0 with both tests passing.

### Own instrument red

The first focused run returned exit 101 because the new test expected FakeTmux's
recorded executable to be `copilot`. The shipped launch plan deliberately executes
`env` and places `copilot` in argv, so the correct record begins
`new_window:fleet:returned:env:`. All preceding descriptor assertions had passed:
response equalled persistence, the fresh non-zero port replaced the old one,
`proc` was absent and the tombstone was cleared. I disclosed the red before
correcting the test to the shipped command shape; it was a test expectation error,
not a product defect.

## Verification

All Rust runs used this worktree's own `target/`; no shared `CARGO_TARGET_DIR`.
Test output was unfiltered and captured to a file before reporting Cargo's direct
exit status.

- `CARGO_INCREMENTAL=0 cargo test --locked -p pij-cli --test revive` — exit 0;
  2 passed, 0 failed.
- `PATH="$HOME/.cargo/bin:$PATH" CARGO_INCREMENTAL=0 cargo run --locked -p
  pij-testkit --bin pij-gate` — exit 0; all six stages passed: Rust 1.98.0 pin,
  lock, fmt, clippy, workspace tests and architecture (9 crates, 0 violations).
- `harness checks` was attempted as the repository-level done gate and returned
  exit 1 with the known linked-worktree Node/tooling limitation: 8 sensors failed
  (`local-paths`, `typecheck`, `lint`, `test`, `windows-compat`, `smoke`,
  `pkg-audit`, `snapshots`); visible codes were 127/2 rather than Rust failures.
  The plan-108 reviewer packet already declares this gate unavailable in these
  worktrees. No green harness result is claimed.

## Migration and ownership

Every pre-existing Copilot seat remains a pointer seat until respawn/revive; neither
a daemon restart nor schema migration creates a launch port. The stamp records
launch intent, not listener possession. Possession and live-process corroboration
remain unit 2's read-time obligation; this unit ships no `can_deliver`-adjacent
reader.

Unit-owned code touches only `crates/cli` and the daemon route/request surface.
`Cargo.lock`, workspace manifests and architecture fixtures are unchanged; the
composer needs no derived-file update for this unit.
