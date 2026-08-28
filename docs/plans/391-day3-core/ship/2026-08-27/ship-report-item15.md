# Ship report — item 15 (Phase 6): stale spine/platform write-locks — release on graceful stop + dead-pid reclaim; 1b acceptance follow-ups

**claim**: PR #27 open (`s391/item15-spine-lock-reclaim` @ `604242d`, base `45f3e89`); cold review round 1 → FX-01 → re-review APPROVE-WITH-FINDINGS (0 mutation survivors); full extension suite green after rebase. Ready for o-prime merge (rides daemon restart #6).

**artifacts**
- PR: https://github.com/vaughanknight/pij/pull/27 (body `docs/plans/391-day3-core/logs/pr-item15-body.md`)
- plan: `docs/plans/391-day3-core/391-day3-core-plan.md` Phase 6 (AC-20, AC-20b)
- tasks/fix/rebase packets: `docs/plans/391-day3-core/tasks/phase-6-item-15-spine-lock-reclaim/{tasks.md,fix-01.md,rebase-01.md,review-brief.md,execution.log.md}`
- verdicts: `…/phase-6-item-15-spine-lock-reclaim/review-01.md` (round 1 + `## Re-review FX-01`)
- rulings: `docs/plans/391-day3-core/rulings.md` (21:26Z–22:03Z rows)

**shas**: `f4dbf49` wip · `36a6403` reclaim + dispatch notes · `7572370` FX-01 sensors · `604242d` docs (pre-rebase: b9a9e43 / 38eb4ed / 49893fb reviewed)

**gates**
- `npx vitest run .pi/extensions/pij/` (rebased): 172 files / 4065 passed / 15 skipped / 0 failed — `docs/plans/391-day3-core/logs/vitest-item15-rebased.log`
- tsc: clean · biome: clean on 16 changed .ts
- Dim-0: 9 mutations RED→restore→GREEN, 0 survivors (reviewer, sha-pinned 49893fb); resolution-only delta 49893fb→604242d is daemon wiring + one positional test arg (coder range-diff)
- known-red unchanged: `harness/scripts/release-age-policy.test.ts` (pwsh absent), OSC lint baseline

**observations**
- INS-003: per-commit `merge-tree` dry-run reported 0 conflicts; the sequential rebase conflicted twice in `daemon.ts` vs item 29 (`f1d72f3`). Dry-run the stack in a throwaway worktree, not commit-by-main.
- DL-013: Telegram bridge routed the human's bare text to a dead seat (→ item 30, s392; Vaughan's ruling recorded).
- `harness observe` reports `unconfigured` in this worktree — frictions live in report files only.

**open** (o-prime to route; none blocking)
- G-3 (low): on the events.lock zero-budget bail the reclaim receipt is dropped (`spine-store.ts:277`) — contradicts AC-20 wording "reclaimed with a note naming layer + pid". Narrow, fails safe; suggest fold into a later item or accept as AC-20 amendment.
- G-1/G-2: `PIJ_TEST_HOLD_LOCKS_ON_START` / `interleaveReviveMarkerForTest` hooks are production-resident and don't guard that `PIJ_HOME` is scratch — one-line guard each.
- G-4/G-6/G-7: CLI requeue warning unsensored; 3 `FsRegistry` sites silent on reclaim; misleading "remove the file manually" line after reclaim.
- Item 31 (watchdog projection) queued after this PR; item 16 dispatching now.
