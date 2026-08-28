# Item-24 log-sink C1/C2/C3 — stream verdict (orchestrator authoritative oracle)

**Candidate**: 140807685a1ed93d0654604deb148eb779b58710 (= 66d0acd + C1/C2/C3). Log-sink chain HEAD.
**No third cold review**: C1/C2/C3 are the cold reviewer's OWN prescribed fixes (C3's discriminating oracle was reviewer-built). Gate = orchestrator's authoritative oracle re-run below.

## Fixes verified
- **C1 (B2 fully closed)**: supervisor own-log wiring now sensored. MUT-SUP-DEPS-ONLY RED (T-LOG1-SUP) + MUT-SUP-OWNLOG-ONLY RED @index.test.ts:996 (new dead-pid restart-evidence assertion). Two-site MUT-SUPERVISOR-UNWIRE removed.
- **C2 (once-per-outage)**: `bridgeFileLog` clears `teeFailureReported = false` on a successful append. MUT-LATCH-NO-CLEAR RED @index.test.ts:767 (1 warning instead of 2 across fail→recover→fail). Fixes the measured silent loss.
- **C3 (discriminating W3 oracle)**: MUT-CAPTURE-TAIL-PATH removed (red pre-fix too); MUT-CAPTURE-EMPTY-TAIL committed.

## Authoritative oracle (RUN by orchestrator, detached worktree @1408076, node_modules linked; lock identical)
Baseline (telegram+daemon fence): 296 passed | 4 skipped.
All 7 mutants apply → RED → revert → GREEN, tree clean:
| mutant | result |
|--------|--------|
| MUT-LOGSINK | RED (index.test.ts) → GREEN |
| MUT-TEE-UNGUARDED | RED (delivery never acked) → GREEN |
| MUT-REPORT-ONCE | RED → GREEN |
| MUT-LATCH-NO-CLEAR | RED :767 → GREEN |
| MUT-SUP-DEPS-ONLY | RED → GREEN |
| MUT-SUP-OWNLOG-ONLY | RED :996 → GREEN |
| MUT-CAPTURE-EMPTY-TAIL | candidate RED daemon.test.ts:234 → GREEN |

**C3 discrimination confirmed by orchestrator on a SEPARATE pre-fix worktree**: MUT-CAPTURE-EMPTY-TAIL applied to 65560901 → 73 passed | 2 skipped, **GREEN** (no W3 assertion there). Candidate RED / pre-fix GREEN ⇒ W3 is genuine new coverage (E40).

## Gates (coder-reported + orchestrator baseline)
tsc 0; biome clean; fence 296 passed/4 skipped. E40: no uncovered touched production lines.

**Verdict: log-sink work COMPLETE. Item-24 PR log-sink chain HEAD = 1408076.**
