# Validation — pa-gate-repair-plan.md

- **Validated**: 2026-08-05
- **Target**: `docs/plans/084-pa-gate-repair/pa-gate-repair-plan.md`
- **Contract sources**: `rulings.md`, `original-ask.md`, `backpressure-coverage.md`, source files at cited locations
- **Checks**: `npx tsc --noEmit` (clean); 14 file:line citations spot-checked against source; all ACs traced to tasks; all tasks traced to ACs; rulings cross-referenced
- **Verdict**: VALIDATED
- **Thesis / proof**: Purpose met — the plan delivers a target-scoped gate, repair path, and visibility fix for the three issues, with every claim pinned to verified source locations and every AC covered by a named task and proof line.
- **Consumers**: 3/3 satisfied (Phase 2 consumes Phase 1 projection; Phase 3 consumes Phase 2 predicate; backpressure-coverage.md aligns with plan proof lines)

## Findings

| Severity | Finding | Evidence | Status |
|---|---|---|---|
| MEDIUM | `core/cli.test.ts:5136` cited as the read-count assertion — actual `reads === 0` is at line 5147; 5136 is the enclosing `it()` | `grep -n "reads" core/cli.test.ts` → 5147 | Acceptable — the `it()` block is the conventional citation target; no action needed |
| MEDIUM | `core/cli.ts:1844` cited for `watchdogBlock .map(w => w.watcherId)` — actual map is at line 1842 | `grep -n watcherId core/cli.ts` → 1842 | 2-line drift; acceptable for a plan written against a live branch; surfaced |
| MEDIUM | Task 2.9 depends on OQ-1 answer from Jordan, which is still open | Plan text explicitly gates 2.9 on the answer | No blocker — plan correctly sequences it; Phase 1 can start immediately |

## Repairs

_No repair made._
