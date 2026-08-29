# Coder packet — u-orchestration (wave 2)

**Seat model**: `pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast-1m --effort high`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-orchestration` · branch `s108/w2-orchestration`
**Common contract (read FIRST, including § 9)**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-2/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

The governance layer: batons, projects, streams, ordinals, roles — and the piece
that matters most for this fleet's own health, **descriptor equivalence-merge**.

## Scope

* `crates/core/src/orchestration/**` — **new**.
* `crates/core/src/lib.rs` — one `pub mod orchestration;`.
* store support via new migrations (**new files only**) and store extensions —
  coordinate through your ack, not by editing another unit's files.
* your tests, allow-list rows, derived files.

## What to build

1. **Equivalence merge.** Two descriptors are the same seat when
   `(pid, proc_start)` match, or when `spawn_id` matches — never on pid alone
   (`u-liveness` owns that rule; consume `core::liveness`). Secondary fields
   (model, effort, folder) are **tolerant**: a mismatch there is a fact to
   record, not a reason to refuse a merge. Machine-wide today, four pid groups
   carry 2–6 descriptors each; this is the code that stops that growing.
2. **Spawner attribution — the `E-OWN 'unknown'` class.** A seat that self-adopts
   without declaring a parent can only be linked later by someone who remembers.
   Make the parent derivable from bind evidence where it exists, and make
   `unknown` a *stated* outcome with its reason rather than a silent default.
3. **Ordinal minting scans clone + worktrees + branch heads** — the team-new race.
   Prove it with a fixture tree containing all three.
4. **Stream creation must NOT require a clean source tree** (TS defect #10, hit by
   this very plan): worktree creation is independent of source-tree dirt.
5. **The capability gate is ONE chokepoint.** A read-only role is enforced in a
   single place, not per verb — a gate with N doors has N-1 places to forget.
6. **Leases have a single holder** — property-test it.

## Done bar

* Gate green.
* Equivalence-merge table: same-pid-pair · same-spawn-id · recycled-pid ·
  tolerant-secondary-mismatch · genuinely-different. Every row asserted.
* Ordinal race test across a fixture clone + worktrees + branch heads.
* Lease single-holder property test; dirty-source-tree stream creation test.
* **Mutation evidence** on the equivalence predicate — the one that decides
  whether two rows are one seat — and on the capability chokepoint.
* Report committed and pushed before the done message.
