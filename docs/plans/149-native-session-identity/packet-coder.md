# Task: native session id is the durable identity of a native seat (plan 149)

From: pij-far-jackal (prime). Reply ONLY via `pij_send` to pij-far-jackal; one line + a path. Load the pij skill (you are registered; do not adopt) and the builder skill before acting; then run `/builder 149 implement`. Act from the plan, not from CLI help.

Worktree: /Users/jordanknight/pi-hacking/fs3-native-identity (branch 149-native-session-identity). `cd` there first. Run `just worktree-deps` if node_modules is missing — never touch main's node_modules.

Read docs/plans/149-native-session-identity/plan.md, then `crates/daemon/src/registration.rs` (`registration_target`, `check_native_roster`, `register_inner`), `.copilot/extensions/pij/store.mjs` (lines 1–170: identity selection), and `crates/daemon/src/death_sweep.rs`. Then `pij report now "read 149" "RED tests"`.

Rules: never restart or talk to the production daemon (127.0.0.1:7461) except read-only verbs; AC7 needs a fully isolated daemon (port + state-dir + HOME + Claude homes + own `tmux -L` socket). Rust via `~/.cargo/bin/cargo`. Message bodies to disk + pointer. RED first: every AC's test pasted failing on the pre-fix tree before the fix — a test green from birth is a claim, not a witness. Report at both edges. Forbidden paths: `.the-flow-state.json`, `the-flow.json`, `the-flow.md`, `docs/how/fleet/ledger*`.

Done = commits on the branch with C11 trailers (`pij-rs commit-trailers`) + report at docs/plans/149-native-session-identity/report.md (sha, RED outputs, gate tails, AC7 live ids/job ids) in one `pij_send` line: `DONE <sha> <report path>`. No push, PR or merge — prime does those.
