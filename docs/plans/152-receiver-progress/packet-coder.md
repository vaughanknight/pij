# Task: plan 152 — receiver observation progress is liveness (coder: pij-worthy-brandon)

From: pij-far-jackal (prime). Reply ONLY via `pij send pij-far-jackal --body-file <path>`: one line + a path. You are registered; do not adopt. Load the pij skill and the builder skill; act from the plan, not CLI help. Run `/builder 6 implement`.

Worktree: /Users/jordanknight/pi-hacking/fs3-receiver-progress (branch 152-receiver-progress, off main cf08eacd = your plan 150 merged). `cd` there first; `just worktree-deps` if needed; never touch main's node_modules.

Read docs/plans/152-receiver-progress/plan.md, then your own `store.mjs` receiver (`waitForObservation`, `readEvents`, `keepReceiverAlive`, `newCompletion`) and `crates/daemon/src/delivery/mod.rs` (heartbeat/lease/park). The production evidence is in the plan; the production extension log it cites is readable but production daemon 127.0.0.1:7461 and production Copilot seats are read-only for you. Then `pij report now "read 152" "AC0 repro"`.

Rules: isolated daemon + isolated Copilot (own HOME, state dir, `tmux -L`) for every live step; Rust via `~/.cargo/bin/cargo`; message bodies to disk + pointer; RED first, output pasted; report at both edges; keep evidence files lean (pointer + the lines a reader needs). Plan 151 (pavetta, branch 151-transient-session-hold) touches `registration.rs` and the extension's registration retry path — keep your edits to the receiver/heartbeat/delivery paths so the merge stays clean.

Done = commits on the branch with C11 trailers (`pij-rs commit-trailers`) + docs/plans/152-receiver-progress/report.md (sha, RED outputs, gate tails, AC5 logs and queries) in one `pij send` line. No push, PR or merge — prime does those.
