# s043 cold review brief — dlg-0001

**Reviewer**: `pij-teenage-bee` · Copilot `gpt-5.6-sol` `xhigh`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s043-telegram-last-speaker-routing`
**Branch/base**: `s043/telegram-last-speaker-routing` @ `347b6dd732110bc76b3d421e61a401cc228149d6`
**Diff snapshot**: `.flow-pair/runs/2026-07-12T06-48-13Z-github.com-AI-Substr/diffs/diff-0001.patch`
**Output**: `docs/plans/043-telegram-last-speaker-routing/reviews/review.phase-1.md`

## Mission

Cold-review the complete uncommitted Phase 1 diff against:

- `telegram-last-speaker-routing-plan.md`
- `rulings.md` R1-R7
- `requested-fences.md` + `reports/smoke-fence-grant.md`
- `execution.log.md`
- `reports/coder-complete.md`
- `skills/flow-pair/references/review-rubrics.md`

Write exactly one durable verdict artifact at the output path, then send its path to `pij-rigid-minnow`. Do not edit product, tests, docs, plan, flow state, government, packages, or `.flow-pair`.

## Required proof

1. Review Dimensions 0-10; report only material findings.
2. **Dim-0 is mandatory**: empirically mutation-prove the successful-speech guard using:
   `just flow-pair-mutate .pi/extensions/pij/telegram/bridge.ts 's/if \(spoke\) return;/if (true) return;/' 'just test .pi/extensions/pij/telegram/bridge.test.ts .pi/extensions/pij/telegram/index.test.ts'`
   Record RED, byte-identical restore, and GREEN evidence.
3. Name the load-bearing negative/state assertion that proves R6: selected silent B does not replace prior speaker A.
4. Re-run the targeted Telegram suite yourself and verify `.pi/packages.yaml` is clean.
5. Inspect the pi-peacock addendum separately. The grant requires any authored subprocess to have an explicit bounded timeout and forbids weakening path/branch/content assertions.
6. Verify all changed files are within the original fence or the one-file smoke addendum.

## Verdict law

- Any critical/high finding, missing Dim-0 proof, or grant violation -> `FIX_REQUIRED`.
- Medium-only -> `APPROVE_WITH_NOTES`.
- Otherwise -> `APPROVE`.

The artifact must include: verdict, findings table, Dim-0 mutation evidence, gates rerun, scope check, deferred/noteworthy review, and exact reviewed diff id `diff-0001`.
