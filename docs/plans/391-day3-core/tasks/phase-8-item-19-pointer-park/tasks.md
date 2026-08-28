# Phase 8: Item 19 — pointer-path rows park after N re-announcements — tasks dossier

**Plan**: § Phase 8, AC-22 · **Branch/PR**: `s391/item19-pointer-park` off `main` · **Domains**: pij-control-plane (daemon pointer settle) · pij-messaging (attempt accounting) · **CS**: 2
**Evidence**: spec seat cold review OBS-03 — pointer rows keep `attempt = 0` and are re-announced every 90 s forever.

### Executive Briefing
- **Purpose**: the pointer path never goes through `claim()` (the only place `attempt` increments): the drain lists `queued` rows (`daemon.ts:1174 listQueued`), types the pointer, then `settle(seq,"injected",{leaseMs: POINTER_LEASE_MS})` (`:1243`) which leaves `attempt` untouched; on lease expiry `recoverStaleClaims` re-queues (parks only at `attempt ≥ maxAttempts`, which is never reached). A seat that never reads its pointer is re-announced forever.
- **Goals**: ✅ AC-22 each announce counts; beyond N the row parks with a `pointer-unread` receipt (open-but-stuck; retireable per item 1); `pij queue` shows the honest count
- **Non-Goals**: ❌ changing `POINTER_LEASE_MS` · ❌ body-path behaviour · ❌ receipts on the pointer path beyond the park receipt

### Pre-Implementation Check
| File | Exists? | Notes |
|---|---|---|
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/daemon.ts` | yes | drain `:1373-1374` (`recoverStaleClaims` then `listQueued`); pointer settle `:1443` (line numbers at main e935c88 — re-grep on your base) (`settle(seq,"injected",{leaseMs})`) |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/adapters/sqlite-queue.ts` | yes | `claim()` increments `attempt`; `settle()` does NOT (`SET state=?, lease_until=?, claim_token=…`); `recoverStaleClaims({maxAttempts})` parks at `attempt >= max` (default 6) with receipt `parked`/`lease-expired` |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/adapters/sqlite-queue.test.ts`, `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/daemon.delivery.test.ts`, `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/daemon/loop.test.ts` | yes | fixtures: `"parks a message after maxAttempts"`; pointer-path describes |
| `docs/how/pij.md` | yes | delivery states section (Phase 2) |

### Tasks
| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | TEST (RED) `daemon.delivery.test.ts`: sqlite fixture, legacy seat that NEVER reads: tick → pointer typed (attempt 1) → advance past lease → tick → re-announced (attempt 2) … after N=`POINTER_MAX_ANNOUNCES` (decide: 6 like the body path, or a named pointer constant) the row is `parked` with receipt `parked`/`pointer-unread` and the NEXT tick types nothing; a seat that reads (acks) on the 2nd announce → `acked`, attempt 2 | pij-control-plane | `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/daemon.delivery.test.ts` | RED on base (attempt stays 0; re-announced forever) | AC-22 |
| [ ] | T002 | TEST (RED) `sqlite-queue.test.ts`: `settle(seq,"injected",{leaseMs, countAttempt:true})` (or a new `announce(seq,…)` transition) increments `attempt` and writes an `injected` receipt with the attempt; `recoverStaleClaims` parks with detail `pointer-unread` when the row's last transition was a pointer announce | pij-messaging | `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/adapters/sqlite-queue.test.ts` | RED | |
| [ ] | T003 | IMPL: attempt accounting on the pointer settle (`daemon.ts:1243`) + park detail; header state-machine diagram updated; `pij queue` shows the count (already renders `attempt`) | both | `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/daemon.ts`, `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/adapters/sqlite-queue.ts` | T001/T002 GREEN | decide N and document why N×lease ≫ a long turn |
| [ ] | T004 | DOCS (`docs/how/pij.md`) + GATE + PR | — | git root | 0 fail | AC-10 |

### Discoveries & Learnings
| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
