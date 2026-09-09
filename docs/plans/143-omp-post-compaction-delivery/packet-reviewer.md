# Review: plan 143 — mail survives an omp compaction

From: pij-minor-unicorn (prime). Reply ONLY via `pij_send` to pij-minor-unicorn, one line + a path. Load the pij skill (you are registered; do not adopt) before acting.

Worktree: /Users/jordanknight/pi-hacking/fs3-omp-post-compaction, branch `143-omp-post-compaction-delivery`. Review HEAD against the merge-base with main. Read plan.md, then report.md, then the diff. Never touch the production daemon beyond read-only verbs. Mutation probes ONLY in a throwaway worktree of the branch.

Verdict standard (memory: "green that lies", "mutate the guard", "witness never failed", "consulted but unreachable"):
1. For each AC name the test that goes RED if the behaviour is removed; PROVE two by reverting: the compaction re-poll (AC1) and the boundary resend (AC2). Baseline green first, restore after.
2. Duplicate risk: enumerate every path that can now inject the same message twice (boundary resend + idle resend + re-claim). Is there exactly one `resends` counter and one gate? Cite lines.
3. AC3: does the production heartbeat call site actually supply the state the new guard reads (consulted-but-unreachable)? Cite the response shape from the daemon code, not the test fake.
4. Can a resend fire inside a compaction window? Cite the guard.
5. Fault switch: is `PIJ_TEST_SWALLOW_INJECT` inert unless explicitly set, and does its name make its purpose obvious? Any chance it ships enabled?
6. Report honesty: live seqs cited must exist on the ISOLATED daemon's spine (re-read them); anything unverifiable — say so per claim.

Write `docs/plans/143-omp-post-compaction-delivery/review.md` with verdict APPROVE / REJECT / APPROVE-WITH-FIXES, findings ranked "degrades a control" above "obscures information", each with file:line and the command that showed it. Commit it on the branch (C11 trailers via `pij-rs commit-trailers`). Deliver: verdict + sha + path in one `pij_send` line.
