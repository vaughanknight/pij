# Cold review brief — Phase 5 (item 13, descriptor lost-update race) — dlg-0013
**Reviewer**: cold cross-model (claude-opus-5 via copilot) · **Repo**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core` (READ-ONLY except the verdict file; no commits; no `npm link`; never touch the live daemon or this machine's `~/.pij` — tests use tmp homes) · **Target**: branch `s391/item13-status-lost-update` @ `553b57513f219be9c148de87cea55d588f8b5c18`; base = `git merge-base origin/main HEAD`; freeze and name the SHA.
**Rubric**: `skills/flow-pair/references/review-rubrics.md`; Dim-0 mandatory (every -t selector baselined first). **Dossier**: `docs/plans/391-day3-core/tasks/phase-5-item-13-status-lost-update/tasks.md` (its Executive Briefing + tasks are the contract).

## Aim — what the gates cannot prove
1. T001 REPRODUCES the incident on base in BOTH directions (card lost; daemon systemState lost) through an interleaving seam — not by reasoning; the RED lines are in the execution log.
2. The fix lives in the registry write seam (`FsRegistry.publish` atomic read-merge-write), NOT in callers; `DESCRIPTOR_FIELD_OWNER` unchanged; no `SessionDescriptor` schema change; the write law tests still green.
3. `writeExact` callers keep their CLEAR semantics for owned fields (the card path can still clear `semanticState`/`stateNote`), while non-owned fields come from the fresh disk read.
4. Carried T004 (pi/omp revive branches now tested — mutate them → RED) and T005 (`RegistryPort.listTerminal()` used by the sweep; fake-registry test).
## Dim-0: mutate the load-bearing guard of each RED-first test (named in the dossier), confirm RED, restore byte-identical (cmp + git diff --exit-code). Report survivors honestly.
## Gates: full vitest via `pij bg` → 0 fail; tsc; biome on changed files. Scope: diff ⊆ the packet's allowed paths.
## Verdict → `docs/plans/391-day3-core/tasks/phase-5-item-13-status-lost-update/review-01.md`; report `{"verdict","reviewId":"review-01","path","findings","highest"}` via `--body-file`; line 1 = verdict + SHA (C10).
