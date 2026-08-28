# Phase 18: Item 31b — the legacy stall sensor reads the subtree — tasks dossier
**Plan**: § Phase 18, AC-35 · **Branch/PR**: `s391/item31b-subtree-stall` off `main` · **Domain**: daemon legacy stall detector
**Evidence**: 04:3xZ "⏸ pij-falling-outside has gone quiet (stalled — no activity past the stale threshold)" delivered to its creator while its coder `pij-remote-falcon` was `working` with fresh events. An orchestrator waiting on a worker is silent by design.
### Executive Briefing
- **Purpose**: `daemon.ts pushWholeLifeTransition` (`:~1184-1230`, main 74891a2) computes `stalled = isWorking && staleAge` from the seat alone (`:~1206`); item 31 made `staleAge` interval-aware (`watchdogManager.staleAfterMsFor(id)`), but a parent's silence while its child works is expected, not a stall.
- **Goals**: ✅ AC-35 one clause: no stalled notice while any child (`parentId`, else `spawnedBy`) is `working` with an event younger than the child's own threshold; fires once the subtree is quiet; suppression logs the child; hot tier only.
- **Non-Goals**: ❌ the watchdog-derived stall path (`pushWatchdogResponse`, unanswered nudges) · ❌ grandchildren (one level; say so in docs) · ❌ archive reads · ❌ changing `systemStateOf` (`core/state.ts`) — this is the daemon's notice policy, not the runtime axis
### Pre-Implementation Check
| File | Exists? | Notes |
|---|---|---|
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/daemon.ts` | yes | `pushWholeLifeTransition` `:~1184`; `const stalled = isWorking && staleAge` `:~1206`; the tick already holds `this.registry.list()` — pass/reuse it, no second read (re-grep on your base) |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/daemon/watchdog-manager.ts` | yes (READ ONLY) | `staleAfterMsFor(id)` (item 31) — reuse for the child's freshness |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/daemon.test.ts` | yes | item 31's legacy-detector tests (AC-29) are the template |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/docs/how/pij-watchdog.md` | yes | stall-threshold paragraph (item 31) |
### Tasks
| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | TEST (RED): parent `working` (event 3 min old, interval 60 s) + child `parentId`=parent `working` (event 10 s old) → no notice, no `failureReason`, one log line naming the child; child `idle` → notice once; child `working` but 5 min old (past ITS threshold) → notice; child via `spawnedBy` only → suppressed like parentId; a working child of a DIFFERENT parent → no effect; fixtures on both sides of the child's threshold (DL-019) | pij-watchdog | `daemon.test.ts` | RED on base | AC-35 |
| [ ] | T002 | IMPL: `hasActiveChild(parent, hotList, nowMs)` beside the detector; clause in the `stalled` expression; log line; hot list reused from the tick | daemon | `daemon.ts` | T001 GREEN; AC-29 tests green | no archive read |
| [ ] | T003 | DOCS + GATE (full vitest via `pij bg` → `docs/plans/391-day3-core/logs/vitest-phase18.log`, tsc, biome) + PR-ready (no push) | — | | 0 fail | AC-10 |
### Mutation evidence required in your report
- T002: drop the clause → the working-child case RED; drop the child's freshness guard → the stale-child case RED; restore → GREEN.
