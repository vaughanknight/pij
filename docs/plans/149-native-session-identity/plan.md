# Plan 149 — native session id is the durable identity of a native seat

Prime: pij-far-jackal. Branch `149-native-session-identity`, worktree `/Users/jordanknight/pi-hacking/fs3-native-identity`.

## Defect (measured 2026-09-15, production store)

Native Copilot session `7a582862…` was given THREE pij ids in a row (anaconda → chameleon → continental-flamingo); three other sessions show the same. Two faces of one cause:

1. **Same-window restart errors out.** The extension finds its old seat by native session and re-claims the same id; the daemon sees a different process and, because the death sweep has not yet proven the old pid dead, refuses `seat id belongs to a different process incarnation` (`crates/daemon/src/registration.rs:995`). Seven HTTP 400s in 13 s, then the receive loop gives up permanently.
2. **New window gets a new id.** By then the old row is tombstoned; `registration.rs:979` refuses any tombstoned id, and the extension's `nativeAttested` (`.copilot/extensions/pij/store.mjs:15`) requires `tombstoned_at == null`, so it never asks. Both fall through to "no prior" and a fresh name is minted.

Root cause: on rs the native session id is only a GUARD (mismatch refuses) and never the KEY to resume; identity is effectively pinned to pane + process incarnation. Consequences: every restart orphans the old id's queue (chameleon: 104 pending, unreachable), and parent, role and the Telegram reply binding evaporate with the rename. The TS extension carried a session-keyed identity self-heal.

## Rule

**A native claim whose harness session id matches an existing row on this machine IS that seat**, whatever its pane or process now is and whether or not the row is tombstoned. The registration adopts the new incarnation, lifts the tombstone, and publishes the change. A different session id keeps today's behaviour (new id / supersede).

## Acceptance criteria — every one RED on the pre-fix tree, output pasted in report.md

- **AC1 Resume by session.** `registration_target` (daemon) resolves a native claim by `harness_session` before pane/spawn heuristics. Same session + new pane + new process ⇒ same id. Tombstoned row ⇒ same id, tombstone lifted (`tombstoned_at`/`tombstone_reason` cleared). One new spine event kind (coder names it; one kind, not two) carrying old/new proc, old/new pane, and the reason.
- **AC2 No race with the sweep.** Same-window fast restart (old pid still unproven-dead) is admitted at once: the claim itself is the proof the old incarnation ended. No 400, no wait for the sweep. The extension side stops excluding tombstoned rows from session-keyed candidates, and does not give up permanently on a refusal the daemon marks retryable — while still NEVER inventing an identity.
- **AC3 Mail survives.** Jobs addressed to the id before the restart are claimable by the resumed incarnation. Test: enqueue → old process gone → re-register with same session → claim succeeds, payload intact.
- **AC4 Bindings survive.** parent, role (seat_roles) and the Telegram reply binding are unchanged across the resume — asserted, not assumed.
- **AC5 Guards preserved.** A DIFFERENT session cannot take an id (today's refusals stay, each pinned by a test). A session that matches a row recorded on another machine refuses. A same-pane new session still supersedes with a new id.
- **AC6 Contract.** `docs/how/pij-rs-api.md` registration section states the rule in one paragraph; `pij state` for the resumed seat shows the new proc and no tombstone.
- **AC7 Live proof on an ISOLATED daemon** (own port, state-dir, HOME, Claude homes, `tmux -L`; never 127.0.0.1:7461): spawn a Copilot seat, note id; exit and `copilot --resume <session>` in the SAME window ⇒ same id, no error, a message sent during the gap arrives; then start it in a NEW window ⇒ same id again. Paste ids and job ids.

## Non-goals (separate plans)

Native extension memory leak (`getEvents()` full-history reads); daemon detecting a dead extension receiver; a post-hoc parent-assertion verb; anything on the legacy TS daemon.

## Gates

`~/.cargo/bin/cargo test --workspace`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `node --test .copilot/extensions/pij/*.test.mjs`, full `just self-check`, bare `biome check` with `$?` read directly. Smoke flakes under cargo load: re-run alone before reporting it red.
