# Coder packet — u-liveness (wave 1)

**Seat model**: `pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast --effort high`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w1-liveness` · branch `s108/w1-liveness`
**Common contract (read first)**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-1/COMMON.md`
**PM**: `pij-revolutionary-lungfish` · **Tier**: unit table + one thin adapter

## Mission

Make pij's liveness verdicts trustworthy. This is the smallest unit in the wave
and the one with the sharpest rule: **a pid is not an identity.** The OS recycles
pids, and the TS CLI's pid-only check failed in *both* directions — refusing to
revive live seats, and reporting dead ones as healthy.

Wave 0 shipped `core::liveness::alive` (three verdicts over one observed fact) and
`LivenessPort`. Your job is to finish the decision surface and give it a real
adapter.

## Scope — the only paths you write

* `crates/core/src/liveness.rs` — the pure verdict logic (exists; extend).
* `crates/harnesses/src/proc.rs` — **new**, the real `LivenessPort` adapter.
* `crates/harnesses/src/lib.rs` — one `pub mod proc;` line.
* `crates/harnesses/Cargo.toml` — your dependency lines.
* `crates/harnesses/tests/**`, `crates/core/tests/liveness_*.rs` — your tests.
* `crates/testkit/arch-allowlist.toml` — your reviewed row(s).

### Why the adapter lives in `crates/harnesses`

The ratified graph (R2) has eight crates and no process crate. A ninth is a graph
change and therefore a prime ruling, so the adapter goes in the crate that already
resolves processes behind panes. **PM decision, recorded — if you think it belongs
elsewhere, say so in your ack rather than moving it.**

## What to build

1. **`alive` stays pure and gains the boot-reset case.** `proc_start` values are
   monotonic *per boot*; after a reboot a recorded start time can look "newer"
   than anything running. Decide and document what that means — a verdict, not a
   panic — and put it in the decision table.
2. **The real adapter** implements `LivenessPort::proc_start`. Portable enough for
   macOS and Linux; if you shell out, the command and its parsing are the
   adapter's whole risk surface, so both get a fixture-backed test. **Never scan
   or signal a process you did not look up by pid.**
3. **A pid that does not exist and a pid you may not inspect are different facts.**
   Permission-denied must not be reported as "dead" — a seat you cannot see is not
   a seat that died. If the port's current signature cannot express that, say so
   in your ack (it is a contract question, and the answer may be "add a variant",
   which is mine to rule).

## Done bar

* `cargo run --locked -p pij-testkit --bin pij-gate` — six stages green.
* **Decision table** over `alive`: active · dead · recycled · boot-reset ·
  (whatever you and I agree for permission-denied). Every row asserted.
* **Mutation evidence, mandatory on the recycled branch**: make the recycled arm
  return `Active`, watch the named test fail, restore. Transcript in your report.
  A verdict nobody has watched break is a verdict nobody knows works.
* **The adapter is proven against a real process**: your own pid is alive with the
  start time you just read; a pid that cannot exist is `Dead`. Do **not** touch
  any pij seat's process — the standing rule is that no test taps the live fleet.
* Composition recipe (COMMON §4) replacing `not_yet("liveness", "u-liveness, wave 1")`.

## Watch for

* `SeatDescriptor.proc` is `Option<ProcIdentity>` and wave 0 refuses **half** an
  identity (pid without start time) at the store boundary. Your verdicts must
  never accept one either.
* The `Recycled` variant carries both timestamps on purpose: an operator needs to
  see what was recorded and what is running.
