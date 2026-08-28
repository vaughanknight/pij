# Item 24 fold — in-process bridge persists its log to ~/.pij/telegram-bridge.log

**Parent**: item 24 PR (folds onto the item-24 chain tip d42fc5b).
**Ruling**: o-prime 2026-08-28 00:2xZ (rulings.md); encoded as orient-local E42/E43 (bridge sensor path STALE since item 29).
**Fence**: `.pi/extensions/pij/telegram/index.ts` (+ `index.test.ts`); the standalone `telegramStart` dedup is same-file. NO bridge.ts change.

## THE GAP (grounded, tip d42fc5b)
The bridge's log sink is a `(message) => void` passed into `runtimeFor(pijHome, log)`. `forwardOne` calls it for EVERY event: `forwarded <id> part x/N` (bridge.ts:749, SUCCESS), the error label (`:756`), ForwardIncomplete (`:784` → caught → logged), targets (`:353`).
- STANDALONE `telegramStart` (index.ts:~638): its `log` does `appendFileSync(~/.pij/telegram-bridge.log, ...)` + stdout. => file gets everything.
- IN-PROCESS `autoStartBridgeForDaemon` (index.ts:499) and `bridgeSupervisorForDaemon` (:522/:526/:528): pass the DAEMON'S `log`/`callbacks.log` (daemon pane/stdout ONLY) into `runtimeFor`. => file gets NOTHING. mtime frozen at the last standalone shutdown (20:53Z restart #5).
Result: post-item-29 the human-channel sensor is blind; the affected rows' error lines were never durably captured (that's why item-24's root cause is a HYPOTHESIS, not evidence).

## THE FIX (recommended; coder/reviewer may refine shape)
Introduce one file-teeing sink helper, e.g. `bridgeFileLog(pijHome, baseLog): (message) => void` that:
  appendFileSync(join(pijHome, "telegram-bridge.log"), `[pij-telegram] ${message}\n`); baseLog(message);
Wire it into BOTH in-process paths:
  - autoStartBridgeForDaemon: `runtimeFor(pijHome, bridgeFileLog(pijHome, log))` and the onStart log.
  - bridgeSupervisorForDaemon: wrap `callbacks.log` once with `bridgeFileLog(pijHome, callbacks.log)` and use for buildRuntime + onStart + startDeps.log.
And DEDUPE the standalone `telegramStart` onto the same helper (its hand-rolled append becomes `bridgeFileLog(pijHome, m => process.stdout.write(`[pij-telegram] ${m}\n`))`) so all three paths share ONE format. Keep the `[pij-telegram] ` prefix + trailing newline in the helper (format parity with the standalone-era file).

## ACCEPTANCE TEST (o-prime spec — behavioural, NOT a grep of the sink call)
T-LOG1: build the IN-PROCESS bridge runtime (via the supervisor/autostart path, temp PIJ_HOME) and drive the log sink through a forward that (a) succeeds and (b) errors/ForwardIncomplete. Assert `<PIJ_HOME>/telegram-bridge.log` CONTAINS the `forwarded ...` line AND the error/ForwardIncomplete line, and that the file's mtime advanced from before the forward. Drive it through the real in-process wiring, not by calling appendFileSync directly.

## MUTANT (E37/E40 mechanical oracle — reviewer saves as MUT-LOGSINK.patch)
Delete the file-append tee from the in-process sink (make bridgeFileLog call only baseLog on the in-process path). apply → T-LOG1 RED (file empty / mtime unchanged); revert → GREEN. The reviewer NAMES the covering test for every touched line; the tee line has NO existing coverage today (only the standalone path is tested — index.test.ts:149 `runtimeFor queue backend` does not assert file writes), satisfying E40. Reviewer RUNS the patch.

## LIVE PROOF (after restart #6, orchestrator captures)
(1) `~/.pij/telegram-bridge.log` mtime advances on the first forwarded message post-restart;
(2) the first attempt-2 row after that has its attempt-1 error line IN the file. => root cause PROVABLE next time, not inferred.
