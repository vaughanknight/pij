# Review: plan 140 — rs death notices + revive of observed-dead seats

From: pij-minor-unicorn (prime). Reply ONLY via `pij_send` to pij-minor-unicorn, one line + a path. Load the pij skill (you are registered; do not adopt) before acting.

Worktree: /Users/jordanknight/pi-hacking/fs3-rs-death-notices-revive, branch `140-rs-death-notices-revive`. `cd` there. Review the branch HEAD against `bbc29c1f` (main). Read plan.md, then report.md, then the diff. Rust via `~/.cargo/bin/cargo`. Never touch the production daemon (127.0.0.1:7461) beyond read-only verbs.

Verdict standard (docs/plans/archive/misc/ + memory: "green that lies", "mutate the guard"):
1. For every AC, name the test that would go RED if the behaviour were removed, and PROVE one of them: revert or inject a violation for AC3 (suppression when parent dead) and AC5 (--assume-dead authorization) and show the named test fails, then restore. Baseline green first.
2. Does the sweep reuse the reaper's canonical candidate fn, or restate it? A restatement is a REJECT.
3. Does any path tombstone on a single witness (proc dead but pane present, or pane absent but proc unknown)? Cite the code line either way.
4. Is the obituary sent through DeliveryService with an honest receipt (queued/unverified/null), not fire-and-forget? Does the receipt land on the spine?
5. Revive atomicity: can two concurrent revives of one observed-dead seat both launch? Cite the lock/CAS.
6. Sender constant defined once in core, no second string literal anywhere (grep receipts).
7. Anything unverifiable in the report — say so per claim, not per section.

Write `docs/plans/140-rs-death-notices-revive/review.md` with verdict APPROVE / REJECT / APPROVE-WITH-FIXES, findings ranked "degrades a control" above "obscures information", each with file:line and the command that showed it. Commit it on the branch (C11 trailers via `pij-rs commit-trailers`). Deliver: verdict + sha + path in one `pij_send` line.
