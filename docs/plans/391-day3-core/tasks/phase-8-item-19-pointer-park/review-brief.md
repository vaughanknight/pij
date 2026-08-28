# Cold review brief — Phase 8 (item 19, pointer rows park after N) — dlg-0015
**Reviewer**: cold cross-model (claude-opus-5 via copilot) · **Repo**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core` (READ-ONLY except the verdict file; no commits; no `npm link`; never touch the live daemon or this machine's `~/.pij` — tests use tmp homes) · **Target**: branch `<BRANCH>` @ `<SHA — filled at dispatch>`; base = `git merge-base origin/main HEAD`; freeze and name the SHA.
**Rubric**: `skills/flow-pair/references/review-rubrics.md`; Dim-0 mandatory (every -t selector baselined first). **Dossier**: `docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/tasks.md` (its Executive Briefing + tasks are the contract).

## Aim — what the gates cannot prove
1. A never-reads seat: attempt increments per announce; after N the row is `parked` with receipt `pointer-unread`; the next tick types NOTHING; `pij queue` shows the count. Base re-announces forever (T001 RED on base — check the log).
2. A seat that reads on the 2nd announce acks normally; body-path behaviour and `POINTER_LEASE_MS` unchanged; `SendOutcome` vocabulary frozen; composer-idle guard untouched.
3. N is named, documented (why N×lease ≫ a long turn), and parked rows remain open-but-stuck (retireable per item 1, restorable by revive under the R-5 guard).
## Dim-0: mutate the load-bearing guard of each RED-first test (named in the dossier), confirm RED, restore byte-identical (cmp + git diff --exit-code). Report survivors honestly.
## Gates: full vitest via `pij bg` → 0 fail; tsc; biome on changed files. Scope: diff ⊆ the packet's allowed paths.
## Verdict → `docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/review-01.md`; report `{"verdict","reviewId":"review-01","path","findings","highest"}` via `--body-file`; line 1 = verdict + SHA (C10).
