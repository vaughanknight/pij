# Phase 9: Item 25 — busy-but-wedged stall detection + pane-growth activity — tasks dossier

**Plan**: § Phase 9, AC-23, AC-23b · **Branch/PR**: `s391/item25-wedged-stall` off `main` · **Domain**: pij-control-plane (daemon runtime axis / pane signals / watchdog projection / `pij state`) · **CS**: 3
**Rulings**: 12:30Z (item 25, E19); 13:55Z (inverse case: pane-buffer growth = activity, DL-010).
**Evidence**: DL-008 (reviewer wedged >80 min: static buffer 111.5 KiB, composer "Queued (4)", daemon `working`, watchdog "paused (compact)" for a QUEUED compact); DL-010 (coder mid-turn 70+ min read `idle`: lastEventAt frozen because RPC-driven copilot work makes no pij CLI calls).

### Executive Briefing
- **Purpose**: the runtime axis derives `systemState` from `pidAlive`, `paneSuspended`, `lifecycle`, the coarse `state` and `latestEventAgeMs` (`core/state.ts systemStateOf :113-124`, inputs built in `core/daemon/runtime-axis.ts inputsFor :110`). Pane signals already measure byte deltas for the busy oracle (`core/daemon/pane-signals.ts` `BUSY_BYTE_THRESHOLD`, `BUSY_WINDOW_MS`) and parse the composer (`composerLength`), but neither feeds `systemStateOf`. Two failure shapes follow: (a) a wedged turn with inputs queued behind it reads `working` forever; (b) a seat doing RPC-driven work with no pij events reads `idle`. Both are fixed by making pane-buffer growth an ACTIVITY signal and a static buffer + non-empty composer queue a STALL signal; and a queued `/compact` must not read as "paused (compact)".
- **Goals**: ✅ AC-23 static buffer ≥ N min AND composer `Queued (k>0)` (copilot) ⇒ `stalled` + notice to the parent (item 16 routing) · ✅ AC-23b buffer growth across ticks ⇒ `working` even with `lastEventAt` frozen · ✅ `pij state` shows the copilot composer queue count · ✅ watchdog `paused (compact)` only while a compact turn is OBSERVED running
- **Non-Goals**: ❌ changing the busy oracle thresholds · ❌ non-copilot composer parsing beyond what exists · ❌ auto-interrupting a wedged turn (notice only)

### Pre-Implementation Check
| File | Exists? | Notes |
|---|---|---|
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/state.ts` | yes | `systemStateOf(inputs)` `:112-` (at main e935c88) — pure; add optional inputs `paneGrowthMs?` (ms since the pane buffer last grew) and `composerQueued?` (count) — additive, existing callers unchanged |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/state.test.ts` | yes | verdict table tests |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/daemon/runtime-axis.ts` | yes | `inputsFor` (re-grep — not at the old line); `persistDaemonWrite` `:94` (at main e935c88); per-tick — supply the two new inputs from pane signals |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/daemon/runtime-axis.test.ts` | yes | |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/daemon/pane-signals.ts` | yes | byte-delta busy oracle (`BUSY_BYTE_THRESHOLD` `:4`, `BUSY_WINDOW_MS` `:3`); composer parse (`composerLength` — re-grep on your base; the old lines have moved); add: last-growth timestamp per pane + copilot `Queued (n)` parse |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/daemon/pane-signals.test.ts` | yes | |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/daemon/watchdog-manager.ts` | yes | `pausedBy === "compact"` sidecar `:467` (at main e935c88); the pause must be set by an OBSERVED compact turn (pane shows compacting) not by the queued `/compact` command |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/daemon/watchdog-scheduler-projection.ts` | yes | renders "paused (compact)" |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/cli.ts` (`pij state` renderer) | yes | add `queued: n` to the line/JSON |
| `docs/how/pij-watchdog.md`, `docs/how/pij.md` | yes | |

### Tasks
| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | TEST (RED) `state.test.ts`: `systemStateOf({state:"working", latestEventAgeMs: 2h, paneGrowthMs: 5s})` → `working` (AC-23b); `{…, paneGrowthMs: 20min, composerQueued: 2}` → `stalled` (AC-23); `{…, paneGrowthMs: 20min, composerQueued: 0}` → existing verdict (a long legitimate tool call is not a stall); inputs absent → existing behaviour byte-for-byte | pij-control-plane | RED | AC-23/23b |
| [ ] | T002 | TEST (RED) `pane-signals.test.ts`: per-pane last-growth tracking across captures; copilot composer `Queued (3) ctrl+q to manage` parses to 3; absent → 0 | pij-control-plane | RED | |
| [ ] | T003 | TEST (RED) `runtime-axis.test.ts`: fake pane signals drive the two new inputs; a wedged seat gets a `stalled` notice routed via `noticeRecipient` (item 16) once, not every tick | pij-control-plane | RED | AC-23 |
| [ ] | T004 | TEST (RED) watchdog: a `/compact` that is QUEUED (composer shows it, pane not compacting) → not `paused (compact)`; an observed compacting pane → paused | pij-control-plane | RED | |
| [ ] | T005 | IMPL all of the above; `pij state` renders `queued N` when >0; N (static-buffer minutes) named + documented | pij-control-plane | T001–T004 GREEN | |
| [ ] | T006 | DOCS + GATE + PR | — | 0 fail | AC-10 |

### Discoveries & Learnings
| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
