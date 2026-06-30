# CROSS-REVIEW PACKET — plan 027, Phase 1 (CODE) — reviewer: Opus 4.8 / Copilot

You are the **cross-model reviewer** (different model from the coder, who is Sonnet 5).
Review the working-tree diff for plan 027 Phase 1. Produce a verdict — do NOT edit code.

## What was built
The Telegram `/list` command must show the **10 most recent ACTIVE** sessions
(was: 10 most-recently-created, including dead/stalled ghosts). The fix reuses the
EXISTING liveness rule, it must NOT invent a new one.

- Plan: `docs/plans/027-pij-list-active-sessions/027-pij-list-active-sessions-plan.md`
- Tasks: `docs/plans/027-pij-list-active-sessions/tasks/phase-1-active-filter/tasks.md`
- Diff: `git diff -- .pi/extensions/pij/telegram/` (+ confirm NOTHING outside allowed paths changed)

## Review dimensions (report file:line evidence for each finding)
1. **Correctness vs ACs.** `/list` excludes `dead` + `stale`; keeps only `liveness()==="active"`.
   Capped at 10, newest-first by `recencyKey` (`lastEventAt ?? startedAt`). Header counts the ACTIVE set (AC-4).
2. **Reuse, not reinvention (AC-3).** The verdict MUST come from `core/state.ts` `liveness()` + `STALE_AFTER_MS`
   — NOT a hand-rolled pid/age rule. The production pid probe MUST reuse the real `OsPort.isAlive`
   seam the CLI uses (`core/cli.ts` `liveOf`), not a reimplemented `process.kill`.
3. **Scope.** Only the 5 allowed files changed. FORBIDDEN: the-flow.json/.md/.the-flow-state.json,
   .flow-pair/**, core/state.ts, core/cli.ts, daemon, adapters/. Registry is READ-ONLY (no prune/remove).
4. **Edge cases.** `lastEventAt` absent → falls back to `startedAt`; unparseable date → treated as stale-age (null);
   `state:"working"` + silent>60s → `stale` (excluded); fewer than 10 active → no crash; 0 active → friendly note.

## Dimension 0 — TEST QUALITY (MANDATORY, the coder wrote its own tests)
Green ≠ good. PROVE the tests are non-vacuous before any APPROVE:
- The required mutation: **delete the `verdict === "active"` filter** (make the selector keep ALL sessions),
  run `just test .pi/extensions/pij/telegram` — a test MUST go **RED** (a dead/stale fixture leaks in).
  Use `just flow-pair-mutate <file> '<sed-expr>'` or reproduce by hand; name the assertion that flips.
- If no test flips on that mutation → **FIX_REQUIRED** (vacuous tests), regardless of green.
- The coder claims its own RED→GREEN evidence in its report — verify it, don't take it on faith.

## Verdict — report to pij-5lztp8
```
pij send pij-5lztp8 '{"delegationId":"027-p1-active-list","verdict":"APPROVE|APPROVE_WITH_NOTES|FIX_REQUIRED","dim0":"<mutation you ran + which assertion flipped, or why it is vacuous>","findings":[{"sev":"…","file":"…:line","note":"…"}],"summary":"…"}'
```
(If `pij send` can't resolve self: prefix `PIJ_SESSION_ID=<your-id> pij send …`.)
