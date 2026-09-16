# Plan 154 — a successful registration never leaves a tombstone behind

Prime: pij-far-jackal. Branch `154-tombstone-lift-all-harnesses`, worktree `/Users/jordanknight/pi-hacking/fs3-tombstone-lift`. Generalizes plan 149.

## Defect (measured 2026-09-16, production, seat pij-unusual-foltest, harness omp)

Tombstoned `observed-dead` by the 2026-09-15 09:24 death sweep (reboot). Jordan restarted the omp seat (`omp --resume`, new pid 95071 at 14:10:49). The extension re-registered under its own id with its pi session `01a089c9…`: the row was rewritten (pid, proc_start, pane, extension_build cf08eacd) **four times** (spine seqs 46323, 46401, 46436, 46697) and the tombstone stayed every time. Result: `pij state` = `idle · active`, `pij_send` from a peer = "tombstoned" refusal (pij-open-llama hit it). Same shape as the 2026-09-15 pij-monthly-nenneke hand lift. Prime hand-lifted again by SQL at 14:5x; that is not a fix.

Cause: `crates/daemon/src/registration.rs:723` — `let resuming = native && existing.is_some_and(...)`; the lift at :761 runs only for native Copilot claims. Every other harness takes the "rewrite the row" path with the tombstone untouched.

## Rule

**After any successful registration the row is live: `tombstoned_at` is `None`.** A claim that matches a tombstoned row's id resumes it when it proves continuity (same harness AND same harness/pi session id, OR same spawn_id, OR the recorded process incarnation) — lifting the tombstone and emitting `seat.resumed` with the prior reason — and is **refused** when it cannot (a foreign session claiming a retired id gets a decodable refusal naming the tombstone, never a silent rewrite). Live-and-tombstoned is an invariant violation, not a state.

## Acceptance criteria — each RED first, outputs in report.md

- **AC1 Invariant.** A property/unit test over `register_inner`: for every successful registration outcome, `descriptor.tombstoned_at.is_none()`. RED today with an omp claim on a tombstoned row.
- **AC2 Resume by continuity, all harnesses.** omp, pi, claude, codex: tombstoned row + claim with the same `session` (harness session) → row live, pid/pane updated, `seat.resumed{prior_reason}` event, bindings (parent, roles, telegram) intact. One test per harness, RED = tombstone survives.
- **AC3 Refuse without continuity.** Tombstoned row + claim with a different session and no spawn/proc match → refusal `seat <id> is retired (<reason>, <at>); a different session may not take it`, HTTP 400 envelope; row unchanged. Test RED = today rewrites the row. Spawn-prebind (149) and revive paths keep their behaviour, pinned.
- **AC4 Death sweep vs restart race.** A seat re-registers while the sweep is observing its OLD pid dead: the registration wins (the claim is the proof), the sweep does not re-tombstone the new incarnation. Test with the sweep's observation interleaved.
- **AC5 Live proof (isolated daemon).** Spawn an omp seat, kill its process, run the sweep (tombstoned), start `omp --resume` in the same pane → same id, `pij state` shows no tombstone, `pij send` from a peer lands. Paste. Then the foreign case: a fresh omp session claiming that id → refusal envelope pasted.
- **AC6 Contract.** `docs/how/pij-rs-api.md` registration section: the invariant and the continuity ladder in one paragraph, replacing the 149 native-only wording.

## Non-goals

Plan 151 hold logic (keep it intact; it runs before this), plan 152/153 paths, production daemon (read-only), the CLI `revive` verb.

## Gates

`~/.cargo/bin/cargo test --workspace`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `just self-check`. RED pasted before GREEN. Isolated daemon only.
