# Cold review brief — Phase 6 (item 15, stale lock reclaim + dispatch spine notes) — dlg-0014
**Reviewer**: cold cross-model (claude-opus-5 via copilot) · **Repo**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core` (READ-ONLY except the verdict file; no commits; no `npm link`; never touch the live daemon or this machine's `~/.pij` — tests use tmp homes) · **Target**: branch `<BRANCH>` @ `<SHA — filled at dispatch>`; base = `git merge-base origin/main HEAD`; freeze and name the SHA.
**Rubric**: `skills/flow-pair/references/review-rubrics.md`; Dim-0 mandatory (every -t selector baselined first). **Dossier**: `docs/plans/391-day3-core/tasks/phase-6-item-15-spine-lock-reclaim/tasks.md` (its Executive Briefing + tasks are the contract).

## Aim — what the gates cannot prove
1. BOTH layers (`write.lock`, `events.lock`) reclaim a lock whose pid is dead (and a live pid whose process started after the lock's mtime) and emit a note; a lock held by the TEST'S OWN pid is still refused with the existing text after the budget — never stolen.
2. One shared reclaim helper (no two copies of the rule); daemon SIGTERM/SIGINT releases held locks before exit.
3. AC-20b: dispatch retire/un-retire append a spine note (id, reason, actor, priorState) at ALL call sites (sweep, verb, revive); `dispatch-retire` prints `0 open (N already retired)`.
4. Tests never touch this machine's real `~/.pij/spine`.
## Dim-0: mutate the load-bearing guard of each RED-first test (named in the dossier), confirm RED, restore byte-identical (cmp + git diff --exit-code). Report survivors honestly.
## Gates: full vitest via `pij bg` → 0 fail; tsc; biome on changed files. Scope: diff ⊆ the packet's allowed paths.
## Verdict → `docs/plans/391-day3-core/tasks/phase-6-item-15-spine-lock-reclaim/review-01.md`; report `{"verdict","reviewId":"review-01","path","findings","highest"}` via `--body-file`; line 1 = verdict + SHA (C10).
