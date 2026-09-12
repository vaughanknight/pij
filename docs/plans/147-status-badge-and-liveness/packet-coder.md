# Task: badge + moving mechanical axis + roster liveness/freshness (plan 147)

From: pij-minor-unicorn (prime). Reply ONLY via `pij_send` to pij-minor-unicorn; one line + a path. Load the pij skill (you are registered; do not adopt) and the builder skill before acting; act from the plan.

Worktree: /Users/jordanknight/pi-hacking/fs3-status-badge (branch 147-status-badge-and-liveness). `cd` there first. `just worktree-deps` if node_modules is missing — never touch main's node_modules.

Read docs/plans/147-status-badge-and-liveness/plan.md, then the TS source it ports (`.pi/extensions/pij/core/state.ts` — `BADGE_SEVERITY`, `badgeOf`, and the `stalled` rule above them), then `crates/core/src/model.rs` (SystemState, SemanticState, `nudgeable`), `crates/daemon/src/http/mod.rs` (`seats` handler ~2407, `state_card` ~2247, `unsupported_state_fields` ~2310), `crates/store/src/registry.rs`. Then `pij report now "read 147" "RED tests"`.

Rules: never restart or talk to the production daemon (127.0.0.1:7461) except read-only verbs; isolated daemon for live proof. Rust via `~/.cargo/bin/cargo`. RED first. Report at both edges.

AC2 is the one to stop on if it is not honest: if no existing observation reliably says "this seat is working", say so and stop rather than synthesising one. I would rather ship a badge with a documented blind spot than a state that lies.

Known environment noise, do NOT chase: the shared CI runner wedges the rust job intermittently (if your PR check hangs past ~25m it is not you); `harness boot` smoke times out under load; two test-teardown races are already fixed in PRs #413 and #414. Run `RUST_TEST_THREADS=1` with no other cargo of your own when a native test misbehaves.

Done = one commit on the branch with C11 trailers (`pij-rs commit-trailers`) + report at docs/plans/147-status-badge-and-liveness/report.md (sha, red outputs, gate tails, roster timing before/after, anything unproved) in one `pij_send` line. No push, PR or merge — prime does those.
