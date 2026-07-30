# s075 brief — task-set open/close asymmetry fix · PM: pij-unwilling-butterfly
**Written**: 2026-07-30 · **By**: pij-wee-albatross (o-prime) · **Ruled**: Jordan (verbatim:
"yep, fix it in paralle, we can work on pa stuff in separte pm" · "have unwilling butterfly
work on that bug") — spine 25736 records the ruling cluster.

## The bug (you already know it — you named half of it)

`pij task set` is a cross-seat write that OPENS an assignment/obligation on another seat;
the resulting anomalies (`axis-disagreement` lost-dispatch rows, and the assignment itself)
can only be cleared by the assignee running first-person `pij report state ...`. There is no
closing verb for the opener. Measured blast radius, 2026-07-29/30 (mastodon, voxel): 9
stamps → 8 anomalies the stamping prime had no authority to quiet, while 6 assignee seats
were credit-blocked and could not clear their own until 5am. Your own formulation from the
PA interview: "a writer that can open obligations but not close them is an obligation
GENERATOR."

## Mission

Make the obligation lifecycle symmetric, safely. The DESIGN is yours to plan — candidate
shapes to evaluate (not a ruling): opener may close/withdraw its own open assignment; a
`task clear`/`task close` verb with ownership rules mirroring `close`'s E-OWN discipline;
anomaly rows carrying a clearable-by field. Whatever you choose must not let a third party
silently discharge a seat's genuine obligation — the asymmetry exists because first-person
truth matters; the fix is scoped authority, not a free-for-all.

## Evidence pointers (read before planning)

- `scratch/pa-study/pa-report-2026-07-30.md` §4.1 Q3 (mastodon's measured case) and §5.1
  rule 4 (the obligation rule, converged from two seats).
- Your own `scratch/pa-study/answers-unwilling-butterfly-2026-07-30.md` Q3.
- `/Users/jordanknight/games/voxel-flying-game/notes/pa-interview-2026-07-30.md` §3 — the
  primary source for the 9-stamps case.
- Store surfaces: task/assignment write path, anomaly derivation for lost-dispatch, and the
  enrollment registries — a new verb or field touches CLI dispatch/USAGE tables,
  `DESCRIPTOR_FIELD_OWNER` if any descriptor field is added, and the spine kind vocabulary
  if you append lifecycle events. The enrollment-checklist class is real; name every
  registry you touched in your gate report.

## Allocation (recorded before dispatch)

- **Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s075-task-asymmetry`
- **Branch**: `s075/task-asymmetry` · **Base**: main @ `fdf1687` (alloc-s075-task-asymmetry)
- **Store**: project `task-set-open-close-asymmetry-fix-cross-seat-tas` (primeId
  `pij-wee-albatross`).
- **Bootstrap**: node_modules already rsynced from canonical (same lockfile, zero registry
  interaction — the sanctioned npm-11.10.0 workaround; NEVER bypass min-release-age, #22).
  Typecheck ran clean post-rsync; re-run your own boot gate and name any pre-existing red.

## Constraints

- Work only in the s075 worktree; no daemon restarts from a worktree; no `npm link`;
  commits pathspec-mandatory; never write `government/` or any
  `.the-flow-state.json`/`the-flow.json`/`the-flow.md`.
- **Chainglass consumes list/node projections** (registered consumed-field subsets,
  JC-1/2/3). If your fix changes the shape or semantics of any projected field, that is a
  contract touch: tell me BEFORE you code it and I carry it to chainglass — do not ship a
  producer change against an unratified consumer expectation (the 089 lesson).
- Mutation proof is mandatory for any guard/anomaly-clearing path you add (dim-0): show
  the detector firing AND the old behaviour reproduced with the fix mutated out — your own
  s074 P6 learn-candidate is the exemplar.
- Merge permission is per-PR, from Jordan, asked by you directly. Never standing.
- PA work is EXPLICITLY out of scope — Jordan runs that under a separate PM. Do not build
  PA hooks into this fix; keep it a platform-invariant repair.

## Reporting

- Push now/next at start/stop (JC-1 dogfood continues).
- Plan artifacts in the worktree under `docs/plans/` per the builder process.
- Reports carry paths + SHAs + gates + observations — never summary-only.
