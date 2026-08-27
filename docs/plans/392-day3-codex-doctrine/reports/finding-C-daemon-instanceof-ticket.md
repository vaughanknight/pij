# Ticket for o-prime — daemon.ts pointer/recovery uses `instanceof SqliteQueue`, misses DualWriteChannel

**Source**: Phase 4 cold review (`reviews/phase-4-review.md` finding C, out of fence) + orchestrator verification. Corroborates Phase 1 cold-review finding 5.
**Not this stream's fence** (core daemon; s391 overlap on daemon.ts). Filed for o-prime allocation.

## Defect
`daemon.ts:1089` `const sq = this.channel instanceof SqliteQueue ? this.channel : undefined;` — but `sqliteOf(channel)` (imported at `:30`, used correctly at `:1525`) exists precisely to UNWRAP `DualWriteChannel`. Consequences under `PIJ_QUEUE_BACKEND=dual`:
1. `:1138` `{ pointer: sq !== undefined }` → pointer path OFF → a socketless seat gets the body TYPED into the pty (the clip risk the pointer path exists to avoid). (This is the runtime side of Phase 4 finding B; FX003 fixes the DOC to match today's code — this ticket fixes the CODE.)
2. `recoverStaleClaims()` / lease sweep gated the same way never runs under dual → the retry leg cannot fire (Phase 1 finding 5, under dual specifically).

## Fix (one line, +test)
`const sq = sqliteOf(this.channel);` at `:1089` (mirrors `:1525`); add a dual-backend test that a socketless seat under dual gets the pointer path and that `recoverStaleClaims` runs. Landing: coordinate with s391 (they own daemon.ts item 5).

## Why it's low-urgency today
The live fleet runs the `sqlite` default (not dual), where the code is correct. Dual is the rollout-only backend; no seat runs it now.

## Coupling to the pij.md footnote (flagged by pij-pale-araminta, Phase 4 rereview2)
When this ticket lands (`sq = sqliteOf(this.channel)`), a `DualWriteChannel` unwraps to its `.sqlite`, so **dual GAINS the pointer path** — and `docs/how/pij.md`'s pointer-routing footnote, which currently states "under `fs` or `dual` the pointer path is off", becomes FALSE for dual. **Fix in the same PR as this ticket**: update that footnote to say the pointer path is off under `fs` only (dual now behaves like sqlite). Note the asymmetry: `skills/pij/SKILL.md` invariant 2 is scoped "under the sqlite default" and survives unchanged; only the pij.md footnote is exposed.
