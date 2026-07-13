# Cold Review Packet — s044 Phase 1 / dlg-0002

**Role**: independent cold reviewer
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s044-compact-before-redispatch`
**Branch/base**: `s044/compact-before-redispatch` / `1336291a5a2285d37487cf83bda86b7438ba93c4`
**Plan**: `docs/plans/044-compact-before-redispatch/compact-before-redispatch-plan.md` v1.8 · sha `a422da9f735a2be20fd00c9ed9fb8a147d876791cf2bf9164760b83c9c277018`
**Tasks**: `docs/plans/044-compact-before-redispatch/tasks/phase-1-completion-first-peer-compaction/tasks.md`
**Coder claim**: `docs/plans/044-compact-before-redispatch/reports/coder-completion-dlg-0002.md`
**Cold canary**: `docs/plans/044-compact-before-redispatch/validation/cold-completion-canary.md`
**Rubric**: `skills/flow-pair/references/review-rubrics.md`

## Review Scope

Review the complete current diff independently:

1. `skills/pij/SKILL.md`
2. `skills/pij/references/00-routing.md`
3. `skills/pij/references/routes/pair.md`
4. `harness/scripts/pij-skill-check.sh`
5. `docs/domains/pij-skill/domain.md`

Plan evidence may be read under `docs/plans/044-compact-before-redispatch/**`.

## Required Questions

- Does completion compact remain the first action for coder completion and reviewer verdict?
- Is compact explicitly fire-and-forget with no compact `--wait`, receipt gate, polling, or latency blocking?
- Are one-shot auto-dissolve / expected `E-DEAD` semantics accurate?
- Are root invariant 5, C1/C7 external-pull behavior, and `pij inbox --wait` preserved?
- Does the pair route retain reload-first safety and correct coder/reviewer ordering?
- Do structural checks prove ownership/order without false-positiveing legitimate inbox waiting?
- Is the 23-mutation matrix meaningful and byte-restoring?
- Does the domain update preserve PR #9 concepts/invariants/history?
- Are all changes confined to the exact five-file grant, with no hidden product behavior change?
- Is the cold canary bounded honestly and supported by the evidence it cites?

## Mandatory Dimension 0

Mutation-test the changed structural gate independently:

- use `just flow-pair-mutate` on `harness/scripts/pij-skill-check.sh`, or an equally explicit named mutation;
- remove/invert one load-bearing completion assertion so the suite goes RED;
- prove byte-identical restoration and GREEN afterward;
- record the mutation expression, RED evidence, restored hash, and GREEN evidence.

Do not accept the coder's mutation claims without this independent proof.

## Gates

Run at minimum:

- `just pij-skill-check`
- the independent Dimension-0 mutation
- `just typecheck`
- `just lint`

Treat D-032 fresh-worktree Pi trust-prompt smoke as the already ruled external/non-blocking debt; do not broaden this review into smoke-harness work.

## Output

Write:

`docs/plans/044-compact-before-redispatch/reviews/review.phase-1.md`

Include:

- reviewed sha/diff paths;
- findings table with severity and exact evidence;
- Dimension-0 evidence;
- acceptance coverage;
- verdict: `APPROVE`, `APPROVE_WITH_NOTES`, or `FIX_REQUIRED`;
- any deferred/non-blocking observations.

Then send `pij-eventual-scorpion` a pointer plus verdict. Do not edit implementation files except the temporary mutation with verified restoration.
