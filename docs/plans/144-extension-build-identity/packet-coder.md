# Task: extension build identity on every pi/omp seat (plan 144)

From: pij-minor-unicorn (prime). Reply ONLY via `pij_send` to pij-minor-unicorn; one line + a path. Load the pij skill (you are registered; do not adopt) and the builder skill before acting; act from the plan, not from CLI help.

Worktree: /Users/jordanknight/pi-hacking/fs3-extension-build (branch 144-extension-build-identity). `cd` there first. Run `just worktree-deps` if node_modules is missing — never touch main's node_modules.

Read docs/plans/144-extension-build-identity/plan.md, then the registration path in `.pi/extensions/pij/adapters/rust-runtime.ts` and `crates/daemon/src/registration.rs` (descriptor shape), then `crates/store/migrations/` (latest number). Then `pij report now "read 144" "RED tests"`.

Rules: never restart or talk to the production daemon (127.0.0.1:7461) except read-only verbs; isolated daemon for live proof. Rust via `~/.cargo/bin/cargo`. Message bodies to disk + pointer. RED first. Report at both edges. Plan 143 is in flight in another worktree touching rust-runtime.ts delivery paths — keep your edits to registration/descriptor code so the merge stays clean.

Done = one commit on the branch with C11 trailers (`pij-rs commit-trailers`) + report at docs/plans/144-extension-build-identity/report.md (sha, red outputs, gate tails incl. `cargo test --workspace`, clippy, fmt, npm test; live outputs) in one `pij_send` line. No push, PR or merge — prime does those.
