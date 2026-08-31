# Coder packet — u-extension (wave 3)

**Spawn form (pinned, Jordan)**: `pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast-1m --effort high --layout window`
— OMP harness, its own tmux window, never a split pane. **1m tier by tiering rule
(b)**: you read a large TS surface against a new wire.
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w3-extension` · branch `s108/w3-extension`
**Common contract (read FIRST)**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-3/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

**This is the one TypeScript unit in the wave.** COMMON's Rust gate still applies
to the workspace (your changes must not break it), but your own proof is different
and § Done bar says how.

## Mission

Make the in-process pi/OMP extension speak `pij-rs`. Today it speaks the TS
daemon's wire; the Rust daemon answers a different one. Until this unit lands, the
entire Rust port is unreachable from the thing every seat on this machine actually
runs.

## THREE HARD FENCING RULES — read before anything else

1. **Every edit is in THIS WORKTREE's `.pi/extensions/pij/**` and nowhere else.**
   The canonical checkout's copy (`/Users/jordanknight/pi-hacking/pij/.pi/**`) is
   the LIVE surface every seat on this machine runs from — including the daemon,
   which runs `tsx` off canonical source with no hot reload. Treat canonical
   `.pi/**` as **radioactive**: do not edit it, do not `cp` into it, do not point a
   test at it.
2. **The both-hosts matrix proof runs against a THROWAWAY daemon and store**,
   never the live one. A test that registers against the live daemon puts a fake
   seat in the roster every seat on this machine reads.
3. **You may not restart, stop, or reconfigure the live daemon.** If you believe
   you need to, that is a stop-and-ask.

Breaking any of these can take down every agent on this machine, including the PM
you would use to report it.

## Scope

* `.pi/extensions/pij/**` — in this worktree only.
* `crates/testkit/fixtures/wire/**` + `MANIFEST.toml` — recorded pij-rs daemon
  responses you test against (index them; another unit will cite them).
* your transcripts under `docs/plans/108-rust-port/assets/reports/`.

## What to build

1. **Speak the new envelope over localhost HTTP with the bearer key.**
   `{ok, command, v, data, meta}`; the key is per-boot, 0600, read from
   `<state-dir>/daemon.key`. Auth is on every route including `/health`.
2. **Generation detection at connect, from the Hello line / envelope `v`.**
   An old daemon gets the old wire; a new daemon gets the new one. **Refuse
   silently-degraded operation**: no daemon at all is a LOUD failure, and a
   wrong-generation daemon is a NAMED error that says which generation was found
   and what to do. A silent fallback is how a fleet runs for a day on a wire
   nobody meant to use.
3. **Registration carries `(pid, proc_start, spawnId)`** so descriptor
   reconciliation is structural rather than a later guess. Those fields exist on
   `SeatDescriptor` as of wave 2 (`spawn_id`, and liveness identity is the
   `(pid, proc_start)` pair — a pid alone is not an identity, and u-orchestration's
   equivalence merge depends on you sending both).
4. **Unknown event kinds are forwarded, not dropped** (R7). The Rust daemon emits
   a deliberate forward-compat probe kind; your consumer must survive it.

## Done bar

Your unit's proof is a MATRIX, not a single run.

* **The same extension build boots in BOTH hosts** — plain `pi` AND `omp` —
  registers with bind evidence, receives a pushed turn, and replies. **One
  committed transcript per host**, under
  `docs/plans/108-rust-port/assets/reports/`, showing the host, the daemon
  generation detected, the registration payload, and the round trip.
* Contract tests against **recorded** pij-rs daemon fixtures (the corpus `wire/`
  directory) — so the wire is proven without a live daemon.
* The wrong-generation and no-daemon paths each produce their named error, tested.
* `cargo run --locked -p pij-testkit --bin pij-gate` still six-stages green: your
  changes must not break the Rust workspace even though they are not in it.
* **Mutation evidence** on the generation detection: make it accept a wrong
  generation, watch the named test fail, restore. Transcript in the report.
* Report committed and pushed before the done message (COMMON § 5).

## Watch for

* The TS extension is the reason `#19` exists (subagents inheriting `PIJ_*` and
  registering as seats). `core::admission` now decides admission and u-harness
  feeds it; your registration must supply the evidence that decision needs, not
  re-implement the decision.
* `pij whoami` knows facts the registry row historically lacked. If you can send a
  fact at registration that the daemon would otherwise have to guess, send it.
