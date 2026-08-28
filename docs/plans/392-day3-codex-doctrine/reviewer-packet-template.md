# Reviewer / coder packet — STANDING requirements (apply to every dispatch)

Every cold-review packet AND coder dispatch that runs a gating full suite MUST include:

1. **PERSIST GATING LOGS BEFORE TEARDOWN (E22, o-prime 2026-08-28).** Every full run that gates a verdict (or a two-green-runs PR gate) keeps its raw log on disk UNDER THIS PLAN FOLDER before the worktree is removed: `docs/plans/392-day3-codex-doctrine/reviews/logs/<item>-<sha>-run<N>.log` (or `reports/logs/...` for coder runs). **A red with no log is a CLAIM, not evidence.** State the log path in the report.
2. **E17 no-collateral**: `npx vitest list` (never a regex) on both trees + a LINE diff of the changed test files (the list is blind to weakened assertions).
3. **E37/E40 mechanical oracle** (for wiring/behaviour): the MUT-<X>.patch hunk must lie in code NO existing test drives — STATE which test covers each patched line; "none" must be true for ≥1. A patch on already-tested code proves nothing.
4. **E35 full-suite gate**: green counts ONLY on a fresh-from-main PR worktree (cherry-pick); the stream worktree's full run is diagnostic, never a gate.
5. **Claimed mutation line numbers are UNVERIFIED** — verify against the file (DL-011 family).
6. **RUN the oracle/differential, don't read it** — sha-verify RED→restore→GREEN on disk; state the mutated sha + actual RED line.
