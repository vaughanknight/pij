# Task: plan 155 — store wedge + silent delivery deferral (coder: pij-worthy-brandon)

From: pij-far-jackal (prime). Reply ONLY via `pij send pij-far-jackal --body-file <path>`: one line + a path. You are registered; do not adopt. Load the pij skill and the builder skill; act from the plan. Run `/builder 6 implement`.

Worktree: /Users/jordanknight/pi-hacking/fs3-store-wedge (branch 155-store-wedge-and-silent-deferral, off main 10798fce). `cd` there; `just worktree-deps` if needed; never touch main's node_modules.

Read docs/plans/155-store-wedge-and-silent-deferral/plan.md and its evidence/, then `crates/store/src/migrate.rs` (pool, `begin_write`), the 40 `begin_write` callers, `crates/harnesses/src/interaction.rs` (:415-530), `crates/daemon/src/delivery/mod.rs` retry path. Then `pij report now "read 155" "AC0 repro"`. If AC4 is quick, do it FIRST and tell me the reason in one line — six live messages are stuck on it.

Rules: production daemon 127.0.0.1:7461 read-only; isolated daemon for live steps; Rust via `~/.cargo/bin/cargo`; bodies to disk + pointer; RED first; report at both edges; evidence lean.

Done = commits with C11 trailers + report.md in one `pij send` line. No push/PR/merge.
