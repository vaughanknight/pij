# 25 — Busy-but-wedged stall detection: a copilot seat stuck on one turn with inputs queued must read `stalled`, not `working`; a queued `/compact` is not a running compact

**Item id / stream at handover:** 25 · s391-day3-core
**Status at v0.2.0 (tag `d120c53`):** designed (Phase 9 of the s391 plan; dossier `docs/plans/391-day3-core/tasks/phase-9-item-25-wedged-stall/tasks.md`, packet compiled; no branch)
**Size estimate:** M (half a day) · **Order / dependencies:** after item 31 (merged — `staleAfterMsFor` exists) and 16 (merged — `resolveNoticeRecipient`); independent of 26

## 1. Why this exists (the observed failure, with evidence)
- 2026-08-28 ~10:40–12:00Z (fleet record `docs/plans/391-day3-core/fleet.md` row "pij-mobile-reptile"; DL-008 recorded in `docs/plans/391-day3-core/391-day3-core-plan.md:541`, not in rulings.md): the s391 cold reviewer sat >80 min on ONE copilot turn (a bash tool call that never returned) with the composer showing `Queued (4)` (a bg gate result, `/compact`, two packets), while the daemon reported `working` and the watchdog `paused (compact)` — the queued `/compact` had been taken as a running compact. Esc/Ctrl-C had no effect; the seat was closed and replaced.
- Repeated 2026-08-28 ~06:0xZ with its replacement `pij-powerful-whale` (`rulings.md` rows DL-015/DL-016 and the closure row ~06:1xZ): a packet injected while the seat was mid-turn (its own `/compact`) became an "interactive" queued item that never ran once the model was idle; later the seat showed `◉ Working · 119.2 KiB` for ~30 min with zero transcript growth and no child process; Esc/Ctrl-C ineffective; closed. Both times the daemon's state axis said `working` throughout — there was nothing for a supervisor to see except by reading the pane.
- The runtime axis (`core/state.ts systemStateOf` `:112-`) derives `working|stalled` from telemetry age alone (rule 5: `working` telemetry silent past the stale threshold → `stalled`); a wedged copilot turn keeps emitting telemetry (the harness's own status line), so it never goes stale.

## 2. What is ruled (design / spec)
- AC-23 (plan): a copilot seat whose pane buffer is static for ≥ N minutes AND whose composer queue is non-empty is reported `stalled` (notice to its parent via `resolveNoticeRecipient`, item 16; signed `pij-daemon`, item 31); `pij state` shows the queue count; a queued `/compact` never yields `paused (compact)`.
- AC-23b (o-prime 13:55Z, DL-010, inverse): pane-buffer GROWTH is liveness — a long legitimate tool call (buffer growing, queue empty) is `working` regardless of telemetry age; so N counts only STATIC-buffer minutes.
- Watchdog `pausedBy: "compact"` is set only by an OBSERVED compact (pane shows compacting), never by the queued command.
- N is a named, documented constant (start at 15 min), one notice per episode (task #34 class), cleared when the buffer grows or the queue drains.

## 3. Where the code is (at tag `d120c53`)
- `.pi/extensions/pij/core/state.ts` — `systemStateOf(inputs)` `:112-` (pure); add optional inputs `paneGrowthMs?` (ms since the pane buffer last grew) and `composerQueued?` (count); additive, existing callers unchanged.
- `.pi/extensions/pij/core/daemon/runtime-axis.ts` — per-tick input builder (`inputsFor`-style function; `persistDaemonWrite(...)` at `:94`) — supply the two new inputs from pane signals; the stalled notice goes through the daemon's legacy detector path (`daemon.ts pushWholeLifeTransition`, `:~1184`) which already routes and signs correctly since items 16/31.
- `.pi/extensions/pij/core/daemon/pane-signals.ts` — byte-delta busy oracle (`BUSY_WINDOW_MS` `:3`, `BUSY_BYTE_THRESHOLD` `:4`); composer parsing (`composerLength` — re-grep); add per-pane last-growth timestamp and the copilot queue parse (`Queued (N) ctrl+q to manage` → N; absent → 0). Pane text arrives via the existing pane tap (`ports.attachPaneTap` / `capturePane`).
- `.pi/extensions/pij/core/daemon/watchdog-manager.ts` — `pausedBy === "compact"` sidecar handling `:~467` (`applyWorkingTransition`); the pause must be set by an observed compacting pane, not by the queued command; the `paused (compact)` status string is rendered in `core/watchdog.ts:517` (not the scheduler projection).
- `.pi/extensions/pij/core/cli.ts` — `pij state` renderer: `case "state"` `:3676`, `--json` literal `:3694-3747`, text renderer beside it: add `queued: N` (NOT `:2900-2963`, which is `list --json`).
- Docs: `docs/how/pij-watchdog.md`, `docs/how/pij.md`.

## 4. Acceptance (behavioural, mechanical)
- `state.test.ts`: `systemStateOf({state:"working", latestEventAgeMs: 2h, paneGrowthMs: 5s})` → `working` (AC-23b); `{…, paneGrowthMs: 20min, composerQueued: 2}` → `stalled`; `{…, paneGrowthMs: 20min, composerQueued: 0}` → existing verdict; inputs absent → existing verdict (additive).
- `pane-signals.test.ts`: last-growth tracking across captures; `Queued (3) ctrl+q to manage` → 3; absent → 0; a non-copilot pane → 0.
- `runtime-axis.test.ts` + `daemon.test.ts`: fake pane signals drive the inputs; a wedged seat gets ONE `stalled` notice routed via `resolveNoticeRecipient`, signed `pij-daemon`; buffer growth clears it.
- Watchdog: queued `/compact` (composer shows it, pane not compacting) → NOT `paused (compact)`; observed compacting pane → paused.
- `cli.integration.test.ts`: `pij state <id>` shows `queued 2`; `--json` has `queued: 2`.
- Mutants: **MUT-25a** ignore `composerQueued` → wedged case RED; **MUT-25b** ignore `paneGrowthMs` (use telemetry age) → AC-23b case RED; **MUT-25c** set `pausedBy: compact` from the queued command → watchdog case RED; **MUT-25d** emit the notice every tick → the once-per-episode assertion RED. Fixtures on both sides of N (DL-019).
- Gates: full `npx vitest run .pi/extensions/pij/` at the merge product; `just typecheck`; `just pij-skill-check`.

## 5. Live verification (after a daemon restart carrying it)
Spawn a copilot seat, queue two messages behind a long `sleep 1200` tool call (`pij send` twice while it runs): after N minutes `pij state <id>` → `stalled · queued 2` and the parent receives one `⏸ … has gone quiet` signed `pij-daemon`; run `cat` in the pane (buffer grows) → back to `working`. A queued `/compact` shows `queued 1`, and `pij watchdog status <id>` does NOT say `paused (compact)`.

## 6. Risks / gotchas that already bit us
- DL-008 (`391-day3-core-plan.md:541`) / DL-015 / DL-016 (`rulings.md`): two reviewers lost to the same wedge in one day; the daemon said `working` both times.
- DL-010 (E-rule "growth is liveness"): without AC-23b, every long vitest run would be a stall.
- E34/E40: the mutants must hit the daemon composition (runtime-axis → state → notice), not just the pure function.
- Copilot's composer text is a UI contract of the Copilot CLI (`Queued (N) ctrl+q to manage`, 1.0.81-14); pin the parse with a fixture and name the version.

## 7. Open questions for the human
1. N (static-buffer minutes before `stalled`): 15? The o-prime observed 80 min; 15 balances against long gates (≈4 min).
