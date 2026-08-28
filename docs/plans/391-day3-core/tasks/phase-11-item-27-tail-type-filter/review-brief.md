# Cold review brief — Phase 11 (item 27, tail --type filter) — dlg-0022
**Reviewer**: cold cross-model (claude-opus-5 via copilot) · **Repo**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core` (READ-ONLY except the verdict file; no commits; no `npm link`; never touch the live daemon or this machine's `~/.pij`) · **Target**: branch `s391/item27-tail-type-filter` @ `<SHA — filled at dispatch>`; base = `git merge-base origin/main HEAD`; freeze and name the SHA.
**Rubric**: `skills/flow-pair/references/review-rubrics.md`; Dim-0 mandatory (baseline every -t selector first). **Dossier**: `docs/plans/391-day3-core/tasks/phase-11-item-27-tail-type-filter/tasks.md` (contract).
## Aim — what the gates cannot prove
1. --type receipt yields receipt lines only, identically for text and --json (mixed-kind fixture). 2. Unknown type → E-ARG naming the valid kinds, derived from the type (mutate the list source → RED). 3. Default (no --type) unchanged byte-for-byte.
## Dim-0: mutate the load-bearing guard of each RED-first test, confirm RED, restore byte-identical (cmp + git diff --exit-code); report survivors honestly.
## Gates: full vitest via `pij bg` (the dossier's command form) → 0 fail; tsc; biome on changed files. Scope: diff ⊆ the packet's allowed paths.
## Verdict → `docs/plans/391-day3-core/tasks/phase-11-item-27-tail-type-filter/review-01.md`; report `{"verdict","reviewId":"review-01","path","findings","highest"}` via `--body-file`; line 1 = verdict + SHA (C10).
