# Task: native Copilot peer messages steer immediately (plan 142, issue #398)

From: pij-minor-unicorn (prime). Reply ONLY via `pij_send` to pij-minor-unicorn; one line + a path. Load the pij skill (you are registered; do not adopt) and the builder skill before acting; act from the plan, not from CLI help.

Worktree: /Users/jordanknight/pi-hacking/fs3-copilot-immediate-steer (branch 142-copilot-immediate-steer). `cd` there first. Run `just worktree-deps` if node_modules is missing — never touch main's node_modules.

Read docs/plans/142-copilot-immediate-steer/plan.md, then `gh issue view 398`. Then `pij report now "read 142" "RED tests"`.

Rules: never restart or talk to the production daemon (127.0.0.1:7461) except read-only verbs. Message bodies to disk + pointer. RED first. Report at both edges. This is one bounded change — no scope beyond the five ACs; if AC1's typing check fails, ask me inline.

Done = one commit on the branch with C11 trailers (`pij-rs commit-trailers`) + report at docs/plans/142-copilot-immediate-steer/report.md (sha, red output, gate tails, typing citation) in one `pij_send` line. No push, PR or merge — prime does those.
