# Phase 1 execution log — pure watchdog core

**Date:** 2026-07-17  
**Delegation:** `dlg-0001`  
**Fix cycle:** `fix-0001`

## Outcome by task

| Task | Outcome | Evidence |
|---|---|---|
| T001 | Complete | Wrote the tier/default suite first; absent implementation produced the expected RED (`Cannot find module './watchdog.js'`). The suite covers default-on behavior, interval override, self/compact/exempt transitions, compact auto-resume, and exemption. |
| T002 | Complete | Added the additive `WatchdogSidecar`/`WatchdogPauseTier` contract in `types.ts` and pure `effectiveWatchdog()` resolution in `watchdog.ts`; no daemon import or I/O. |
| T003 | Complete | Added activity-anchored `isFireDue()` cases for exact boundaries, work re-anchoring, repeated frozen-peer fires, and disabled/paused/exempt suppression. |
| T004 | Complete after `fix-0001` | Added typed optional pane observations and watchdog attribution for event advance, pane change, and working transition. Two silent delivered fires derive `stalled`; real recovery derives `responsive`; paneless peers use event activity only. |
| T005 | Complete | Added a snapshot-tested, sub-400-character self-teaching watchdog turn with exact pause/resume commands, ordinal, etiquette, and a paneless capture notice. |
| T006 | Complete | Added anomaly/always/never gating plus UTF-8-safe tail capture with 40-line/4096-byte defaults and 200-line/16384-byte ceilings. |
| T007 | Complete | Added the idempotent shared compact-pause hook; self pauses and exemptions are never downgraded. |
| T008 | Complete | Required typecheck, full test, and lint gates passed in the isolated s055 worktree. |

## Files changed

- `.pi/extensions/pij/core/watchdog.ts` — pure watchdog configuration, transitions, scheduling, derivation, turn, and capture decisions.
- `.pi/extensions/pij/core/watchdog.test.ts` — T001–T007 behavior and boundary coverage.
- `.pi/extensions/pij/core/types.ts` — additive watchdog sidecar contract.
- `docs/plans/055-pij-watchdog/tasks/phase-1-pure-watchdog-core/tasks.md` — T001–T008 status completion.
- `docs/plans/055-pij-watchdog/tasks/phase-1-pure-watchdog-core/execution.log.md` — required execution record.

## Key decisions

- Absence of a sidecar resolves to enabled at `1_200_000` ms; persisted overrides remain structural and optional.
- Pause strength is explicit: `self` requires the resume verb, `compact` resumes on observed real work, and `exempt` remains excluded from firing and derivation.
- Pane observations remain optional for paneless peers. Every potentially self-masking signal has independent typed watchdog attribution; attribution is never inferred from text.
- Capture is tail-only, satisfies both limits, and never splits a UTF-8 code point.
- `applyCompactPause()` is the one pure compact seam and preserves stronger existing states.

## Honest execution history

1. The tests-first run went RED because `watchdog.ts` did not exist.
2. T001–T008 were implemented and the initial worktree gates passed: typecheck; 2,045 tests passed with 11 skipped; lint exited 0 with 10 non-failing warnings and 1 info outside the touched files.
3. The initial worker report claimed `COMPLETE`.
4. Review `rev-0001` returned `FIX_REQUIRED` for two criticals: watchdog-attributable `workingTransition` could fabricate recovery, and this execution artifact/status update was missing.
5. In `fix-0001`, the combined all-watchdog-attributable fixture went RED (`responsive` instead of `stalled`). Adding typed `workingTransitionWasWatchdog` attribution and filtering it in `evaluateResponse()` made all 26 focused watchdog tests pass.
6. The load-bearing guard was mutation-checked: removing `&& !inputs.pane.workingTransitionWasWatchdog` made the combined fixture fail; restoring it made the fixture pass.

## Observed gates

- `just typecheck` — PASS.
- `just test` — PASS: 2,045 passed, 11 skipped (2,056 total).
- `just lint` — PASS (exit 0; 10 existing non-failing warnings and 1 info).
- `harness checks` — PASS: all 8 sensors ran, none skipped.
- Focused watchdog suite after the fix — `Tests 26 passed (26)`.

## Discoveries

- A pane busy/working transition is not inherently peer-originated: delivery of the watchdog turn can produce it, so transition attribution must be typed just like event and pane-text attribution.
- Artifact completion is part of task completion. A green implementation without its required execution log and task-state update is not a complete phase.
