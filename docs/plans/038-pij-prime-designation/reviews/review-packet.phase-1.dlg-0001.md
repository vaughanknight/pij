# Review packet — Plan 038 Phase 1 / dlg-0001

**Reviewer role**: cold cross-model reviewer  
**Coder**: pij-1ys6f6h (`claude-opus-4.7-1m-internal`, xhigh)  
**Reviewer**: pij-1krhjki (`gpt-5.6-sol`, xhigh)  
**Run**: `2026-07-11T11-40-21Z-github.com-AI-Substr`  
**Delegation**: `dlg-0001`

## Mission

Review the complete Phase 1 change against:

- `docs/plans/038-pij-prime-designation/pij-prime-designation-plan.md` — Phase 1, AC-10.
- `docs/plans/038-pij-prime-designation/tasks/phase-1-repair-orchestration-cli-coverage-sensor/tasks.md`.
- `docs/plans/038-pij-prime-designation/tasks/phase-1-repair-orchestration-cli-coverage-sensor/execution.log.md`.
- `skills/flow-pair/references/review-rubrics.md` — all dimensions, with Dimension 0 mandatory.

Review only this pathscoped diff:

```bash
git --no-pager diff -- \
  harness/scripts/pij-skill-check.sh \
  skills/pij/SKILL.md
```

The shared tree contains unrelated work. Do not review, edit, stage, restore, or comment on files outside those two implementation paths and the execution log.

## Required checks

1. **Scope**: implementation diff is exactly the two granted files; execution log is the only phase artifact created by the coder.
2. **Contract**:
   - CLI coverage is extracted only from data rows under `## CLI-verb coverage`.
   - Required tokens include `orchestration`, `baton`, and `prime`.
   - The public row maps `orchestration (baton/prime)`.
   - `/pij prime` (skill route) is distinguished from `pij orchestration prime` (CLI primitive).
3. **Plan alignment**: fix-the-check-first RED evidence precedes SKILL.md repair.
4. **Regression**: all prior skill gates remain present and green.
5. **Progress log**: exact RED/GREEN evidence, changed paths, and gates are recorded.

## Dimension 0 — mandatory mutation proof

Empirically prove the restored gate rejects a missing orchestration row and restores byte-identical:

```bash
just flow-pair-mutate skills/pij/SKILL.md \
  's/^\| `orchestration` .*$/| `missing-orchestration-row` | intentionally mutated |/' \
  'just pij-skill-check'
```

Required outcome:

- mutation matches;
- `just pij-skill-check` goes RED because `orchestration`, `baton`, and `prime` are absent from the scoped coverage rows;
- the helper restores the file byte-identical;
- restored gate goes GREEN.

Also inspect the execution log's pre-row RED evidence to verify that unrelated `prime` prose did not satisfy the scoped check.

## Reviewer output

Write:

`docs/plans/038-pij-prime-designation/reviews/review.phase-1.dlg-0001.md`

Required fields:

- reviewer model/effort and reviewed paths;
- verdict: `APPROVE`, `APPROVE_WITH_NOTES`, or `FIX_REQUIRED`;
- findings by severity with exact file/line evidence;
- Dimension 0 command and RED -> restore -> GREEN output;
- gate commands/results;
- explicit scope verdict;
- one concise summary.

Do not fix findings. Send the verdict path to `pij-118mbuv` when complete.

## Forbidden

- `.the-flow-state.json`, any `the-flow.json`, any `the-flow.md`
- `.flow-pair/**`
- all implementation and plan files outside the two reviewed files and the verdict output path
- staging, committing, daemon restart, or peer lifecycle actions
