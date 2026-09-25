# Review: plan 155 — store wedge, silent deferral, hold collision, observer budget (reviewer: pij-sunny-tarsier)

From: pij-far-jackal (prime). Reply ONLY via `pij send pij-far-jackal --body-file <path>`: VERDICT + path. You are registered; do not adopt. Load the pij skill and the builder skill. Read-only on the branch; write ONLY docs/plans/155-store-wedge-and-silent-deferral/review.md (+ reviewer-probes/).

Worktree: /Users/jordanknight/pi-hacking/fs3-store-wedge, branch 155-store-wedge-and-silent-deferral, off main 10798fce. Range `62aba16f..6d46c110` (code 21098074, budget dda4d052, evidence 6d46c110). Production daemon read-only; isolated daemon for anything live; Rust via `~/.cargo/bin/cargo`. NOTE: this machine is under heavy load (load avg ~38 on 16 cores); if a timing test flakes, rerun it isolated and say so rather than counting it.

Read plan.md (incl. the live incident and evidence/), report.md, then the diff. `pij report now "read 155" "probing"`.

Verdict bar — APPROVE only if each holds with a pasted probe:
1. **A: the wedge cannot recur.** The post-BEGIN-ACK cancellation repro is RED on main and GREEN here. Mutate the cancellation-safety change away and show which test goes red. Separately mutate the pool-boundary guard away (connection returned mid-transaction) and show its test goes red — the two defences must each be load-bearing, not one masking the other. List every `timeout`/`select!`/HTTP-drop path around store writes the coder found; spot-check one you find yourself.
2. **Health is honest.** A poisoned/wedged pool makes `/health` report unhealthy; store-bound calls fail within the acquire bound instead of hanging. RED on main.
3. **B: status never gates mail.** A seat reporting `hold` receives. No other path still reads `semantic_state` for delivery (grep receipt across daemon, core, extensions). The deprecated `semantic_hold` is emitted as `false` unconditionally; the unchanged MAIN extension receives against the new daemon (brandon's compat proof — rerun it). The new extension ignores the field present or absent.
4. **Deferrals observable.** A deferred delivery records reason + count on the job and a rate-limited spine event; `pij state` shows it. Show the rate limit bounds event volume under a 5 s retry for an hour (compute or test).
5. **Observer budget = brake not policy.** 1 s / 5 s named constants; start-time sandwich checks byte-identical; a never-answering `ps` still refuses within the bound, message names the process. The timeout refusal became 409 retryable — confirm it cannot turn a genuine foreign/dead-owner refusal into a retry loop (only the timeout class is retryable).
6. **Timestamps** on every daemon.log line, including sidecar lines (telegram, chore, bg, drain).
7. **Fence**: registration changes limited to the budget/timeout class; no 151/154 admission-order change (function-level diff of `registration_target`, `check_native_roster`, continuity ladder).
8. Gates on YOUR checkout: cargo test --workspace, fmt, clippy -D warnings, node extension tests (file glob), `just self-check` (warm; a load-induced timing flake → isolated rerun, disclosed).

Verdict: APPROVE / APPROVE-WITH-FIXES (file:line each) / REJECT (why). Report at both edges.
