# Phase 10: Item 26 — death reconciler: pane move ≠ death — tasks dossier
**Plan**: § Phase 10, AC-24 · **Branch/PR**: `s391/item26-pane-move-not-death` off `main` · **Domain**: pij-control-plane · **CS**: 2
**Evidence**: DL-009 — during `tmux join-pane -v -s %208 -t %59` the daemon pushed "⚠️ pij-powerful-whale has exited; terminal absence: live observation … (unrequested-by-pij)" while the process was alive and bound seconds later.
### Executive Briefing
- **Purpose**: `core/daemon/pane-signals.ts reconcile(listings)` (`:709`) diffs the live pane-id set; a pane missing from the listing is `retired` (`PaneSetDiff.retired` `:16-54`, "dead panes are retired even if tmux still lists them"); `daemon.ts unbindGonePane` (`:166-180`) dissolves the owner and `core/daemon/death-reconciler.ts reconcileDeaths` (`:133`) emits the terminal-absence notice (`:67`). A `join-pane` makes the pane id vanish from the WINDOW listing momentarily (or the id changes when tmux re-creates the pane) while the pid is alive. The reconciler's own table (row 4: terminal + unrequested-by-pij + alive → CLEAR terminal) shows the alive-again case is already recoverable — the defect is the premature notice + dissolve before a re-probe.
- **Goals**: ✅ AC-24 a live pid whose pane/window changed is re-probed after a grace and reported `moved` (descriptor `paneId`/`windowId` updated), never `exited`; a dead pid still yields the terminal absence
- **Non-Goals**: ❌ changing `pij close` semantics · ❌ the item 1 sweep (complete-close predicate unchanged)
### Pre-Implementation Check
| File | Exists? | Notes |
|---|---|---|
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/daemon/pane-signals.ts` | yes | `PaneSetDiff` `:16`; `diffPaneSets` `:45-54`; `reconcile` `:709` |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/daemon/death-reconciler.ts` | yes | `reconcileDeaths` `:214`; decision table below it (re-grep); `noticeText` `:139` (at main e935c88 — item 16 reshaped this file: recipients now resolve via `resolveNoticeRecipient`/`resolveDeathNotices`) |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/daemon.ts` | yes | `unbindGonePane` (called `:470`; definition re-grep) (dissolve + log "unread mail left for a revive"); `refreshPaneSignals` `:1597` (at main e935c88) |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/daemon/pane-signals.test.ts`, `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/daemon/death-reconciler.test.ts`, `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/daemon.test.ts` | yes | fixtures |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/docs/how/pij.md` | yes | C5 team-window recipe note |
### Tasks
| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | TEST (RED) daemon fakes: pane `%A` disappears from the listing while its pid is alive, then reappears as `%B` (or `%A` in another window) within the grace → NO dissolve, NO terminal-absence notice, descriptor `paneId`/`windowId` updated, a `moved` notice to the parent (item 16 routing); pid dead → terminal absence as today; pane gone AND pid alive past the grace with no reappearance → today's unbind (paneless seat) | pij-control-plane | RED on base (dissolves immediately) | AC-24 |
| [ ] | T002 | IMPL: grace window (name + document; ≥ 2 ticks) before `unbindGonePane`; re-probe by pid (+ start time, item 15 helper) and by `tmux list-panes -a` for a pane whose pid matches → adopt the new id; `moved` notice via `buildMovedNotice` in `core/binding.ts` using `noticeRecipient` | pij-control-plane | T001 GREEN | `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/binding.ts` |
| [ ] | T003 | DOCS (C5 team-window recipe: "a join-pane no longer trips a death notice") + GATE + PR | — | 0 fail | AC-10 |
