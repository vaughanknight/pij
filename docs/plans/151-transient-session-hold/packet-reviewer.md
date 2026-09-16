# Review: plan 151 — transient `/restart` session is held, not refused (reviewer: pij-sunny-tarsier)

From: pij-far-jackal (prime). Reply ONLY via `pij send pij-far-jackal --body-file <path>`: one line (VERDICT + path). You are registered; do not adopt. Load the pij skill and the builder skill. Read-only on the branch; write ONLY docs/plans/151-transient-session-hold/review.md (and reviewer-probes/ if you need scratch).

Worktree: /Users/jordanknight/pi-hacking/fs3-transient-hold, branch 151-transient-session-hold. Review range `f619fc05..ab252595` (plan f619fc05 is mine; code 6216e984; evidence ab252595). `cd` there; `just worktree-deps` if needed; never touch main's node_modules. Production daemon 127.0.0.1:7461 read-only; isolated daemon for anything live. Rust via `~/.cargo/bin/cargo`.

Read plan.md, then report.md, then the diff. Then `pij report now "read 151" "probing"`.

Verdict bar — APPROVE only if every one holds, each with a pasted probe:
1. **Narrow.** The hold fires ONLY when: claimed session has no seat AND the conflicting roster row matched by the PANE clause AND that owner is live (not tombstoned, not in the dead sweep). Same-process and same-session conflicts still refuse (149 AC5). Mutate the guard: relax each condition in turn and show which test goes red (baseline green first; report "tripwire, not proof" where a miss is unexploited).
2. **Not an admission.** A held claim writes nothing: no seat row, no job, no spine event beyond an observation. Check the store after the AC4 run and after a synthetic hold loop of ≥10 retries.
3. **Resolution paths.** (a) owner dies → next retry registers a NEW seat for the new session (not a resume); (b) claimed session gains a seat → 149 resume; (c) the fork is killed → nothing left behind. Each path has a test or a pasted probe.
4. **Extension surface.** No user-visible line for a hold < 10 s; exactly one line after; the line never says "restart the Copilot CLI"; the extension does not exit on a hold; backoff capped 5 s. Read the diff for the retry loop's termination: can a hold spin forever if the daemon keeps answering 409? What bounds it, and is that bound documented?
5. **Live proof honesty.** AC4 stretched the schedule with SIGSTOP on the owned child (report says so). Confirm the report labels that as a scheduling control, and that the natural (unstretched) run's outcome is stated, not implied. `transient-hold-live.ts` must not touch 7461 or a real HOME — cite the lines.
6. **Evidence weight.** ~1,800 lines of live JSON under docs/plans/151…/. Rule per plan 150 H-round: keep what a reader needs to re-derive the claim, trim the rest to a pointer. Recommend a trim list; not a blocker.
7. Gates re-run on YOUR checkout: cargo test --workspace, fmt, clippy -D warnings, `node --test` over the extension tests (coder says the directory form is invalid on Node 24.7 — verify and state the exact invocation that is valid), `just self-check`.

Report at both edges. Verdict vocabulary: APPROVE / APPROVE-WITH-FIXES (list, each with file:line) / REJECT (why).
