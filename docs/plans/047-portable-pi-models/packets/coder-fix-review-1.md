# Fix packet — s047 review 1

**Coder**: `pij-pleased-cardinal`
**Review**: `docs/plans/047-portable-pi-models/reviews/review.phase-1.md`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s047-portable-pi-models`
**Branch / parent**: `s047/portable-pi-models` / `3b1a47beaed0455611e443ae8e2827cfb1aa460d`

## Mission

Resolve only the retained review findings F001–F003, run targeted/static proof, and report immediately. Do not revisit the shared smoke trust-prompt debt.

## Allowed paths

- `harness/scripts/sync-models.test.ts`
- `harness/scripts/sync-models.ts` only if the test cannot be made load-bearing without a seam; prefer no production change
- `docs/how/build.md`
- `docs/plans/047-portable-pi-models/tasks/phase-1-portable-model-catalog-sync/execution.log.md`

## Required fixes

1. **F001 — execution log**: create the packet-authorized nested execution log path above (not the reviewer’s suggested plan-root path). Record T001–T006 outcomes, all eight owned files, managed-provider/whole-object replacement, same-directory temp+rename, source boundary, exact gates/counts, known external smoke blocker, held doc untouched, and no real-home/npm-link/auth/skills/pi-doctor action.
2. **F002 — mutation-resistant atomicity proof**: add a deterministic assertion that fails if `renameSync(tempPath, targetPath)` is replaced with direct target writing. Preserve the human’s fixtures/no-broad-mocks choice. Recommended smallest equivalent probe: read `sync-models.ts` as source and assert the exact same-directory temp→target rename guard is present and direct `writeFileSync(targetPath, ...)` is absent. Ensure the reviewer’s direct-overwrite mutation goes RED. Change production only if this cannot be made honest.
3. **F003 — source pointer**: correct `docs/how/build.md`’s `sync-models` justfile citation to the actual complete recipe range (or remove the fragile line range).

## Proof

- `npx vitest run harness/scripts/sync-models.test.ts`
- `just typecheck`
- `just lint`
- `git diff --check`
- Mutation: direct-overwrite substitution must make targeted tests RED; restore byte-identical; targeted tests GREEN.
- Do not run full smoke or `harness checks`; no audit timestamp churn.

## Forbidden

No other product/config/docs path; no `.flow-pair/**`, flow files, review artifact, held `docs/how/pij-models-discovery.md`, auth/general skills, real-home writes, `npm link`, daemon restart, push, or main checkout.

## Report

Send:

```json
{
  "delegationId":"dlg-0001-fix-1",
  "outcome":"COMPLETE | BLOCKED",
  "summary":"one sentence",
  "filesChanged":["..."],
  "testsRun":0,
  "testsPassed":0,
  "mutation":"RED→restore→GREEN",
  "gatesClean":true,
  "notes":"exact external blocker, if any"
}
```
