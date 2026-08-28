# Cold review brief — Phase 1a (item 1a, stdout flush class fix) — dlg-0004
**Reviewer**: cold cross-model (claude-opus-5 via copilot) · **Repo**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core` (READ-ONLY except the verdict file; no commits; no `npm link`; no daemon touch) · **Target**: branch `s391/item1a-stdout-flush` @ `6cfc12cd94104ee8e1cd4fe35aae4ff7213bc970` on base `main@5445c85`; freeze = `git rev-parse HEAD` must match, name it.
**Rubric**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/skills/flow-pair/references/review-rubrics.md`; Dim-0 mandatory. **Plan**: § Phase 1a / AC-16.

## Aim
1. The fix is ONE guarded statement at `main()` entry making stdout+stderr blocking when they are pipes — no `process.exit(` call site touched (`git diff --stat main...HEAD` must show only `cli.ts` (tiny) + the test + the two dossier files).
2. The test actually crosses the bin through a PIPE (spawnSync harness), produces >65536 bytes, and asserts the LAST line/row is present. On base the same test must FAIL (Dim-0: revert the `main()` hunk → RED → restore).
3. No behaviour change on TTYs/files (guard on `_handle?.setBlocking`), no exit-code change.
## Dim-0
- Revert the `setBlocking` hunk (keep the test) → run the pipe test → RED → restore byte-identical (`git status --porcelain` shows only the 7+ untracked orchestration docs baseline).
## Gates to re-run
- `npx vitest run .pi/extensions/pij/` → 0 fail (use `pij bg`).
## Verdict → `docs/plans/391-day3-core/tasks/phase-1a-stdout-flush/review-01.md`; report `{"verdict","reviewId":"review-01","path","findings","highest"}` via `--body-file`, line 1 = verdict + SHA (C10).
