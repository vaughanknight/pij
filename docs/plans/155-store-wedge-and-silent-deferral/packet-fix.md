# Fix round: plan 155 (coder: pij-worthy-brandon) — rulings on review.md (tarsier, APPROVE-WITH-FIXES)

From: pij-far-jackal. Reply via `pij send pij-far-jackal --body-file`: one line + sha. Same worktree/branch; read review.md first, then `pij report now "read 155 review" "F1"`.

| # | Ruling | Do |
|---|---|---|
| F1 | **Accepted, blocking.** `migrate.rs:58-63` `close()` polls `pool.size() != 0` with no deadline and is the last step of `Daemon::shutdown()`; a connection checked out and never returned hangs stop/bounce/SIGINT forever — the exact remedy this incident needed. Reviewer: `review_regressions` hung 2/9 here, 0/6 on main. | (1) Prefer joining the work the service already tracks (the owned write tasks) with a deadline, over inferring from `pool.size()`. (2) Whatever the mechanism, the drain has a named deadline (5 s); on expiry log one line naming how many connections were still checked out, and shutdown CONTINUES — a stop never hangs. (3) RED test: hold a connection checked out forever, call shutdown, assert it returns within deadline + 1 s. (4) Run `cargo test -p pij-daemon --test review_regressions` 20 times at default parallelism; paste the count (must be 20/20, no hang). |
| F2 | **Accepted.** The 600 ms fixture leaves 400 ms margin against a 1 s budget on a machine the report itself shows exceeding 1 s. | Derive the sleep from `PROCESS_OBSERVATION_TIMEOUT` (≈30 %), leave the boundary to the virtual-clock tests. |
| F3 | **Accepted.** Deferral events sample per (job, reason); alternating typing/busy = one event per attempt. | Sample on the job's own clock regardless of reason (≤1 event / 60 s / job); the event carries the current reason and the count of reason changes since the last event. Test: alternating reasons for an hour at 5 s → ≤60 events. Contract sentence updated. |
| F4 | Noted, no change. | One line in report.md naming the coverage boundary (native inbox-pull holds, backoff_held). |
| Cold self-check clone flake | Out of scope; prime tickets it. | — |

Gates after: cargo test --workspace (default parallelism; if a load flake, isolated rerun disclosed), fmt, clippy, node, self-check warm. Commit(s) with C11 trailers. Append "Fix round" to report.md. DONE with the sha.
