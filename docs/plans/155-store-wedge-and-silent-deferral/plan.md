# Plan 155 — a poisoned store connection wedges the daemon; a gate defers delivery forever in silence

Prime: pij-far-jackal. Branch `155-store-wedge-and-silent-deferral`, worktree `/Users/jordanknight/pi-hacking/fs3-store-wedge`. Evidence under `evidence/` (captured before the restart).

## Defect A — store wedge (production, daemon pid 36206, started 2026-09-24 17:03, restarted 2026-09-25 11:27 by prime on Jordan's word)

`/health` answered but every store-bound call hung (`pij state` > 30 s, exit 124). Only the daemon held `pij.sqlite` (lsof). Log after start: 2,551 store errors, nothing else — `attempted to call begin_with at non-zero transaction depth` (bg 868, chore 857, telegram 70, drain 6) and `(code: 5) database is locked` (telegram 38, chore 27, bg 25). Of the 8 daemon starts in the log only this one ever hit it; there is no startup correlation. The log has **no timestamps**, so the first failure cannot be dated — it ran ~18 h and served a successful spawn/state/send canary ~11:1x on 09-25 before wedging.

Reading of the mechanism (verify, do not assume): pool of 4 (`crates/store/src/migrate.rs:61`), every writer opens via `begin_write` → `pool.begin_with("BEGIN IMMEDIATE")` (`migrate.rs:197`, 40 call sites). sqlx 0.8.6 raises "non-zero transaction depth" when a connection comes back from the pool still inside a transaction. A connection returned mid-transaction also holds SQLite's write lock, which explains `database is locked` on the others. One poisoned connection = intermittent failures; four = total wedge. Candidate causes: a future dropped between `BEGIN` being sent and the `Transaction` guard existing (cancellation — HTTP handler dropped on client disconnect, a `timeout`/`select!` around store work, plan 152's client-side RPC deadlines now abort requests more often), or a guard dropped whose lazy rollback never ran.

## Defect B — Claude deliveries deferred forever, silently (same window, still live after restart)

Two idle Claude seats (`pij-clinical-owl` %486, `pij-yucky-nenneke` %495, both Opus 5.5 on Claude Code 2.1.281, empty `❯` composer, taps owned, sockets present) have head-of-line jobs 9810 (attempt 1,029) and 9812 (attempt 762) retrying every few seconds since ~10:19, blocking 6 more behind them. No `delivery.outcome` event, no job outcome, no log line — the deferral reason is never recorded anywhere. Gate: `crates/harnesses/src/interaction.rs` `fresh_injection_verdict` (:415-490) → `submit_with_owned_input` (:500-530) defers on TapUnowned / Unrecognized / HumanTyping / ComposerBusy. Both footers carry a new second line `⏵⏵ bypass permissions on … · ← 1 agent` (background task marker); `composer_region` may not recognize this layout, or the cursor position may fall outside it. Pane captures with cursor x/y are in `evidence/pane-*.txt`.

## Rules

1. **A connection never returns to the pool inside a transaction.** Enforce at the pool boundary (sqlx `after_release`/`before_acquire`: detect an open transaction — e.g. via the raw handle's autocommit state — then roll back or close the connection, and log it once with a counter), AND remove the cause: every write transaction runs where cancellation cannot interrupt it between BEGIN and COMMIT/ROLLBACK.
2. **A deferral is an observable fact.** Each deferred attempt records its reason on the job (last reason + count) and a rate-limited spine event; `pij state <seat>` shows "delivery deferred: <reason> ×N since <t>". An unbounded silent retry is not a state.
3. **The daemon log is timestamped.**

## Acceptance criteria — each RED first, outputs in report.md

- **AC0 Reproduce A.** On an isolated daemon, produce "non-zero transaction depth" by the mechanism you find (e.g. cancel a request mid-transaction at scale). If the first hypothesis does not reproduce, instrument and say what does. Paste.
- **AC1 Pool guard.** Test: a connection released inside a transaction is rolled back or discarded; the next `begin_write` succeeds; counter/log line emitted. RED today.
- **AC2 Cancellation-safe writes.** The mechanism from AC0 can no longer leave a transaction open (test the specific cancellation path: HTTP client disconnect mid-write, and any `timeout`/`select!` around store work you find — list them).
- **AC3 Wedge liveness.** Store-bound HTTP calls answer or fail within a bound (acquire timeout) instead of hanging; `/health` reports store health (a poisoned/wedged pool is not "healthy"). RED: today `/health` said healthy while every store call hung.
- **AC4 Diagnose B.** Run the Claude composer classifier against `evidence/pane-486.txt` / `pane-495.txt` (cursor from the file) and state which reason fires and why. Fix the classifier for the 2.1.281 footer if that is it, with a fixture from the evidence.
- **AC5 Deferral observability.** Rule 2, with a test; `pij state` shows it.
- **AC6 Timestamped log.** RFC 3339 prefix on every daemon.log line.
- **AC7 Contract.** `docs/how/pij-rs-api.md`: store health in `/health`, deferral reason fields.

## Non-goals
Delivering the currently stuck messages (prime handles those); schema changes beyond what AC5 needs; production daemon (read-only; `pij state` etc. fine).

## Gates
`~/.cargo/bin/cargo test --workspace`, fmt --check, clippy -D warnings, `just self-check` (warm). RED before GREEN. Isolated daemon only.
