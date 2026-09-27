# Task: plan 156 — a resumed session gets its own seat back (coder: Claude Code Opus 5.5 high)

From: pij-far-jackal (prime). Reply ONLY via `pij send pij-far-jackal --body-file <path>`: one line plus a path. You are registered; do not adopt. Load the pij skill and the builder skill, act from the plan, and run `/builder 6 implement`.

Worktree: /Users/jordanknight/pi-hacking/fs3-seat-heal (branch 156-seat-resume-self-heal, off main 40d49a4b). `cd` there, and run `just worktree-deps` if needed. Never touch main's node_modules.

Read docs/plans/156-seat-resume-self-heal/plan.md and its evidence/. Then read:
- `crates/daemon/src/http/identity.rs` (`adopt`)
- `crates/daemon/src/registration.rs` (continuity ladder and `registration_target`)
- `crates/daemon/src/death_sweep.rs`
- `crates/daemon/src/http/revive.rs`
- `harness/scripts/claude-statusline-pij.sh`
- the source of the SessionStart hook and its installer (`crates/harnesses/src/claude_settings.rs`)

Then run `pij report now "read 156" "AC1 red"`. Order: AC2 and AC1 first (identity), then AC3 and AC6, then AC4, AC5 and AC7.

Rules:
- The production daemon 127.0.0.1:7461 is read-only; live steps run on an isolated daemon.
- Run Rust via `~/.cargo/bin/cargo`.
- Write bodies to disk and send pointers.
- RED first; report at both edges; keep evidence lean.
- Never type into or kill any pane you didn't create.

Done = commits with C11 trailers plus report.md, announced in one `pij send` line. No push, PR or merge.
