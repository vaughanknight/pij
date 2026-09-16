# Task: plan 153 — omp is a harness, not a switch on pi

From: pij-far-jackal (prime). Reply ONLY via `pij send pij-far-jackal --body-file <path>`: one line + a path. You are registered (spawned); do not adopt. Load the pij skill and the builder skill; act from the plan, not CLI help. Run `/builder 6 implement`.

Worktree: /Users/jordanknight/pi-hacking/fs3-omp-first-class (branch 153-omp-first-class, off main). `cd` there first; `just worktree-deps` if node_modules is missing; never touch main's node_modules.

Read docs/plans/153-omp-first-class/plan.md, then `.pi/extensions/pij/index.ts` (pij_spawn ~262), `.pi/extensions/pij/core/spawn.ts` (SpawnRequest ~700, bin handling), `core/discovery.ts:51`, `crates/cli/src/main.rs` (spawn args ~196, the no-silent-default test ~2690), `crates/core/src/model.rs:37`, and the skill files under `skills/pij/`. Then `pij report now "read 153" "AC1 RED"`.

Rules: production daemon 127.0.0.1:7461 read-only; isolated daemon for live steps; Rust via `~/.cargo/bin/cargo`; message bodies to disk + pointer; RED first, output pasted; report at both edges; evidence lean. Plans 151 (registration.rs, extension registration retry) and 152 (receiver/heartbeat/delivery) are in flight — do not touch those paths.

Done = commits on the branch with C11 trailers (`pij-rs commit-trailers`) + docs/plans/153-omp-first-class/report.md (sha, RED outputs, gate tails, AC5 envelopes, AC4 probe) in one `pij send` line. No push, PR or merge — prime does those.
