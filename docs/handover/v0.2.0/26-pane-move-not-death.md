# 26 — Death reconciler: a pane move (`join-pane` / window change) is not a death

**Item id / stream at handover:** 26 · s391-day3-core
**Status at v0.2.0 (tag `d120c53`):** designed (Phase 10 of the s391 plan; dossier `docs/plans/391-day3-core/tasks/phase-10-item-26-pane-move-not-death/tasks.md`; no branch)
**Size estimate:** S–M (3–4 h) · **Order / dependencies:** after item 16 (merged — notices route via `resolveNoticeRecipient`/`resolveDeathNotices` and the death sweep summary) and 31 (merged — sensor signing); reuse item 15's pid + start-time liveness helper (`adapters/lock-reclaim.ts isProcessAlive` / `processStartedAtMs`)

## 1. Why this exists (the observed failure, with evidence)
- 2026-08-28 12:07Z (fleet record `docs/plans/391-day3-core/fleet.md` row "pij-powerful-whale"; DL-009 recorded in `docs/plans/391-day3-core/391-day3-core-plan.md:559`, not in rulings.md): during `tmux join-pane` (moving the reviewer's pane under the coder's window), the daemon pushed "⚠️ pij-powerful-whale has exited; terminal absence … unrequested-by-pij" to the orchestrator; the seat bound normally seconds later. The process never died — its pane id changed.
- Mechanism at `d120c53`: `core/daemon/pane-signals.ts reconcile(listings)` (`:709`) diffs the pane set (`PaneSetDiff` `:16`, `diffPaneListings` `:46`); a pane id that vanishes is reported `gone`; `daemon.ts` `if (outcome === "gone") this.unbindGonePane(paneId)` (`:~470`) dissolves the binding ("unread mail left for a revive") and `core/daemon/death-reconciler.ts reconcileDeaths` (`:214`) turns a gone pane into a terminal absence + dead notice (`noticeText` `:139`; recipients via `resolveDeathNotices`, item 16) — without re-probing the PID.

## 2. What is ruled (design / spec)
- AC-24 (plan): moving a live seat's pane never yields an `exited`/terminal-absence notice; the seat's `paneId`/`windowId` follow it and a `moved` notice is emitted (routed like every creator notice — `resolveNoticeRecipient`, signed `pij-daemon`); a dead pid still yields the terminal absence.
- Grace: a gone pane is re-probed for ≥ 2 ticks (named constant) by pid + start time before any death verdict; during the grace the seat's state is unchanged.
- Re-attach: if `tmux list-panes -a -F '#{pane_id} #{window_id} #{pane_pid}'` shows a pane whose pid (or child pid chain) is the seat's pid, adopt that pane/window id.

## 3. Where the code is (at tag `d120c53`)
- `.pi/extensions/pij/core/daemon/pane-signals.ts` — `PaneSetDiff` `:16`, `diffPaneListings` `:46-54`, `reconcile` `:709`.
- `.pi/extensions/pij/core/daemon/death-reconciler.ts` — `reconcileDeaths` `:214` and its decision table below it; `noticeText` `:139`; `resolveDeathNotices` (item 16) and the bounded death-sweep summary (task #34) — a `moved` notice is NOT a death and must not enter that summary.
- `.pi/extensions/pij/daemon.ts` — `unbindGonePane(paneId)` (call `:~470`; definition — grep) and `refreshPaneSignals` `:~1597`; the tmux port (`core/ports.ts` `listPanes`/`newWindow`) and `adapters/tmux.ts` for the `-a` listing.
- `.pi/extensions/pij/core/binding.ts` — add `buildMovedNotice(descriptor, from, to)` beside `buildDeadNotice`, using `noticeRecipient` candidates + `resolveNoticeRecipient` at the call site.
- `adapters/lock-reclaim.ts` — `isProcessAlive` + `processStartedAtMs` (item 15) for the re-probe.
- Docs: `docs/how/pij.md` C5 team-window recipe note ("a join-pane no longer trips a death notice").

## 4. Acceptance (behavioural, mechanical)
- `daemon.test.ts` / `death-reconciler.test.ts` fakes: pane `%A` disappears from the listing while its pid is alive, then reappears as `%B` (or `%A` in another window) within the grace → NO dissolve, NO terminal-absence notice, descriptor `paneId`/`windowId` updated, ONE `moved` notice to the parent (item 16 routing, `from: pij-daemon`); pane gone AND pid dead → terminal absence as today; pane gone, pid alive, no pane found after the grace → the existing "unread mail left for a revive" path (unbind, no death).
- **MUT-26a**: remove the grace (dissolve on first `gone`) → the move case RED. **MUT-26b**: re-probe by pane only (skip pid) → the "pane gone, pid alive" case RED. **MUT-26c**: route `moved` into the death summary → the summary assertion RED. **MUT-26d**: drop the start-time check → the PID-reuse case RED (a recycled pid must not be "alive").
- Gates: full `npx vitest run .pi/extensions/pij/` at the merge product; `just typecheck`; `just pij-skill-check` (the C5 recipe text lives in the skill).

## 5. Live verification (after a daemon restart carrying it)
Spawn a seat in its own window; `tmux join-pane -s <its pane> -t <another window>`; within ~2 s: `pij state <id>` shows the NEW pane id, the parent receives `↔ <id> moved to pane %N (window @M)` signed `pij-daemon`, and NO "has exited" line. Then `kill -9 <pid>` → the terminal-absence notice arrives as before.

## 6. Risks / gotchas that already bit us
- DL-009 (`391-day3-core-plan.md:559`): the false "exited" notice reached the orchestrator mid-review and cost a re-check of the seat.
- Item 15 / DL-020 class: pid liveness must be pid + start time (recycled pids) — the helper exists; use it.
- Task #34 (count-not-N) and item 16's summary: a `moved` notice is per-seat, one-shot; never batch it into the death summary, never per-tick.
- E34: the sensor must drive the daemon composition (pane listing → reconcile → notice), not only `diffPaneListings`.

## 7. Open questions for the human
None.
