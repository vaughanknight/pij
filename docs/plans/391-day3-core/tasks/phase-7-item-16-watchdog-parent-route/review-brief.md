# Cold review brief — Phase 7 (item 16, notices route to parent) — dlg-0016
**Frozen SHA**: `cc96eca2bc6aa038b29a5fc5c94561167449d143` · **Base**: `9b5e42d`
**Reviewer**: cold cross-model (claude-opus-5 via copilot) · **Repo**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core` (READ-ONLY except the verdict file; no commits; no `npm link`; never touch the live daemon or this machine's `~/.pij` — tests use tmp homes) · **Target**: branch `<BRANCH>` @ `<SHA — filled at dispatch>`; base = `git merge-base origin/main HEAD`; freeze and name the SHA.
**Rubric**: `skills/flow-pair/references/review-rubrics.md`; Dim-0 mandatory (every -t selector baselined first). **Dossier**: `docs/plans/391-day3-core/tasks/phase-7-item-16-watchdog-parent-route/tasks.md` (its Executive Briefing + tasks are the contract).

## Aim — what the gates cannot prove
1. ONE `noticeRecipient(d) = parentId ?? spawnedBy` helper used by all four `build*Notice` builders AND the daemon's gates (`pushWholeLifeTransition`, provider-failure push) — grep for any remaining `spawnedBy` gate on a notice path.
2. Adopted seat (parent ≠ spawnedBy): stalled + dead notices go to the parent ONLY (channel `to`), spawner receives nothing; a seat with a parent but no spawner now gets its notice (base drops it).
3. Watcher-list semantics (`notifyWatchers`) untouched; no schema change.
## Dim-0: mutate the load-bearing guard of each RED-first test (named in the dossier), confirm RED, restore byte-identical (cmp + git diff --exit-code). Report survivors honestly.
## Gates: full vitest via `pij bg` → 0 fail; tsc; biome on changed files. Scope: diff ⊆ the packet's allowed paths.
## Verdict → `docs/plans/391-day3-core/tasks/phase-7-item-16-watchdog-parent-route/review-01.md`; report `{"verdict","reviewId":"review-01","path","findings","highest"}` via `--body-file`; line 1 = verdict + SHA (C10).
