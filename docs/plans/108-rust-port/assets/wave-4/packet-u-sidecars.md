# Coder packet — u-sidecars (wave 3)

**Spawn form (pinned, Jordan)**: `pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast --effort high --layout window`
— OMP harness, never the copilot CLI harness, and **its own tmux window, never a
split pane**.
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w3-sidecars` · branch `s108/w3-sidecars`
**Common contract (read FIRST)**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-3/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

Three job consumers over ports that already exist: the Telegram bridge, the `bg`
runner, and `chore`. None of them needs a new port — if you reach for one, stop
and ask.

## Scope

* `crates/daemon/src/sidecars/**` — new.
* `crates/daemon/src/lib.rs` — **only** the `pub mod sidecars;` line.
* your tests, allow-list rows, derived files.

## What to build

1. **Each sidecar is a queue consumer plus a port.** The queue's semantics are
   already yours to rely on: dedupe over live rows, per-entity serial keys, a
   configured terminal lease that never auto-requeues (retry is an explicit new
   enqueue).
2. **`chore run` NEVER advances a baseline; only `ack` does.** This is the whole
   point of chore: an un-relayed delta must re-surface rather than vanish. It is a
   decision-table test, and the asymmetry is the assertion.
3. **A failing probe reports `NOT-PROBEABLE` and stays in the roster.** A probe
   that disappears when it breaks is a probe that lies by omission.
4. **Identity is DERIVED, never asserted from the environment.** A sidecar asks
   who it is (`whoami`-shaped), it does not read `PIJ_*` and believe it — that is
   the seat-asserted-not-derived doctrine, and it is the same root as defect #19
   (subagents inheriting env and registering as seats).
5. **The Telegram bridge is a RELAY**: its idleness is correct by design, it is
   never watched, and a nudge into it becomes a real message on somebody's phone.
   `SeatDescriptor.relay` already exists and `nudgeable()` already honours it —
   consume that, do not re-derive it.

## Done bar

* Gate green; fixture-driven consumer tests per sidecar.
* The chore run/ack asymmetry decision table; the NOT-PROBEABLE path asserted.
* **Mutation evidence** on the run-does-not-advance-baseline rule — make `run`
  advance it, watch the named test fail, restore.
* Report committed and pushed before the done message.
