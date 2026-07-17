# P1 coder handover protocol — dizzy-angelfish → general-llama (mid fix-cycle-1)
**From**: pij-civilian-takin (orchestrator) · **Date**: 2026-07-17 · **Reason**: cost (Jordan's ruling, in-pane) — pause at a clean seam, hand over WITHOUT losing work.

## Roles
- **Outgoing**: pij-dizzy-angelfish — pauses at a clean seam, authors the dossier, answers the interview.
- **Incoming**: pij-general-llama — reads the dossier, interviews, accepts the seat, continues fix cycle 1.
- Peers talk DIRECTLY: `pij send pij-general-llama "…"` / `pij send pij-dizzy-angelfish "…"`. Interview is capped at **6 messages total** (cost) — dossier carries the weight, not chat.

## Outgoing coder: seam + dossier (do this NOW, in order)
1. **Clean seam**: finish ONLY the finding currently in flight — tests green, committed. Do NOT start the next finding. If the in-flight finding is far from green: commit as clearly-marked WIP (`wip(pij-platform): F<n> …`) with red tests included, and document its exact state.
2. **Dossier**: write `docs/plans/054-pij-grown-up/tasks/phase-1-platform-store/handover-001.md` — per finding F1..F7: DONE (sha) | WIP (sha + exact state: what's red, what's designed, what remains) | NOT STARTED (+ your design intent from the execution log). Plus: gotchas/landmines the next coder must know (e.g. journal-port wiring, types.ts zero-import law, contract-suite parity expectations), gate commands, and anything you'd tell your replacement that isn't written anywhere. Commit it.
3. **Announce**: `pij send pij-general-llama "HANDOVER READY · read docs/plans/054-pij-grown-up/tasks/phase-1-platform-store/handover-001.md (worktree /Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up) + fix-packet-001.md + reviews/p1-review-001.md · then interview me (≤6 msgs)"`
4. Answer the interview, then checkpoint me: `pij send pij-civilian-takin "P1 SEAM PAUSE · F-status <F1..F7 one-word each> · commits <shas> · dossier committed · interview done"`. Then STOP — no further work.

## Incoming coder: interview + acceptance
1. On HANDOVER READY: read the three files (dossier, fix packet, review) — the fix packet `fix-packet-001.md` is your CONTRACT (worktree, fence, gates, TDD, checkpoint form, forbidden list all live there; the canonical repo stays write-forbidden).
2. Interview dizzy-angelfish directly with your sharpest gaps ONLY (≤6 msgs total both directions).
3. When satisfied: `pij send pij-civilian-takin "HANDOVER ACCEPTED · gaps closed: <n> · starting at F<n>"` — then START WORK immediately under fix-packet-001.md, severity order, from wherever the dossier says the work stands. Your completion checkpoint form is in the packet.

## Non-negotiables
- No work lost: everything in flight is either committed or precisely described in the dossier.
- All work in the worktree `/Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up` (branch `s054/pij-grown-up`); NO push/PR (orchestrator owns); execution-log append discipline continues (F-ids).
- Interview cap is hard: 6 messages. If a gap survives the cap, general-llama logs it as an open question in the execution log and asks me only if blocking.
