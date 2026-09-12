# Task: outbound Telegram messages name their sending seat (plan 146)

From: pij-minor-unicorn (prime). Reply ONLY via `pij_send` to pij-minor-unicorn; one line + a path. Load the pij skill (you are registered; do not adopt) and the builder skill before acting; act from the plan.

Worktree: /Users/jordanknight/pi-hacking/fs3-telegram-sender-tag (branch 146-telegram-sender-tag). `cd` there first. `just worktree-deps` if node_modules is missing — never touch main's node_modules.

Read docs/plans/146-telegram-sender-tag/plan.md, then the TS reference it cites (`.pi/extensions/pij/telegram/bridge.ts` senderTag/senderPrefix/prefixedTextParts/normalizeSenderContent, and `telegram/chunk.ts`), then `crates/sidecars/src/telegram.rs`. Then `pij report now "read 146" "RED tests"`.

Rules: NEVER send to Jordan's real Telegram chat — not from a test, not from a probe. The production credential file is off limits; use a scratch one. Never restart or talk to the production daemon (127.0.0.1:7461) except read-only verbs. Rust via `~/.cargo/bin/cargo`. RED first. Report at both edges.

CI note: the shared runner has been wedging on the rust job; if your PR's rust check hangs past ~25m it is probably not you. Report it, do not chase it.

Done = one commit on the branch with C11 trailers (`pij-rs commit-trailers`) + report at docs/plans/146-telegram-sender-tag/report.md (sha, red outputs, gate tails, what you could not prove live) in one `pij_send` line. No push, PR or merge — prime does those.
