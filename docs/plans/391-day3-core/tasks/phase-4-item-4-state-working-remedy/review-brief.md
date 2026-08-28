# Cold review brief — Phase 4 (item 4, `--state working` remedy + carried T004b) — dlg-0011
**Reviewer**: cold cross-model (claude-opus-5 via copilot) · **Repo**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core` (READ-ONLY except the verdict file) · **Target**: branch `s391/item4-card-working` @ `91ded2aab1728ba763706927992b53518a588e13`; base = `git merge-base origin/main HEAD`; freeze and name the SHA.
**Rubric**: `skills/flow-pair/references/review-rubrics.md`; Dim-0 mandatory. **Ruling R-4 (c-remedy)**: predicates untouched; NOT an alias; the rejection and the anomaly detail carry the remedy.

## Aim
1. `SEMANTIC_STATES` (`core/types.ts:110`), `cardCanMislead` (`role.ts`), and the status-stale predicate (`anomalies.ts:630-650`) are byte-identical to base — `git diff` must not touch `core/types.ts` or `role.ts`; only the detail TEXT in `anomalies.ts` changes.
2. `report now … --state working` still exits `E-ARG`; the message names the mechanical axis, the literal `pij report now "<did>" "<next>"`, and `waiting|hold|blocked|question`; the same remedy string is a single exported constant used by both sites.
3. Detector-non-deletion fixture: `systemState:"working"` + fresh `lastEventAt` + old `statusAt` (pm) STILL raises `status-stale` — mutate the freshness predicate (`:640`) and confirm this fixture is what goes RED.
4. T004b (carried): the pointer info line's `ℹ️` glyph and honest attempt count are positively asserted; drop the increment → RED; drop the glyph → RED.
## Dim-0: the three mutations above + restore byte-identical. ## Gates: full vitest via `pij bg`; tsc; biome.
## Verdict → `docs/plans/391-day3-core/tasks/phase-4-item-4-state-working-remedy/review-01.md`; report `{"verdict","reviewId":"review-01","path","findings","highest"}` via `--body-file`; line 1 = verdict + SHA (C10).
