# Task: plan 151 — hold, don't refuse, the transient `/restart` session (coder: pij-dry-pavetta)

From: pij-far-jackal (prime). Reply ONLY via `pij send pij-far-jackal --body-file <path>`: one line + a path. You are registered; do not adopt. Load the pij skill and the builder skill; act from the plan, not CLI help. Run `/builder 6 implement`.

Worktree: /Users/jordanknight/pi-hacking/fs3-transient-hold (branch 151-transient-session-hold, off main cf08eacd which has 149+150 — your 149 code is there). `cd` there first; `just worktree-deps` if node_modules is missing; never touch main's node_modules.

Read docs/plans/151-transient-session-hold/plan.md, then `crates/daemon/src/registration.rs` (`registration_target`, `check_native_roster`, the 409 envelope from 149 in `http/identity.rs` ~652) and `.copilot/extensions/pij/store.mjs` (409 handling ~325 and ~824; `registration-wait` surface ~1187). Then `pij report now "read 151" "AC0 repro"`.

Rules: production daemon 127.0.0.1:7461 read-only; isolated daemon for every live step; Rust via `~/.cargo/bin/cargo`; message bodies to disk + pointer; RED first, output pasted; report at both edges. Do not touch the production Copilot seats or their panes. If AC0 shows the refusing branch differs from the plan's guess, say so in report.md and implement the rule as written.

Done = commits on the branch with C11 trailers (`pij-rs commit-trailers`) + docs/plans/151-transient-session-hold/report.md (sha, RED outputs, gate tails, AC4 logs, AC5 queries) in one `pij send` line. No push, PR or merge — prime does those.
