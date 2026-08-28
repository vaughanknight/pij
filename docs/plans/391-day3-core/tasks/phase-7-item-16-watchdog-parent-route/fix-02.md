# FX-02 — item 16 (dlg-0016) re-review follow-ups — base 4a70a26

Verdict `review-01.md § Re-review FX-01`: APPROVE-WITH-FINDINGS; F-1/F-2/F-6 closed. New: G-1 (medium), G-2 (medium), G-3/G-4 (low). Orchestrator ruling: G-2 is a hot-loop cost regression on the shared daemon and G-1 reverses an existing operator rule (task #34) — both fixed before PR. Same fence.

## G-2 (medium) — no archive scan on the tick
`noticeRegistryView` (daemon.ts:~822) adds `listTerminal()` (archive tier, unthrottled) to the 600 ms tick for zero routing effect — terminal seats are never live. **Rule**: the view is the live `list()` plus the caller's dead set; a candidate absent from `list()` is `absent` (the log line may say `absent-or-archived`). Remove the archive read from the tick path entirely (no throttle — it is not needed). RED: a test that counts archive reads per tick (or asserts `listTerminal` is not invoked from the tick) — RED on base, GREEN after; the reviewer's M14/M15 (drop listTerminal) must now be RED-detected, i.e. the sensor asserts the read does NOT happen.

## G-1 (medium) — withheld lines aggregate (task #34 stays true)
My FX-01 rule ("one operator line per withheld notice") collides with task #34's "one line with the COUNT, not N" at `daemon.ts:828-831`. **Rule**: per death sweep, withheld notices are COUNTED into the existing task-#34 summary (`… N notice(s) withheld: no live recipient`) with at most the first 3 subjects named inline; never one line per notice. The single-notice paths (stalled, provider-failure, bind/fail) keep their one line (they are one-shot per seat). RED: N=1000 dead seats → exactly one withheld summary line (the reviewer's executed probe); the DOUBLE-log mutant stays RED. Fix the stale comment at :828-831 only if its wording no longer matches.

## G-3 (low) — comments at watchdog-manager.ts:219-220 / :635-636
State exactly what the code does: `pushWholeLifeTransition` returns early on the PURE candidate check (no parentId and no spawnedBy); with candidates present but none live it continues, withholds, and logs (proven by daemon.test.ts:1804). One sentence each; comment-only.

## G-4 (low) — one view helper
`loop.ts:184` and `daemon.ts:1136` duplicate the registry-view rule. Export one helper from `core/binding.ts` (beside `resolveNoticeRecipient`) and call it from both. Behaviour identical; existing tests stay green.

## Info, optional if trivial: G-5 deadIds sensor; G-6 the auto-registering fixture helper — add a one-line comment naming the trap.

Gates: full vitest via `pij bg` → `docs/plans/391-day3-core/logs/vitest-phase7-fx02.log`; tsc; biome on changed files. Commit (pathspec) on the branch; report per schema by `--body-file`: new SHA, per-finding RED evidence, the archive-read sensor, and the N=1000 single-line proof.
