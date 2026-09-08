# Task: rs death notices to parents + revive of observed-dead seats (plan 140)

From: pij-minor-unicorn (prime). Reply ONLY via `pij_send` to pij-minor-unicorn; keep replies to one line + a path. Load the pij skill (`/pij ready` semantics: you are registered; do not adopt) and the builder skill before acting; act from the plan, not from CLI help.

Worktree: /Users/jordanknight/pi-hacking/fs3-rs-death-notices-revive (branch 140-rs-death-notices-revive). `cd` there first. Run `just worktree-deps` if node_modules is missing — never touch main's node_modules.

Read, in order: docs/plans/140-rs-death-notices-revive/plan.md, impl-guide.md. Then `pij report now "read 140" "RED tests"`.

Rules: never restart or talk to the production daemon (127.0.0.1:7461) except read-only verbs; isolated daemon only. Message bodies to disk + pointer. Rust via `~/.cargo/bin/cargo`. RED first; report at both edges (`pij report now`). Ask me inline if an AC is ambiguous — do not guess on AC5 authorization.

Done = commit sha + report.md path in one `pij_send` line.
