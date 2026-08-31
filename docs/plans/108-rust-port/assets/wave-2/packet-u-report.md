# Coder packet — u-report (wave 2)

**Seat model**: `pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast --effort high`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-report` · branch `s108/w2-report`
**Common contract (read FIRST, including § 9)**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-2/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

Status cards: what a seat last did, what it intends next, and how stale that
claim is. Every supervisory surface in pij reads these — the watchdog decides
eligibility from them, the anomaly detectors flag them, a human scans them.

`model::Card` and `model::CARD_LIMIT` already exist (PM seam `de858841`). You
build the service around them. **You are first in the compose order**, so two
other units are waiting on your types: keep them honest and small.

## Scope

* `crates/core/src/report.rs` — **new**: the service, pure over an injected clock.
* `crates/core/src/lib.rs` — one `pub mod report;`.
* `crates/store/src/report.rs` (or an extension of the spine) — persistence, your
  call; say which in your ack and why.
* new migration(s) if you need them — **new files only, never an edit**.
* your tests, `crates/testkit/src/contract.rs` (append only),
  `crates/testkit/arch-allowlist.toml`, derived files per COMMON § 9.5.

## What to build

1. **`now(did, next)` and the state verbs** (`done`, `blocked`, `question`,
   `clear`). Declared state is visible, correctable, and independently
   verifiable — that is the whole design. "Actively working" has NO state word;
   absence is honest by design, and your model must not invent one.
2. **The 280 limit is a documented contract, not a truncation.** Over-length is an
   ERROR that names the limit (`PijError::ReportTooLong` exists). Measure after
   collapsing whitespace, and test 279/280/281 at the boundary.
3. **Card freshness is computed from an injected clock**, never `SystemTime::now`
   inside core. A card older than a configured threshold is *stale* — a fact, not
   an error, because a stale card is worse than no card (consumers render it as
   current) and the fix belongs to whoever owns the seat.
4. **Absent ≠ empty.** A seat that has never reported has NO card; a seat with an
   empty `did` has a card that says nothing. Different facts, different rendering.

## Done bar

* Gate six stages green (COMMON § 2).
* Boundary tests at 279/280/281 post-collapse; staleness across the threshold;
  absent-vs-empty asserted.
* **Mutation evidence** on the limit check and on the staleness comparison: break
  each, watch the NAMED test fail, restore, transcript in your report.
* Report committed to
  `docs/plans/108-rust-port/assets/reports/done-u-report.md` and pushed BEFORE
  your done message (COMMON § 9.1).
