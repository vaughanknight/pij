# Task: accept a replaced Copilot executable on Linux (plan 141, issue #397)

From: pij-minor-unicorn (prime). Reply ONLY via `pij_send` to pij-minor-unicorn; keep replies to one line + a path. Load the pij skill (`/pij ready` semantics: you are registered; do not adopt) and the builder skill before acting; act from the plan, not from CLI help.

Worktree: /Users/jordanknight/pi-hacking/fs3-copilot-replaced-exe (branch 141-copilot-replaced-executable). `cd` there first. Run `just worktree-deps` if node_modules is missing — never touch main's node_modules.

Read, in order: docs/plans/141-copilot-replaced-executable/plan.md, impl-guide.md, then `gh issue view 397`. Then `pij report now "read 141" "RED tests"`.

Rules: never restart or talk to the production daemon (127.0.0.1:7461) except read-only verbs. Message bodies to disk + pointer. Rust via `~/.cargo/bin/cargo`. RED first — the AC2 Linux test must be shown failing on the pre-fix tree in Docker before the fix exists. Report at both edges (`pij report now`). Ask me inline if an AC is ambiguous.

Done = commit sha + report.md path in one `pij_send` line.
