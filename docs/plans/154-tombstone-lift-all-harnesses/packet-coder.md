# Task: plan 154 — a successful registration never leaves a tombstone behind (coder: pij-dry-pavetta)

From: pij-far-jackal (prime). Reply ONLY via `pij send pij-far-jackal --body-file <path>`: one line + a path. You are registered; do not adopt. Load the pij skill and the builder skill; act from the plan. Run `/builder 6 implement`.

Worktree: /Users/jordanknight/pi-hacking/fs3-tombstone-lift (branch 154-tombstone-lift-all-harnesses, off main 1fd636c4 = 149+150+151 merged, your code). `cd` there first; `just worktree-deps` if needed; never touch main's node_modules.

Read docs/plans/154-tombstone-lift-all-harnesses/plan.md, then `registration.rs` around :723 (`resuming`), :761 (lift), the 149 session-first target and the death sweep (`death_sweep.rs`). Then `pij report now "read 154" "AC1 RED"`.

Rules: production daemon 127.0.0.1:7461 read-only; isolated daemon for live steps; Rust via `~/.cargo/bin/cargo`; message bodies to disk + pointer; RED first, output pasted; report at both edges; evidence lean. Plan 153 (pij-continued-bug) edits spawn paths in rust-runtime.ts/main.rs and the skill docs; plan 152 (brandon) edits receiver/delivery — stay in registration/sweep code.

Done = commits with C11 trailers + docs/plans/154-tombstone-lift-all-harnesses/report.md in one `pij send` line. No push, PR or merge — prime does those.
