# Wave 6 receipt — u-bounce

## Result

`pij-rs daemon bounce` is a shipped nested verb. It refuses an unreproducible checkout, builds the release artifact, announces to active local seats, corroborates the daemon's `(pid, proc_start)`, drains and restarts it, distinguishes an auth-enforcing health response from an empty port, and prints the build reported by the restarted daemon.

Implementation commit before this receipt: `b917898494f4e7c9656d148875e0c3550df70e24` (`feat(daemon): add safe bounce lifecycle`).

## Defects found and repaired

1. `Daemon::shutdown` signalled HTTP and awaited the whole HTTP drain before signalling any worker. Queue workers could keep dequeuing throughout that wait. It now polls HTTP, delivery, pane observation, and federation shutdowns together; every shutdown future sends stop before awaiting its join.
2. `TickLoop` used an unbiased `tokio::select!`; a ready tick could beat a simultaneously ready stop. Stop is now the first arm of a `biased;` select.
3. The federation worker could choose wake/sleep while stop was ready, then enter `process_one()` without checking stop. Its idle select is stop-biased and every loop checks stop before claiming.
4. No process-control identity existed. Boot now writes `daemon.runtime.json` after winning the bind and before publishing `daemon.key`, carrying both pid and proc-start plus the resolved bind, machine alias, and offline launch mode. Bounce corroborates both identity fields before signalling. A pid alone is never trusted; using tmux instead would have been an unaudited guess.
5. The PRD required a pre-bounce announcement; the packet omitted it. The verb lists the roster, corroborates each local seat's complete process identity, sends the notice before signalling, and reports every best-effort outcome.
6. The packet required dirty and divergent refusal, but `HEAD != origin/main` cannot observe dirt. The preflight reports those facts separately and performs no build or process action after either refusal.
7. The point-of-no-return comment was false: `TickLoop::start` could reject a zero interval after key publication. `TickInterval::new` now validates before publication; `TickLoop::start_validated` starts infallibly afterward, so no pre-publish worker can mutate queue state for a daemon that never serves.

## Deterministic proof

### Refusal

The actual built binary was run from the dirty feature worktree:

```text
pij daemon bounce: FAILED — pij daemon bounce: refusing bounce: the checkout is dirty; commit or remove tracked and untracked changes
exit 1
```

`bounce::tests::dirty_and_divergent_are_named_as_different_refusals` independently constructs a real Git repository and proves the dirty and `HEAD != origin/main` branches separately. `clean_head_equal_to_origin_main_is_reproducible` proves the positive case.

### Drain and no-post-signal dequeue

- `lifecycle::tests::shutdown_drains_the_tick_already_in_progress`: an accepted tick blocks shutdown until released.
- `lifecycle::tests::shutdown_wins_when_stop_and_next_tick_are_both_ready`: 64 selects each receive a ready stop and ready tick; zero ticks start.
- `federation::tests::a_worker_started_with_stop_already_set_never_claims`: a queued remote row remains unclaimed and has no retry/network outcome.
- `federation::tests::shutdown_wins_when_wake_and_stop_are_both_ready`: 64 live worker races leave their rows pending.

Mutation transcripts:

1. Removed `biased;` from the shipped `run_ticks` wrapper. The simultaneous-ready test failed: `left: 25`, `right: 0` post-stop ticks. Restored it; the test passes.
2. Removed the federation loop's pre-claim stop check. The first assertion (`live_len == 1`) passed because a claim followed by retry leaves one live row — a weak witness caught before receipt. The test was corrected to observe `queue.retried()`. Re-running the same mutation then failed with `a retry proves the stopped worker claimed and performed network IO`. Restored it; the test passes.

### Health distinction

`bounce::tests::unauthenticated_401_is_distinct_from_no_listener_and_wrong_status` drives the shipped probe against three real sockets:

- `/health -> 401`: `Enforcing`.
- `/health -> 200`: `Unexpected(200)`.
- no listener: `Absent`, never success.

### Real shipped-binary bounce

A clean clone whose `HEAD` and `origin/main` were both `b9178984` built `target/release/pij-rs`. A real daemon ran with a fresh dev state directory and `127.0.0.1:17461`; the same artifact executed the nested verb:

```text
pij daemon bounce: ok — {"version":"pij-rs 0.1.0","addr":"127.0.0.1:17461","announcements":[]}
```

Independent post-bounce observations:

```text
GET http://127.0.0.1:17461/health without auth -> 401
pij ping: ok — {"build":"pij-rs 0.1.0","machine":"JordansacStudio.localdomain","offline":false,"status":"healthy"}
daemon.runtime.json -> pid 2761, proc_start 20260830154636, addr 127.0.0.1:17461
ps pid 2761 -> Sun Aug 30 15:46:36 2026
```

The version comes from authenticated health on the process just launched, not from builder metadata.

## Gate and environment

Command:

```text
CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=/tmp/pij-w6-bounce-target \
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

Disk at final gate: `/dev/disk3s5`, 1.8 TiB total, 112 GiB available, 94% capacity.

`harness checks` was not run: COMMON states the Node harness cannot run in these worktrees and directs coders to disclose rather than chase it.

## Composition recipe

```rust
use pij_cli::bounce;

let repo = bounce::reproducible_repo(&std::env::current_dir()?)?;
let report = bounce::run(&repo, &state_dir).await?;
```

`run_daemon` calls `pij_daemon::boot`; boot writes `DaemonRuntime` between bind and key publication. The daemon command remains backward-compatible: bare `pij-rs daemon` runs foreground, while `pij-rs daemon bounce` runs the lifecycle action. Shutdown signals HTTP and all three workers before their joins complete. Delivery and federation finish accepted work and start no claim after stop.

## Shared-merge and derived files

- `Cargo.lock` — regenerated and committed before the successful locked gate.
- `crates/cli/Cargo.toml` — reuses `pij-harnesses::ProcLiveness` rather than duplicating process-start parsing.
- `crates/testkit/arch-allowlist.toml` — permits and explains that composition-root edge.
- `crates/testkit/fixtures/arch/{clean,drifted}-metadata.json` — regenerated from live metadata; drift fixture re-plants exactly `tokio` in core and `mockall@dev` in store.
- `crates/daemon/src/pointer/worker.rs` — mechanical test callsite conformance to the owned validated-interval signature.

## Assumptions

- The supported runtime is macOS/Linux, matching `ProcLiveness`; `kill -INT` is available on that same platform set.
- Bounce is invoked from the canonical clean main checkout. It does not fetch or repair refs because either action would mutate the fact it judges.
- The spawned child inherits no terminal input and appends stdout/stderr to `<state-dir>/daemon.log`.
- Runtime records are residue after process exit. Readers never equate presence with liveness; they corroborate both pid and proc-start. Leaving the record avoids an old daemon deleting a successor's freshly published identity during a port-release race.
- Announcement failure is output, not a gate. Build, process identity, signal, relaunch, health, and version failures refuse the bounce.
