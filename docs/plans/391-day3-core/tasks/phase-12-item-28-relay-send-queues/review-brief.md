# Cold review brief — Phase 12 (item 28, dead relay sends queue) — dlg-0023
**Reviewer**: cold cross-model (claude-opus-5 via copilot) · **Repo**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core` (READ-ONLY except the verdict file; no commits; no `npm link`; never touch the live daemon or this machine's `~/.pij`) · **Target**: branch `s391/item28-relay-send-queues` @ `<SHA — filled at dispatch>`; base = `git merge-base origin/main HEAD`; freeze and name the SHA.
**Rubric**: `skills/flow-pair/references/review-rubrics.md`; Dim-0 mandatory (baseline every -t selector first). **Dossier**: `docs/plans/391-day3-core/tasks/phase-12-item-28-relay-send-queues/tasks.md` (contract).
## Aim — what the gates cannot prove
1. relay:true + dead pid → send ok, state queued, recipient-dead note/receipt, honest output. 2. Dissolved ordinary seat → E-DEAD unchanged (mutate the relay guard → RED). 3. Live relay → normal delivery. 4. The queued row drains when the relay is back (fake revive → delivered once).
## Dim-0: mutate the load-bearing guard of each RED-first test, confirm RED, restore byte-identical (cmp + git diff --exit-code); report survivors honestly.
## Gates: full vitest via `pij bg` (the dossier's command form) → 0 fail; tsc; biome on changed files. Scope: diff ⊆ the packet's allowed paths.
## Verdict → `docs/plans/391-day3-core/tasks/phase-12-item-28-relay-send-queues/review-01.md`; report `{"verdict","reviewId":"review-01","path","findings","highest"}` via `--body-file`; line 1 = verdict + SHA (C10).
