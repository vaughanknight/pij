# Watchdog isolated proof log — Phase 3

**Date**: 2026-07-17  
**Delegation**: `dlg-0003`  
**Product fix reviewed**: `fix-0003`, commit `27dceeb`  
**Proof strengthening**: `fix-0004` (four review findings made load-bearing)  
**Environment**: a fresh `${TMPDIR}/pij-watchdog-proof-<scenario>-<run>` for every scenario, removed in `finally`  
**Live daemon / real `~/.pij`**: untouched; the runner rejects the resolved real home  
**Tmux**: available; every pane-backed scenario used a named scratch session and killed it in `finally`  
**Activity evidence**: descriptor `lastEventAt` + typed pane/working observations only; never `events.ndjson`  
**Result**: **PASS — AC-01 through AC-10 demonstrated with zero skips**

## Acceptance verdicts

| AC | Verdict | Evidence |
|---|---|---|
| AC-01 | **PASS** | With no sidecar, a bound scratch-tmux peer fired once at exactly 1,200,000 ms; descriptor `lastWatchdogFireAt=1970-01-01T00:20:00.000Z`. |
| AC-02 | **PASS** | The delivered turn and captured scratch pane contained ordinal/id, exact `pij watchdog pause <id>` and `resume <id>` commands, and `If done, pause me` etiquette. |
| AC-03 | **PASS** | Real CLI + temp store: first inbox turn count 1; `pause` held it at 1 through another interval; `resume` raised it to 2. Both paused and resumed points invoked dedicated `pij watchdog list --json`, located the target, and exactly matched all six projection fields (`enabled`, `intervalMs`, `pausedBy`, `exempt`, `lastFireAt`, `watchers`). `pij state --json` and top-level `pij list --json` matched as additive parity. |
| AC-04 | **PASS** | Real CLI `send --command compact` persisted `compact` before tmux `/compact` injection and real working auto-resumed it. Bare `/compact` reached `PijSession`; its pi runtime `compact()` callback asserted `pausedBy:"compact"` at call time, was called once, and auto-resumed on `turn_start`. |
| AC-05 | **PASS** | A byte-stable scratch pane received four scheduled turns without skips. The attributed working and idle-return ticks both retained `failureReason:"stalled"`, 1/1 notice totals, and the epoch `lastEventAt`. Real output then cleared the reason and moved activity to 403 ms. Four further due fires established a second silent episode. |
| AC-06 | **PASS** | Episode 1 sent exactly one owner and one anomaly-watcher stalled notice. Typed recovery reset both latches; episode 2 raised cumulative totals to exactly 2/2 and restamped `stalled`. A separate unowned root session also persisted `stalled`. |
| AC-07 | **PASS** | Default anomaly stayed silent on the healthy fire, then stored a 24-line/4,094-byte tail; healthy `always` stored a 98-line/16,383-byte hard-capped tail. Both were non-empty, exactly matched an independently calculated direct-pane tail, retained `WD-CAP-258` then `WD-CAP-259`, crossed a three-byte `€` boundary without replacement/splitting, and had notice inline lines exactly equal to the first up-to-five stored lines. Both pointers stayed under the watcher’s temp capture directory. |
| AC-08 | **PASS** | `parseSpawnArgs --no-watchdog` produced `PIJ_NO_WATCHDOG=1`; child boot persisted `pausedBy:"exempt"`. Three default intervals produced zero turns and no stall reason; state/list JSON both showed `exempt:true`. |
| AC-09 | **PASS** | AC-01..08 and AC-10 all passed in per-scenario disposable homes after both required proof-integrity sabotages went RED; 9 non-aggregate AC rows passed, 0 skipped, 0 failed. No live daemon restart or real-home access occurred. |
| AC-10 | **PASS** | Bound tmux target used `sendText`; paneless pi target received durable inbox turns and stalled from descriptor event silence only; its watcher said capture unavailable and wrote no file. A `lifecycle:"ready"` pre-bind peer received no fire and no `lastWatchdogFireAt`. |

## Reproduction

```sh
npx tsx docs/plans/055-pij-watchdog/proofs/run-proofs.ts --list
npx tsx docs/plans/055-pij-watchdog/proofs/run-proofs.ts
npx tsx docs/plans/055-pij-watchdog/proofs/run-proofs.ts --smoke
```

Final proof summary:

```json
{
  "verdict": "PASS",
  "passed": 9,
  "skipped": 0,
  "failed": 0,
  "tmuxAvailable": true,
  "eventsNdjsonUsedAsActivityEvidence": false
}
```

Runner SHA-256 on the clean run:

```text
fc10a1a133915f47e55c4a08a3272a1821a4109f3a8bfd6701a44f645c763c8d
```

### Required adversarial proof-integrity checks

| Sabotage | Required result | Observed evidence | Restoration |
|---|---|---|---|
| AC-07 daemon capture seam returns no pane text | RED, exit 1 | AC-07 FAIL: `healthy always-mode capture was empty`; summary 6 pass / 2 skip / 1 fail | SHA-256 `fc10…c8d` before and after |
| Attributed working descriptor write clears `failureReason` early | RED, exit 1 | AC-05/06 FAIL: `attributed working edge cleared stalled`; summary 4 pass / 3 skip / 2 AC rows fail | SHA-256 `fc10…c8d` before and after |

Each sabotage was applied only to the runner, executed against disposable homes,
and restored byte-identically before the final clean run.

The deterministic smoke composite separately passed: scratch spawn → first
fire → explicit pause suppression → resume fire → compact pause persisted before
injection → real-working auto-resume → readable capture pointer. It is registered
in `harness/scripts/smoke.ts`; the full `just smoke` run passed all ten smoke
entries without retries.

## Harness corrections during proof

The first expanded frozen-pane and smoke runs did not model the harness's brief
busy→idle lifecycle around an injected watchdog turn. The scratch `cat` pane has
no Claude/Pi footer, so the runner initially mislabeled the next working edge.
The proof harness—not product code—was corrected to drive that typed,
watchdog-attributed transition pair before real output. The corrected sequence
is now guarded by negative assertions at both attributed edges and passes
deterministically.

A second proof-only correction initializes the AC-07 pane by printing a UTF-8
fixture file from inside the scratch process. Sending thousands of multibyte
characters through one tmux paste introduced replacement glyphs in the terminal
transport itself; process-side output keeps the source valid so the proof tests
watchdog byte truncation rather than tmux paste chunking.
