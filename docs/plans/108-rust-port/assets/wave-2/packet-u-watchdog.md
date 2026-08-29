# Coder packet — u-watchdog (wave 2)

**Seat model**: `pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast --effort high`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-watchdog` · branch `s108/w2-watchdog`
**Common contract (read FIRST, including § 9)**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-2/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

The supervision engine. It decides *who is silent in a way that deserves a nudge*
— and every false positive is a real message injected into somebody's working
seat, so the cost of getting this wrong is measured in interruptions.

## Scope

* `crates/core/src/watchdog.rs` — **new**: pure logic over an injected clock and
  the registry.
* `crates/core/src/lib.rs` — one `pub mod watchdog;`.
* your tests, `crates/testkit/arch-allowlist.toml`, derived files.
* You may NOT implement your own typing heuristic (COMMON § 9.3) or your own card
  type (u-report owns it; `model::Card` is already in core).

## What to build

1. **Eligibility consults declared state.** `SeatDescriptor::nudgeable()` already
   encodes the ruling — `Waiting|Hold|Blocked|Question|Done` are deliberate
   silence, a relay is never watched, and a *working* seat is not stalled just
   because it is quiet. Build on it; if you need to change it, that is an ask.
2. **Thresholds are configured, never hardcoded.** TS shipped a fixed threshold
   that declared healthy long tool calls to be stalls. `Config` already carries
   `watchdog_interval_secs`. A default is a number nobody chose — so where you
   add one, say who chose it.
3. **Tiers, strongest wins**: `exempt` (bounded, with a deadline, auto-re-arming)
   > `compact` (auto, around a compaction, auto-clearing) > `self`. A `pause`
   must not downgrade an active exemption. Model this as a decision table, not a
   chain of ifs.
4. **`tick(now) -> Vec<Nudge>` is pure.** Same inputs, same nudges, no clock, no
   IO. That is what makes the false-stall regression reproducible.
5. **The injection proof**: synthesize the exact TS false-stall — a healthy seat
   mid-long-tool-call — and assert no nudge. That test is the unit's reason to
   exist.

## Done bar

* Gate green; decision table covering every tier × state combination.
* The false-stall regression, named for the incident.
* **Mutation evidence** on the eligibility predicate and on the tier precedence.
* Report committed and pushed before the done message (COMMON § 9.1).
