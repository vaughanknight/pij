# Post-flight — 131-baseline-red-tests

**Closed out**: 2026-09-02T04:07:04Z
**Archived to**: `docs/plans/archive/131-baseline-red-tests/`
**Shipped**: not yet — ship follows from the archive path

## Completion

| Check | Result |
|---|---|
| Phases / tasks | All complete |
| Acceptance criteria | AC1–AC3 checked; complete-plan validation has zero errors and zero warnings |
| Latest review | Claude Opus 5 round 2: APPROVE; 4 files / 21 tests passed independently |
| Deterministic gate | `harness checks`: all eight sensors passed, zero skipped |
| Live proof | Fresh linked-worktree `just test`: 231 files and 4,645 tests passed; exit 0 |

## Open / deferred items

| Kind | Item | Where | Note |
|---|---|---|---|
| Proof improvement | Exercise the npm ≥11.10.0 quarantine-enforcement arm in a deterministic version-matrix job | `.harness/records/retro/2026-09-02/001-131-baseline-red-tests.md#SUGG-001` | Local npm 11.5.1 proves refusal, not supported-path enforcement; non-blocking follow-up |
| Ship bookkeeping | Open the PR and clear review g4's checked-phase-without-PR residual | `assets/reviews/round-2.dd.md#g4` | Expected to clear during ship |

Eight harness observations were saved and harvested. Highest-leverage follow-up: encode the supported-npm enforcement matrix so future greens prove both refusal and enforcement paths.
