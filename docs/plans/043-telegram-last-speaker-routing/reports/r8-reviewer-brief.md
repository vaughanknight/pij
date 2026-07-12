# s043 R8 cold review brief

**Reviewer**: `pij-teenage-bee`
**Target**: bounded uncommitted R8 diff against `HEAD` (`5e3a8ae`)
**Spec**: `reports/change-001.md`, `rulings.md` R8, plan AC-13/C001-C003
**Output**: `docs/plans/043-telegram-last-speaker-routing/reviews/review.r8.md`

## Mission

Cold-review the repository-context prefix change. Do not edit source/tests/docs/plan/flow/ledger. Write the verdict artifact and send its path to `pij-rigid-minnow`.

## Required proof

1. `[pij-id]` remains first and `parseSenderTag`/reply routing behavior is unchanged.
2. Main renders `[pij-id] [repo]`; non-main renders `[pij-id] [repo/branch]`.
3. Empirically repeat the branch-condition mutation: include `/main` and omit the feature branch. It must go RED, restore `index.ts` byte-identical, then GREEN.
4. Git context derives from the sender descriptor folder's common repository, not daemon cwd/worktree basename.
5. Git subprocesses are injected, unit tests use fakes, and production calls have explicit bounded timeouts.
6. Sender context is computed once per delivered message and covers chunks, media captions, oversize/fallback text, and missing-context degradation.
7. Run targeted Telegram tests, `git diff --check`, package cleanliness, and scope check. Review docs additively.

## Scope

Only files listed in `reports/change-001.md`; orchestrator-owned flow/live-proof/report files are not part of the implementation review.

## Verdict

- Critical/high or missing Dim-0 -> `FIX_REQUIRED`.
- Medium-only -> `APPROVE_WITH_NOTES`.
- Otherwise -> `APPROVE`.
