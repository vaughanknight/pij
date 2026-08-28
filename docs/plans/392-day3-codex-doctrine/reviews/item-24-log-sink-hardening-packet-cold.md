# Item-24 log-sink hardening — COLD REVIEW packet

**Candidate**: 66d0acd3fc7db4e80d2a98e99661bde69c004e01 (= 65560901 + B1/B2/W3), branch s392/item24-logsink-hardening-falcon. Build on the item-24-chain tree (T-LOG1 needs item-24 bridge.ts b1f0e0a — do NOT green on bare main).
**Why re-review**: the original log-sink fold was CONDITIONAL APPROVE (`reviews/item-24-log-sink-verdict.md`) with a BLOCKING B1 (unguarded tee crashes the daemon from inside the consumer crash-guard, on Vaughan's phone channel) + a MAJOR B2 (T-LOG1 sensored the unused autoStart path, not production). This fold is FRESH implementation of those fixes + W3. Cold eyes required.

## What changed (index.ts +14/-2; index.test.ts +142; daemon.test.ts +3)
- **B1**: `bridgeFileLog` now calls `baseLog(message)` FIRST, wraps `appendFileSync` in try/catch, and reports durable degradation ONCE per sink (`teeFailureReported` closure latch), then stays silent.
- **B2**: `DaemonBridgeOverrides` threads through `bridgeSupervisorForDaemon`; new T-LOG1-SUP drives the REAL supervisor/runtime/startBridge path (the production path, daemon.ts:1776).
- **W3**: a daemon watcher capture must contain the bridge-log tail.

## Mechanical oracle (E37 — RUN each; orchestrator already ran authoritatively, results are the bar)
Patches under `tasks/item-24-log-sink/`. Baseline (telegram+daemon fence) = 296 passed | 4 skipped.
- `MUT-TEE-UNGUARDED` (remove try/catch) → RED index.test.ts:707 ("keeps delivery alive and pane-visible when the durable tee cannot append"). Revert → GREEN.
- `MUT-REPORT-ONCE` (remove latch) → RED index.test.ts:744 ("reports a failed durable tee only once across repeated forwards"). Revert → GREEN.
- `MUT-SUPERVISOR-UNWIRE` (revert supervisor wiring) → RED T-LOG1-SUP @ index.test.ts:957. Revert → GREEN.
- `MUT-CAPTURE-TAIL-PATH` (break tail path) → RED daemon.test.ts:234. Revert → GREEN.

## Review asks (independent verification, not re-reading my results)
1. **B1 no-crash, for real**: reproduce your own EACCES (chmod 0444) / ENOENT scenario on the candidate — delivery must ACK, the pane log must carry the line, and the process must NOT exit. Confirm the throw path through queue-consumer.ts:56-57 is now dead.
2. **B1 double-append preserved**: baseLog-first reordering must NOT change the 1:1 file==pane property (your prior ask #2). Re-measure over several real forwards.
3. **B1 report-once scope**: the latch is a per-sink closure — confirm it does not suppress a DIFFERENT sink's first warning, and that a warning is emitted exactly once per failing sink (not zero, not per-message).
4. **B2 drives PRODUCTION**: confirm T-LOG1-SUP drives the real `bridgeSupervisorForDaemon` (not a re-faked autoStart), and that MUT-SUPERVISOR-UNWIRE reverts the wiring the daemon actually runs (daemon.ts:1776).
5. **W3 honest**: the capture assertion senses the real tail, and MUT-CAPTURE-TAIL-PATH breaks the path production uses.
6. **E40**: name the covering test per touched line; ≥1 must be "none" (no prior coverage).
7. **No collateral / re-confirm original acceptance**: T-LOG1 still green; forward-error + queue-consumer-error assertions still hold; nothing removed.
8. Deferred (NOT blockers): A4 rotation; concurrent append (standalone + in-process on one file) — note if the fold worsens it.

**Verdict artifact target**: `reviews/item-24-log-sink-hardening-verdict.md`. Post-restart LIVE proof stays with the orchestrator (not an APPROVE blocker).
