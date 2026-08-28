# Item 21: bind-guard advisory tail (ADV-A2 + ADV-B + ADV-C)

**Plan**: `../../day3-codex-doctrine-plan.md` (§ Item 21) · **Source**: `../../reviews/item-17-review.md` (ADV-B/ADV-C) + `../../reviews/item-17-adva-reconfirm.md` (ADV-A2) · **Order**: 21 → 22 → 23
**Base**: origin/main (fetch tip at dispatch — 488c758f+; BUILD THE PR AS A CHERRY-PICK ONTO FRESH MAIN per COORD-004, never a whole-file checkout). **CODE** → gate `npx vitest run .pi/extensions/pij/` + `just typecheck`.
**Fence**: `.pi/extensions/pij/core/daemon/loop.ts` (+`loop.test.ts`), `.pi/extensions/pij/core/daemon/index-state.test.ts`. No schema change.

### Anchors (on main 488c758f — re-verify with git grep; loop.ts shifts)
- ADV-A2: `drive.settled = true` at loop.ts:427 (copilot bind), :472 (claude bind), :589. `buildBoundNotice` at :428/:473 gated by `if (!drive.settled && descriptor.spawnedBy)`. `reportBindRefusal` at :528; refusalCause set at :396-408.
- ADV-B: the guard `if (identity?.cause !== "session-id-match") return {kind:"waiting"}` (:410) catches `no-harness-process` (state.ts:483-class), `harness-process-present` (:503), `probe-unavailable`, `identity-indeterminate` — only foreign/malformed reach `reportBindRefusal`. The planned path RETURNS waiting at every branch and never reaches `bind-timeout` fail (:521 is the claude/codex discovery path, not planned). `heldBoot` (:557) is the model for a bounded-timeout-then-fail-loud.
- ADV-C: the sweep `it` in index-state.test.ts (the `.paneId ===` grep); bypass shapes proven in the item-10b review §4.

### Tasks
| # | Task | Domain | Path(s) | Done When | Notes |
|---|------|--------|---------|-----------|-------|
| [ ] | T001 (ADV-A2 RED) | `loop.test.ts`: refuse(foreign)→bind→refuse(foreign)→re-bind; assert the spawner receives a fresh BOUND notice after the re-bind (not left on a stale refusal). RED on current code (settled stays true → re-bind silent). | pij-control-plane | `loop.test.ts` | RED | extend the ADV-A refuse→bind fixture |
| [ ] | T002 (ADV-A2 GREEN) | in `reportBindRefusal` (or where refusalCause fires), reset `drive.settled = false` so a subsequent successful bind re-emits `buildBoundNotice`. One line. | pij-control-plane | `loop.ts` | T001 GREEN; the existing bind-once tests still pass (a FIRST bind still announces once) | symmetric to ADV-A's clear-on-bind |
| [ ] | T003 (ADV-B) | close the silent-refusal gap for the OTHER permanently-non-binding causes. Preferred: extend `reportBindRefusal` to also fire once for `no-harness-process` and `harness-process-present` (they refuse forever). PLUS/OR add a bounded planned-bind timeout (anchor a clock like `heldBoot`; after N min of never-binding, fail loudly, don't wait forever). Pick the minimal correct fix; RED-first a test that a seat stuck in `harness-process-present` gets ONE notify (and/or a timeout fail). | pij-control-plane | `loop.ts` (+test) | RED→GREEN; a stuck non-binding seat is no longer silent-forever | state the choice (notify-only vs +timeout) in the report; don't over-build |
| [ ] | T004 (ADV-C) | tighten the sweep for the cheap wins: aliased destructure (`const {paneId: pid} = d`) and the reversed/2-operand shapes not yet caught; for genuinely-infeasible textual cases (multi-line arrows), DOCUMENT the residual in the test's comment (honest scope — a textual sweep is a heuristic, not a proof). RED-first each newly-caught shape. | pij-control-plane | `index-state.test.ts` | new shapes caught; residual documented; the real `discovery.ts` resolver still passes | do NOT claim "closed"; "narrowed + residual documented" |
| [ ] | T005 | gates + pathspec commit + `reports/item-21-report.md` with the mutation records + the ADV-B design choice | pij-control-plane | `reports/item-21-report.md` | recorded | one PR |

### Cold-review Dim-0 (mandatory)
- **MUT-A2**: revert the `settled = false` reset ⇒ T001 RED (the re-bind goes silent again).
- **MUT-B**: revert the ADV-B notify/timeout ⇒ T003 RED (the stuck seat is silent again).
- **MUT-C**: revert a newly-caught sweep shape ⇒ T004 RED for that shape.
- Verdict artifact records sha + RED line each.

### Open
- ADV-B design: notify-only is simpler and matches ADV-2's "never silent"; a timeout is more (it changes when a seat FAILS vs waits). Recommend notify-only unless the reviewer argues a wedged non-binding seat needs a terminal fail. Flag in the report.
- ADV-C: be honest that a textual sweep cannot catch every shape; the value is raising the bar + documenting the residual, not a proof of exhaustiveness (INFO from item-10b review: the sweep is a heuristic in the SAFE direction — drift → loud false positive).
