# Item 10: pane resolution must never bind an unregistered pane (my half = the resolution path)

**Plan**: `../../day3-codex-doctrine-plan.md` (v1.3.0) · **Ruling**: `../../rulings.md` (10:2xZ) · **Incident**: `~/GitHub/pij/government/incidents/2026-08-27-cross-government-pane-misbind.md`
**Status**: dossier draft (survey done read-only; land LAST — after 3c, 7, and s391's loop.ts item 5) · **Landing order**: 3c → 7 → 10
**Fence (widened by ruling)**: `.pi/extensions/pij/core/daemon/index-state.ts` (+test); coordinate on `core/daemon/loop.ts` with s391 item 5 (s391 lands first, then rebase).

### Executive Briefing
- **Purpose**: A pane-less/dissolved copilot seat's queued mail was typed into an unrelated, unregistered copilot pane of the same harness ~10 min after the seat was closed. Half 1 (retire-on-close) is s391 item 1. **My half**: the daemon must never resolve a delivery/bind target to a pane it does not hold in the registry, and must never re-bind a dissolved seat.
- **What we build**: make pane→seat resolution and (re)binding require the seat's OWN deterministic identity evidence — copilot `--session-id <uuid>` (its `~/.copilot/session-state/<uuid>/`), claude/codex their native session evidence — and treat an unregistered pane as never a delivery target and a `dissolved` seat as never re-bindable without `pij revive`.

### Mechanism (from the read-only survey — file:line on tip 246f234)
- `IndexState.rebuild` (`core/daemon/index-state.ts:15-27`) indexes `byPane` from `d.paneId` for EVERY descriptor including terminal ones (no lifecycle filter); `resolvePane(paneId)` (`:94`) returns whatever id last claimed that pane. `byHarnessIdentity` resolve already guards ambiguity (`E-AMBIG`) — the pane index does not.
- `deliverPass` (`daemon.ts:825-836`) already filters `lifecycle==="bound"` + `paneId` present, so it will not deliver to a `dissolved` seat directly. The exposure is the RESOLUTION/RE-BIND path, not the steady-state drain: the incident seat had `paneId:%94` but mail reached `%108` — i.e. a pane was matched to the seat by something other than its recorded pane, or a stale index row survived a pane's reuse.
- Binding: `driveSession` (`core/daemon/loop.ts:350`) binds on `descriptor.plannedHarnessSessionId` "the instant the pane is interactive" — good for copilot (deterministic id). The guard to ADD: before binding/re-binding, require positive evidence that the interactive pane actually runs THIS seat's session id (copilot: the pane's process argv contains `--session-id <plannedHarnessSessionId>`, or its `~/.copilot/session-state/<id>/` exists and is fresh — `core/harness/copilot.ts resolveCopilotCurrentSession/isCopilotSessionId` already parse this), and refuse to (re)bind a `lifecycle==="dissolved"` descriptor at all.
- Incident descriptor confirms the class: `pij-nasty-tick` `lifecycle:"dissolved"`, `terminal.disposition:"requested"` (owner `cli-close` 09:35:05), yet daemon log shows `route pij-nasty-tick: injected 1 message(s)` — a dissolved seat was still a routing target.

### Tasks (draft)
| # | Task | Domain | Path(s) | Done When | Notes |
|---|------|--------|---------|-----------|-------|
| [ ] | T001 | `index-state.test.ts` (RED): `rebuild` with a `dissolved` pane-less seat + a fresh UNREGISTERED same-harness pane → `resolvePane(freshPane)` is undefined AND the dissolved seat is never returned by a resolve; a `bound` seat still resolves its own pane | pij-control-plane | `core/daemon/index-state.test.ts` | tests fail on current code | fake descriptors only |
| [ ] | T002 | `index-state.ts`: `rebuild` skips `byPane` for terminal/dissolved descriptors (or `resolvePane` excludes them); add a `resolveBindablePane` that returns a seat only when the pane's identity evidence matches (caller passes the evidence) | pij-control-plane | `core/daemon/index-state.ts` | T001 GREEN | no schema change |
| [ ] | T003 | `loop.ts` bind guard (coordinate w/ s391 item 5): refuse to bind when `descriptor.lifecycle==="dissolved"`, and require copilot session-id evidence in the pane before `applyBinding` | pij-control-plane | `core/daemon/loop.ts` | RED→GREEN; a dissolved/mismatched pane → `waiting`/`fail`, never `bound` | rebase after s391 item 5 |
| [ ] | T004 | daemon-level test: a dissolved pane-less seat + a fresh unregistered same-harness pane → ZERO deliveries (the ruling's acceptance test) | pij-control-plane | `core/daemon/loop.test.ts` or a daemon test | zero `sendText`/`sendSocket`/pointer to the fresh pane | the headline proof |
| [ ] | T005 | gates + pathspec commit + report | pij-control-plane | `reports/item-10-report.md` | recorded | |

### Open
- Exact re-bind path that matched `%108` to a `%94` seat is not yet pinned from logs (daemon log rotated; pane vanished before capture). T004's fake-registry reproduction is the deterministic proof regardless of the precise live trigger; note this honestly in the report.
- s391 item 5 touches `loop.ts` — land after it; `git merge-tree` check before the PR.
