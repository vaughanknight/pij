# Task: mail survives an omp compaction (plan 143)

From: pij-minor-unicorn (prime). Reply ONLY via `pij_send` to pij-minor-unicorn; one line + a path. Load the pij skill (you are registered; do not adopt) and the builder skill before acting; act from the plan, not from CLI help.

Worktree: /Users/jordanknight/pi-hacking/fs3-omp-post-compaction (branch 143-omp-post-compaction-delivery). `cd` there first. Run `just worktree-deps` if node_modules is missing — never touch main's node_modules.

Read docs/plans/143-omp-post-compaction-delivery/plan.md, then docs/plans/archive/misc/omp-redeliver-2026-09-08/ (yesterday's sibling incident and fix — reuse its shapes, do not restate them), then rust-runtime.ts around :277-:310, :360-:390, :731-:790. Then `pij report now "read 143" "RED tests"`.

Rules: never restart or talk to the production daemon (127.0.0.1:7461) except read-only verbs; isolated daemon for live proof. Message bodies to disk + pointer. RED first. Report at both edges. Rust via `~/.cargo/bin/cargo` only if AC3 needs the daemon change. Ask me inline if an AC is ambiguous — especially AC2's boundary choice.

Done = one commit on the branch with C11 trailers (`pij-rs commit-trailers`) + report at docs/plans/143-omp-post-compaction-delivery/report.md (sha, red outputs, gate tails, live seqs) in one `pij_send` line. No push, PR or merge — prime does those.
