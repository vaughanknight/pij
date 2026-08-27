# Phase 7: Item 16 — watchdog/lifecycle notices route to the current parent — tasks dossier

**Plan**: § Phase 7, AC-21 · **Branch/PR**: `s391/item16-watchdog-parent-route` off `main` · **Domain**: pij-control-plane · **CS**: 1
**Evidence** (o-prime 19:00Z, spine 25711): toucan, adopted under the o-prime via `pij link`, had its stall notice delivered to pij-vocal-kingfisher (its original spawner).

### Executive Briefing
- **Purpose**: every creator notice (bound / failed / stalled / dead) is built by `core/binding.ts` (`buildBoundNotice :281`, `buildFailedNotice :290`, `buildStalledNotice :308`, `buildDeadNotice :319`) as `CreatorNotice { to, text }` with `to = descriptor.spawnedBy`, and `daemon.ts pushWholeLifeTransition` (`:995-1060`) gates the whole path on `if (!d.spawnedBy) return; // no creator to notify`. An adopted seat's governing parent (`parentId`, a `cli`-owned contested field set by spawn or `pij link`) is never consulted.
- **Fix**: one pure `noticeRecipient(d) = d.parentId ?? d.spawnedBy` in `core/binding.ts`, used by all four builders AND by the daemon's gate; fall back to `spawnedBy` only when no parent link exists.
- **Goals**: ✅ AC-21 adopted seat (parent ≠ spawnedBy) → notice to parent ONLY; plain seat → spawnedBy (unchanged); neither → no notice (unchanged)
- **Non-Goals**: ❌ watcher-list semantics in `watchdog-manager.ts notifyWatchers` (explicit `pij watchdog watch` watchers are a separate mechanism and already correct) · ❌ notice wording

### Pre-Implementation Check
| File | Exists? | Notes |
|---|---|---|
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/binding.ts` | yes | four `build*Notice` builders `:281-330` returning `CreatorNotice`; `to` derived from `spawnedBy` |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/binding.test.ts` | yes | builder tests |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/daemon.ts` | yes | `pushWholeLifeTransition` `:995-1060`: `if (!d.spawnedBy) return;` `:996`; stalled notice `:1023-1024` and `:1056-1058` (`if (persisted.spawnedBy)`); provider-failure push at `:1004` also gated on `spawnedBy` |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/daemon.test.ts` | yes | lifecycle notice tests |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/daemon/loop.ts` | yes | planned-id bind, discovered bind, and terminal bind-failure notice gates also checked `spawnedBy` directly |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/daemon/death-reconciler.ts` | yes | actual terminal-death notice is constructed here, before the daemon delivery pass |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/types.ts` | yes | `parentId` on `SessionDescriptor` (cli-owned contested field, `core/registry-write.ts:83`) — READ ONLY, no schema change |
| `docs/how/pij-watchdog.md`, `docs/how/pij.md` | yes | notice routing docs |

### Tasks
| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | TEST (RED) `core/binding.test.ts`: for each of the four builders — descriptor with `parentId:"pij-parent"` and `spawnedBy:"pij-spawner"` → `to === "pij-parent"`; `spawnedBy` only → `to === "pij-spawner"`; neither → `null` | pij-control-plane | `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/binding.test.ts` | RED (adopted case) | AC-21 |
| [x] | T002 | TEST (RED): stalled/provider-failure transitions, both bind-success gates, bind failure, and the terminal death reconciler route adopted and parent-only seats to the current parent; the original spawner receives nothing | pij-control-plane | `daemon.test.ts`, `core/daemon/loop.test.ts`, `core/daemon/death-reconciler.test.ts` | RED on the pre-fix implementation | AC-21; extra files explicitly approved by the orchestrator |
| [x] | T003 | IMPL `core/binding.ts`: export one `noticeRecipient(d): SessionId | null`; all four builders and every approved lifecycle-notice gate use it | pij-control-plane | `core/binding.ts`, `daemon.ts`, `core/daemon/loop.ts`, `core/daemon/death-reconciler.ts` | T001/T002 GREEN | no schema or watcher-list change |
| [x] | T004 | DOCS (`docs/how/pij-watchdog.md` routing sentence; `docs/how/pij.md` link/adopt) + GATE + PR handoff | — | git root | targeted tests green; full gates recorded in execution log | AC-10 |

### Discoveries & Learnings
| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| 2026-08-27 | T002/T003 | Scope | The two bind-success gates and the bind-failure gate in `core/daemon/loop.ts` independently suppressed parent-only notices before the shared builders ran. | Orchestrator widened the fence; all three gates now call `noticeRecipient`, with parent-only RED cases for each. | `core/daemon/loop.ts`, `core/daemon/loop.test.ts` |
| 2026-08-27 | T002/T003 | Scope | The authoritative terminal-death notice is constructed in `core/daemon/death-reconciler.ts`, so changing only `daemon.ts` cannot route a parent-only death. | Orchestrator widened the fence; the reconciler now uses the same helper and has a parent-only terminal-death test. | `core/daemon/death-reconciler.ts`, `core/daemon/death-reconciler.test.ts` |
| 2026-08-27 | T003 | Boundary | Needs-human, init-injection context, planned-bind-refusal diagnostics, and explicit watcher subscriptions are different message/ownership classes. | Left unchanged; only bound/failed/stalled/dead lifecycle notices use current-parent routing. | `core/daemon/loop.ts`, `docs/how/pij-watchdog.md` |
