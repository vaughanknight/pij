# Review: plan 154 — a successful registration never leaves a tombstone behind (reviewer: pij-hot-alligator)

From: pij-far-jackal (prime). Reply ONLY via `pij send pij-far-jackal --body-file <path>`: VERDICT + path. You are registered; do not adopt. Load the pij skill and the builder skill. Read-only on the branch; write ONLY docs/plans/154-tombstone-lift-all-harnesses/review.md (+ reviewer-probes/).

Worktree: /Users/jordanknight/pi-hacking/fs3-tombstone-lift, branch 154-tombstone-lift-all-harnesses, off main 1fd636c4. Range `d64fa0e4..ecbdd9bc` (plan d64fa0e4 mine; code 6d907986; evidence ecbdd9bc). Four files: `registration.rs`, `http/tests.rs`, `reaper_tests.rs`, `docs/how/pij-rs-api.md`. `cd` there; production daemon 127.0.0.1:7461 read-only; isolated daemon for anything live; Rust via `~/.cargo/bin/cargo`.

Read plan.md, report.md, then the diff. `pij report now "read 154" "probing"`.

Verdict bar — APPROVE only if each holds with a pasted probe:
1. **Invariant is total.** Enumerate every `Ok(...)` exit of `register_inner` (and any other path that writes a seat row on registration: spawn-prebind, native resume, 151 hold is a refusal so excluded) and show `tombstoned_at == None` is guaranteed on each — by the AC1 test if it truly covers all exits, else name the uncovered exit. Mutate: keep the tombstone on ONE harness path and show which test goes red.
2. **Continuity ladder, no widening.** Resume requires same harness AND (same harness/pi session OR same spawn_id OR recorded proc incarnation). Mutate each rung independently (drop the session check; drop the harness check; accept any spawn_id) and name the red test per mutant. A foreign session claiming a retired id → refusal with the tombstone reason and timestamp, row UNCHANGED (byte-compare the row before/after).
3. **149 and 151 preserved.** Native Copilot session-first resume and the 151 pane hold behave exactly as on main: run their tests unchanged and diff the native branches of `registration.rs` — the lift generalization must not have altered native admission order (hold check still precedes the write).
4. **Sweep race (AC4).** The interleaving test actually interleaves (an observation of the old pid dead lands between the claim's read and its write); show that reordering the fixture to non-overlap makes the test vacuous (goes green on the pre-fix tree) — if so, the test proves nothing and the finding is blocking.
5. **AC5 live proof honesty.** The receipt says "recreated pane incarnation, not original physical pane" and shows the different-session rider hitting the refusal. Confirm `reaper_tests.rs` changes are test-only and the reaper brake (`reaper.rs:78-85`) is unchanged.
6. **Contract.** `pij-rs-api.md` paragraph replaces the 149 native-only wording (grep the old sentence = 0) and states the ladder and the refusal.
7. Gates on YOUR checkout: cargo test --workspace, fmt, clippy -D warnings, `just self-check` (warm).

Verdict: APPROVE / APPROVE-WITH-FIXES (file:line each) / REJECT (why). Report at both edges.
