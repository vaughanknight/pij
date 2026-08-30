# u-spawn — completion report

## Result

`pij-rs spawn` now sends an authenticated `POST /v1/spawn`. The daemon resolves the target tmux session, refuses roster collisions, builds per-harness discrete argv through `pij-harnesses`, observes `TmuxPort::new_window`, and only then persists a pre-bind descriptor. `cross_session_inbound_accept` is `Some(true)` only when the exact Claude accept-settings pair was present in the argv passed to tmux; an observed spawn without that pair stores `Some(false)`.

Registration now fills launcher-known `spawn_id`, `model`, `provider`, and `effort` only when absent. A child self-declaration cannot overwrite launcher evidence.

## Toolchain and capacity

- `rustc 1.98.0 (88d9e12ae 2026-08-18)`
- `cargo 1.98.0 (797e8a9bc 2026-08-05)`
- Available disk before final gate: `212 GiB` on `/System/Volumes/Data`
- `CARGO_INCREMENTAL=0`
- `CARGO_TARGET_DIR=/tmp/pij-w4-spawn-target`

## Gate

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

The first gate run was intentionally not hidden. It found three actionable reds: the regenerated lock had not yet been committed, three boolean assertions violated clippy, and the committed architecture fixtures did not yet carry the new CLI dev-only edges. The lock was committed, assertions corrected, and both architecture fixtures regenerated from the tree with exactly the original `pij-core -> tokio` and `pij-store -> mockall@dev` violations replanted in the drifted fixture. The next authoritative gate was green.

## Property and mutation proof

Standing property test:

```text
cargo test --locked -p pij-harnesses accept_stamp_is_true_only_when_exact_setting_is_emitted
```

Mutation applied with an anchored edit:

```rust
let cross_session_inbound_accept = true;
```

Observed RED:

```text
spawn::tests::accept_stamp_is_true_only_when_exact_setting_is_emitted ... FAILED
assertion `left == right` failed
  left: true
 right: false
```

After restoring derivation from the exact `--settings` argv pair, the same named test passed. The end-to-end test `shipped_cli_spawns_both_capability_rows_through_real_registry` also passed and observed both rows through the shipped `pij-rs` binary, authenticated daemon router, injected tmux recorder, and real SQLite registry.

## Linked-worktree refusal proof

From this linked worktree:

```text
pij spawn: FAILED — spawn: refusing pi spawn from linked worktree /Users/jordanknight/pi-hacking/pij-worktrees/s108-w4-spawn: global and project extension links collide and the peer dies before registration — spawn from the main checkout and cd afterwards
```

The detector uses resolved `git rev-parse --git-dir` components and covers both Pi and Omp before daemon client setup or launch.

## Shipped-binary smoke

A real `pij-rs daemon` was started on `127.0.0.1:17641` with real adapters and an isolated state directory and tmux session. A real Claude launch was then issued through the shipped binary:

```text
pij-rs ... spawn --id pij-w4-live-diagnostic --harness claude \
  --bin /Users/jordanknight/.local/bin/claude \
  --cwd /Users/jordanknight/pi-hacking/pij-worktrees/s108-w4-spawn \
  --session pij-w4-spawn-smoke --name spawn-diag --accept-inbound
```

Observed response:

```json
{"ok":true,"command":"pij spawn","v":1,"data":{"id":"pij-w4-live-diagnostic","harness":"claude","pane":"%911","proc":null,"folder":"/Users/jordanknight/pi-hacking/pij-worktrees/s108-w4-spawn","state":"idle","semantic_state":null,"role":null,"parent":null,"relay":false,"cross_session_inbound_accept":true,"spawn_id":"s-e02a7b19123722d76f2b4c8f74dabce9"}}
```

Independent tmux observation:

```text
pane_dead=0
pane_start_command=/Users/jordanknight/.local/bin/claude --dangerously-skip-permissions --settings "{\"crossSessionInbound\":\"accept\"}"
```

The pane visibly reached Claude Code 2.1.251 readiness with bypass permissions on. The isolated daemon and tmux session were then stopped and removed.

Two smoke reds are disclosed. The first daemon launch used a deliberately narrowed PATH that omitted `/opt/homebrew/bin`, so `/v1/spawn` returned the named tmux installation/PATH error and persisted no row. After correcting PATH, the first Claude pane returned from tmux but exited before the follow-up observation; a second launch with `remain-on-exit` enabled proved the identical argv reached a live Claude pane. The route's settled contract is observed tmux creation, not harness readiness; binding/readiness remains the later registration path.

## Composition recipe

```rust
use pij_core::ports::LaunchCommand;
use pij_harnesses::{SpawnPlanInput, build_spawn_plan};

let plan = build_spawn_plan(SpawnPlanInput {
    harness: request.harness,
    executable: request.executable,
    model: request.model,
    resolved_provider: None,
    effort: request.effort,
    accept_inbound: request.accept_inbound,
})?;
let command = LaunchCommand {
    executable: plan.executable,
    args: plan.args,
};
let pane = services
    .tmux
    .new_window(&session, &name, &cwd, Some(&command))
    .await?;
// Only after the observed pane:
descriptor.cross_session_inbound_accept = Some(plan.cross_session_inbound_accept);
registry.put(descriptor).await?;
```

The public `build_spawn_plan` rustdoc carries the same recipe. `crates/daemon/src/lib.rs` was not edited.

## Shared-merge files touched

- `Cargo.lock` — regenerated and committed before the gate, as required by the lock-vs-tree sensor.
- `crates/cli/Cargo.toml` — test-only real-store/router proof edges.
- `crates/testkit/arch-allowlist.toml` — reviewed `pij-store@dev` and `axum@dev` edges for the CLI proof.
- `crates/harnesses/src/lib.rs` — exports the spawn planner.
- `crates/testkit/fixtures/arch/clean-metadata.json` — regenerated from the current workspace.
- `crates/testkit/fixtures/arch/drifted-metadata.json` — regenerated, then the two original forbidden edges replanted with asserted targets.

`fixtures/MANIFEST.toml` was not touched because this unit added no static fixture bytes.

## Assumptions and boundaries

- `--id` is required and explicit. Memorable default allocation belongs to the planned `u-names` unit; this unit does not port or simplify its curated generator.
- `spawn_id` is `s-` plus 32 lowercase hexadecimal characters from 128 bits of OS randomness.
- Provider remains `None` unless a future caller supplies a genuinely resolved provider to `SpawnPlanInput`; this route does not infer one from a selector.
- Only a plan built and executed by `/v1/spawn` stores `Some(true)` or `Some(false)`. Adopted/imported/self-registered seats remain `None`.
- `--accept-inbound` is refused for every non-Claude harness.
- A successful `TmuxPort::new_window` returning a parsed pane is the settled launch observation. Spawn does not claim the harness is ready or bound; `proc` remains `None`, so routing queues with `QueueReason::PreBind` until registration corroborates it.
- The daemon serializes collision-check, launch, and registry write because `Registry::put` is an upsert. A registry-write failure triggers pane rollback.
- `--session` absence requires `$TMUX_PANE`; the daemon resolves that pane through `TmuxPort::list_panes` and never guesses a session.
- `harness boot` remains an unrelated known red in these Rust worktrees because Node dependencies are intentionally absent. Per PM ruling, no `npm ci` was run; `pij-gate` is authoritative.
- `lean-ctx` was unavailable and Flowspace rejected the user config schema. Native file reads and repository search were used, per PM ruling.
