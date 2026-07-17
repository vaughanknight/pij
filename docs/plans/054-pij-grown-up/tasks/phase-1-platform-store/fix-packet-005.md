# P1 fix packet 005 — resolve the last cycle-5 finding (fix cycle 5)
**From**: pij-civilian-takin (orchestrator) · **Date**: 2026-07-17 · **Immutable once dispatched**
**Coder**: pij-general-llama (compacted — re-ground from packet + cited files)

## Context — ONE finding left; 17/18 attested root-cause complete
Verdict `docs/plans/054-pij-grown-up/reviews/p1-review-005.md` (READ FIRST — both resurrection probes + the full corroboration matrix, which is otherwise attested sound).

## K1 (HIGH — clear success is not durably established)
`FsOpJournal.clear` returns ok off fail-soft `fsyncDirBestEffort`; a power-loss-resurrected entry then either (a) forges an aborted intent via the state===next intent branch (second A→B event attributed to the aborted writer AFTER the winner) or (b) permanently false-blocks a genuinely moved-on committed op. Requirement: **`clear` may report ok only with durable evidence of resolution, and recovery must distinguish a resurrected RESOLVED op from a live crash record.** Candidate mechanisms (choose smallest sound; log rationale in execution log):
1. Hard-durable removal: dir-fsync becomes load-bearing in clear — failure ⇒ retain/recreate the record + honest error (mind platform support: a platform where dir-fsync cannot succeed must not permanently wedge).
2. Durable completion evidence (tombstone): fsync-able `<opId>.resolved` FILE written before unlink — file-content fsync is durable on every platform; recovery treats op+tombstone as resolved (sweep both), tombstone-only as garbage. Kills both probe branches without relying on dir-entry-absence durability.
Reverting to once-only clearing is RULED OUT (reopens J1's forge). Pin BOTH reviewer probes verbatim (resurrected aborted intent after winner; resurrected committed op after B→C) + tombstone/removal-durability unit pins.

## Standing contract
Packets 001–004 bind: worktree-only, fence, TDD red-first, port-first for ports.ts changes, execution-log appends, no push/PR.

## Gates before checkpoint
`just typecheck` · fenced platform+adapters+cli · full `npx vitest run` (release-age-policy flake out of scope).

## Checkpoint
`pij send pij-civilian-takin "P1 FIX CYCLE 5 COMPLETE · commits <shas> · K1 status + mechanism chosen · gates: <results>"`
