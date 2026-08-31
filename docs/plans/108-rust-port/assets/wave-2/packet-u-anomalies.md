# Coder packet — u-anomalies (wave 2)

**Seat model**: `pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast --effort high`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-anomalies` · branch `s108/w2-anomalies`
**Common contract (read FIRST, including § 9)**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-2/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

Detectors that name what is wrong and what to do about it. The doctrine this unit
carries: **every computed signal has a consumer.** A detector whose output nobody
reads is a cost with no benefit — and a row that can never be cleared is worse,
because it accumulates until the whole surface is ignored (TS defect #8: dead
dispatch rows forever).

## Scope

* `crates/core/src/anomalies.rs` — **new**: the detectors, pure over a store view.
* `crates/core/src/lib.rs` — one `pub mod anomalies;`.
* persistence for clear/ack state — say where in your ack.
* your tests, allow-list rows, derived files.

## What to build

1. **`trait Detector { fn scan(&self, view) -> Vec<Anomaly> }`**, each anomaly
   naming its **observable** (what was measured), its **remediation line** (the
   exact command a human or agent should run), and its **kind**.
2. **Rows are clearable and ackable, and a cleared row STAYS cleared** until the
   condition recurs. Prove the staying with a control test — that is the half TS
   lacked.
3. **Start with the detectors that already have consumers**: `status-stale` (reads
   `model::Card`, which u-report owns — consume the type, do not invent one),
   `delivered-unacked`, `unverified-done`. If you add a fourth, name its consumer
   in your report or do not add it.
4. **A detector must not be able to accuse a seat of something the registry cannot
   show.** If a signal needs a fact no descriptor carries, that is an ask, not an
   inference.

## Done bar

* Gate green; per-detector fixture stores; the cleared-stays-cleared control test.
* Every anomaly's remediation line is a runnable command, asserted non-empty and
  containing the seat id where one applies.
* **Mutation evidence** on one detector's predicate and on the clear logic.
* Report committed and pushed before the done message.
