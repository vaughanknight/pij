# s123 — one-message-one-delivery

**Date**: 2026-09-01  
**Seat**: `pij-obedient-marmot`  
**Output**: PR #342 — event → claim → inject → ack for Pi/OMP pushed delivery.

## What changed

The extension now treats `message.pushed` as a wake-up, claims the daemon-authoritative inbox row, injects it once, then acknowledges only after successful injection. Claims are fenced to the originating session generation across `/new` and `/fork`. Empty claims yield to the daemon delivery worker.

## Difficulties

- Unit suites initially accepted a pending `job_id`, but the real daemon ack contract accepts only a running claim. The live OMP/SQLite witness rejected that design.
- Daemon-side claim-before-publish then broke six inbox guards, including waiting/paneless readers. The final consumer-side claim preserves them.
- Corrected review found a claim await crossing a session replacement; a delayed-claim mutation test now guards it.
- Pinned skew proof needed two real OMP pairs. New extension/old daemon delivered once; old extension/new daemon failed loudly, retained the body, and recorded one recovery ack.
- Completion checks must run after temporary proof worktrees are removed; a concurrent cleanup produced one transient `ENOTEMPTY` test failure.

## Magic wand

A paved isolated OMP smoke should launch a worktree extension against an isolated Rust daemon, send one queued message, and assert the pane renders once while the SQLite row transitions `pending → running → done`. That single sensor would have rejected the first design without a bespoke live session.

## Evidence

- `docs/plans/123-one-message-one-delivery/assets/ac-2-prefx-red.md`
- `docs/plans/123-one-message-one-delivery/assets/live-delivery-transcripts.md`
- `.harness/records/retro/2026-09-01/001-123-one-message-one-delivery.md`
- `pij-gate`, `just self-check`, `harness checks`, and PR #342 CI: green.
