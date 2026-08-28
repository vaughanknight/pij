# Item-24 log-sink — C1/C2/C3 close-out fold

**Base**: 66d0acd (hardening; cold review APPROVE with 2 major advisories — `reviews/item-24-log-sink-hardening-verdict.md`). Build on the item-24-chain tree (T-LOG1 needs item-24 bridge.ts b1f0e0a; do NOT green on bare main).
**Rulings**: all three fold before the item-24 PR — C1/C2 are load-bearing on the human-channel bridge-log diagnostic; C2 is a MEASURED silent loss (o-prime ruling: silent loss outranks noisy duplicate, always). Reviewer prescribed each fix; orchestrator's authoritative oracle re-run is the gate.

## C1 — fully close B2: sensor the supervisor's OWN-log wiring
`bridgeSupervisorForDaemon` builds `bridgeLog` and threads it to TWO sites: `startDeps → daemonBridgeDepsFor(pijHome, bridgeLog, overrides)` (sensored by T-LOG1-SUP :957) AND `superviseBridge({ … log: bridgeLog … })` (index.ts:571 — UNSENSORED). MUT-SUPERVISOR-UNWIRE reverted both at once; the reviewer split it and proved the own-log half is SILENT (296 = baseline). Harm on the real supervisor with a dead lock pid: durable file 153→64 bytes, restart-evidence line 1→0, suite green — and W3's capture tails that same file, so the regression empties the evidence W3 guarantees.
**Fix**: add an assertion on the existing T-LOG1-SUP that drives a RESTART (dead lock pid → supervisor.tick restarts) and asserts the restart notice appears in telegram-bridge.log.
**Oracle** (replace the two-site MUT-SUPERVISOR-UNWIRE with two discriminating patches under `tasks/item-24-log-sink/`):
- `MUT-SUP-DEPS-ONLY.patch` (mutate only the deps `bridgeLog`) → RED T-LOG1-SUP :957.
- `MUT-SUP-OWNLOG-ONLY.patch` (mutate only `superviseBridge`'s `log: bridgeLog` at :571, e.g. → `callbacks.log`) → RED the NEW restart-evidence assertion; pre-existing tests GREEN.

## C2 — report-once must be once-per-OUTAGE, not once-per-lifetime
`bridgeFileLog`'s `teeFailureReported` is set once and never cleared → fail→recover→fail SILENTLY loses the second outage's warning (reviewer measured phase-4 outage reported not at all). Silent loss on the human channel.
**Fix**: on a SUCCESSFUL `appendFileSync`, clear the latch (`teeFailureReported = false`). Keeps the within-outage anti-spam (still exactly one warning per outage).
**Oracle**: `MUT-LATCH-NO-CLEAR.patch` (remove the clear-on-success) → RED a new test "reports each distinct outage once (fail→recover→fail warns twice)". Revert → GREEN.

## C3 — W3 oracle must DISCRIMINATE (E40)
`MUT-CAPTURE-TAIL-PATH` reds on the PRE-FIX tree too (via `expect(logs).toEqual([])`) — fails E40 (a red on already-covered code proves existing coverage, not the fold). W3 IS genuine new coverage; only its oracle was wrong.
**Fix**: remove `MUT-CAPTURE-TAIL-PATH.patch`; commit the reviewer's `MUT-CAPTURE-EMPTY-TAIL.patch` (`.slice(-4096)` → `.slice(0,0)`; read succeeds, nothing throws) → candidate RED daemon.test.ts:234, pre-fix tree GREEN. Verify BOTH bases.

## Minor
Add a one-line comment at the B1 tests (index.test.ts ~707/744): both drive `autoStartBridgeForDaemon` (which still has no production caller), but the guard under test lives in the SHARED `bridgeFileLog`, so this is valid coverage.

## Gates + deliverable
- `just typecheck` 0; biome clean on changed files; `npx vitest run .pi/extensions/pij/telegram/ .pi/extensions/pij/daemon.test.ts` GREEN.
- RUN every mutant (E37: apply→RED@line→revert→GREEN); the C3 oracle also verified GREEN on the pre-fix tree. E40 ledger: covering test per touched line, ≥1 = none.
- Commit on top of 66d0acd in YOUR OWN build worktree (COORD-010; explicit pathspec). Report new candidate sha + all mutant results.
- Deferred (NOT this fold): A4 rotation; standalone+in-process concurrency.
