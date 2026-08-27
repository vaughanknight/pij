# Cold review packet — item 10a (index-state pane guard) · terminal-once
**Reviewer**: fresh cold (claude-opus-5 xhigh) — report ONCE after your last mutation. · **Orchestrator**: pij-falling-outside
**Worktree**: `/Users/vaughanknight/GitHub/pij-worktrees/s392-day3-codex-doctrine` · **Branch**: `s392/day3-codex-doctrine` · **Base**: `fa6378a` · **Commits**: `6948e14` (impl) + `2a9a3ec` (report) · **Diff**: `git show 6948e14`
**Item**: `tasks/item-10a-index-state-guard/tasks.md` · **Incident**: `government/incidents/2026-08-27-cross-government-pane-misbind.md` · **Coder report**: `reports/item-10a-coder-report.json` · **Rubric**: `/Users/vaughanknight/GitHub/pij/skills/flow-pair/references/review-rubrics.md` (Dim-0 MANDATORY) · **C10**
**Allowed**: READ anything; WRITE only `reviews/item-10a-review.md`. Tree is quiet (coder idle). Your mutations target `core/daemon/index-state.ts`.

## Contract (constraints, not conclusions)
`IndexState.rebuild` must not populate `byPane` for a `dissolved`/`failed` descriptor → `resolvePane` returns undefined for a dead seat's (reused) pane; `bound`/`pending` seats resolve their own pane; `byId`/`byHarnessIdentity` UNCHANGED (audit/`pij state` need dead seats). The single-line change is `if (d.paneId && d.lifecycle !== "dissolved" && d.lifecycle !== "failed")`.

## Dim-0 (required RED evidence, restore byte-identical)
1. `just flow-pair-mutate .pi/extensions/pij/core/daemon/index-state.ts 's/if \(d.paneId && [^)]*\)/if (d.paneId)/' 'npx vitest run .pi/extensions/pij/core/daemon/index-state.test.ts'` → RED (orchestrator got 2 RED). Confirm the failing tests assert `resolvePane('%dissolved') === undefined` and reused-pane-resolves-to-fresh — negative/state, not truthiness.
2. Consider: is `failed` correct to exclude? A `failed` PRE-BIND seat has no live pane; but confirm no `failed` seat that legitimately owns a live pane is wrongly excluded (check the lifecycle semantics). If you find a case, that's a finding.
3. Confirm `byId`/`byHarnessIdentity` still index dead seats (a mutation removing a dead seat from `byId` should NOT be needed — those are unchanged; verify the diff touches only the `byPane` line).

## Verdict → `reviews/item-10a-review.md`; report {summary,verdict,path} to pij-falling-outside.
