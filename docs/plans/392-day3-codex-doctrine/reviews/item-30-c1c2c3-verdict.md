# Item-30 C1/C2/C3 — stream verdict (orchestrator authoritative oracle)

**Candidate**: 06fdd3f843f7b79baaa6d54a37b3e6e7118b10ad (item 30 + C1/C2/C3). Item-30 chain HEAD.
**No re-review**: C1 command was o-prime-confirmed; C2/C3 are the cold reviewer's OWN test-gap findings with prescribed sensors. Gate = orchestrator authoritative oracle below.

## Fixes verified
- **C1**: guidance string = `pij watchdog watch pij-telegram` (bridge.ts:64) — pinned by bridge.test.ts:577 + index.test.ts:446 (`toContain`). The message-lost recovery instruction is now the command that actually populates the watchdog roster item-30 + 29b read.
- **C2**: media pre-download recheck (bridge.ts:468) now sensored — MUT-MEDIA-RECHECK RED @bridge.test.ts:2171.
- **C3**: address pre-selection recheck (bridge.ts:409) now sensored — MUT-ADDRESS-RECHECK RED @bridge.test.ts:627.

## Authoritative oracle (RUN by orchestrator @06fdd3f; lock identical). Baseline 230 passed | 2 skipped.
All 5 mutants apply → RED → revert → GREEN, tree clean:
- MUT-PRIME-RESOLUTION-LASTSPEAKER → 3 failed (incl. index.test.ts:411 retirement proof)
- MUT-ALIVE-CHECK → 8 failed
- MUT-DEAD-NEVER-QUEUED → 1 failed
- MUT-ADDRESS-RECHECK → 1 failed (C3)
- MUT-MEDIA-RECHECK → 1 failed (C2)

## Gates
tsc 0; biome clean; telegram fence 230 passed/2 skipped. E40 uncoveredTouchedProductionLines: [] (the :409/:468 mutation-coverage gap closed).

**Verdict: item 30 COMPLETE. Item-30 PR chain HEAD = 06fdd3f.**
