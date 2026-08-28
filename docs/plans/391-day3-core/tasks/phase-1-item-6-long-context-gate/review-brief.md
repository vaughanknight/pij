# Cold review brief — Phase 1 (item 6, long_context gate) — dlg-0001

**Reviewer**: cold, cross-model to the coder (coder = copilot gpt-5.6-sol). **Repo**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core` (cd first; READ-ONLY except the verdict file; never commit; never `npm link`; never touch the daemon or `~/GitHub/pij`).
**Target**: branch `s391/item6-long-context`, commit(s) `7ba1831da222eb7461ec58a041a5d848e66bac20`; base `main@d2dbab0`. Freeze: `git rev-parse HEAD` must equal the SHA above — name it in the verdict.
**Rubric**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/skills/flow-pair/references/review-rubrics.md` (all 10 dimensions; Dim-0 mutation gate MANDATORY).
**Plan / ACs**: `docs/plans/391-day3-core/391-day3-core-plan.md` § AC-01, AC-02, AC-10; Phase 1 tasks `tasks/phase-1-item-6-long-context-gate/tasks.md`; execution log beside it.

## What the deterministic gates cannot prove — aim here
1. **Tri-state default** — `buildControlSpawnCommand` with `longContext` UNDEFINED still emits `--context long_context` for copilot+model (`core/spawn.test.ts:453-469` must be byte-identical); only `false` suppresses. Read the hunk at `core/spawn.ts:463`.
2. **Resolver authority** — `resolveLongContext` returns `false` for `gemini-3.6-flash` when the registry has (i) the raw `github-copilot` entry FIRST and a remapped `copilot` duplicate, (ii) snapshot-only (no models.json), (iii) empty. Confirm the deny-set lookup lives in the resolver, not only in an annotation the `find` can miss (`core/models/validate.ts`).
3. **Production composition** — BOTH `cli.ts` spawn sites pass `longContext:false`: `runSpawn` (~`:2606`) and `runAgentSpawn` → `spawnAgentPane` plan param → builder (~`:3939-3946`, `:4162`, `:3995`). The `cli.integration.test.ts` fake-tmux test must assert the FINAL `split-window`/`new-window` argv for both paths, gemini omits / gpt-5.6-sol retains.
4. **Scope** — no edits outside the packet's allowed paths (`git diff --name-only main...HEAD`); `core/focus.ts`, `core/revive.ts`, `core/types.ts`, `skills/**` untouched; no `SessionDescriptor` field added.
5. **Docs** — `docs/how/pij-models-discovery.md:99` law amended; `docs/domains/pij-control-plane/domain.md:110` shape row gains `contextWindow?`, `longContext?`.

## Dim-0 mutation gate (do it, record the evidence)
For each of the three load-bearing tests, break the guard, run the targeted test, confirm RED, restore byte-identical (`git checkout -- <file>` or `git diff --exit-code` after):
- `core/spawn.ts:463` — change `input.longContext !== false` to `true` (or drop the clause) → `npx vitest run .pi/extensions/pij/core/spawn.test.ts` must FAIL on the `longContext:false` case.
- `core/models/validate.ts` resolver — make the deny-set lookup return `undefined` → `npx vitest run .pi/extensions/pij/core/models/validate.test.ts` must FAIL on cases (ii)/(iii).
- `cli.ts` agent-spawn plumbing — drop the `longContext` forward at the builder call → `npx vitest run .pi/extensions/pij/cli.integration.test.ts -t "long_context"` must FAIL on the agent-spawn case.
Then `git status --porcelain` must be empty (restored).

## Gates to re-run yourself (claims are not proof)
- `npx vitest run .pi/extensions/pij/` (full; ~2.5 min — use `pij bg`) → 0 failures.
- `git diff --stat main...HEAD` matches the coder's `filesChanged`.

## Verdict (write to `docs/plans/391-day3-core/tasks/phase-1-item-6-long-context-gate/review-01.md`)
Frozen SHA · per-dimension findings with file:line and severity (critical/high/medium/low) · Dim-0 evidence (the three RED runs, the restore proof) · gate outputs (paths) · verdict `APPROVE | APPROVE_WITH_NOTES | FIX_REQUIRED`. Report to the orchestrator (`pij send pij-associated-louse --body-file <json>`): `{"verdict":"…","reviewId":"review-01","path":"<abs path>","findings":N,"highest":"<severity>"}` — line 1 = verdict + SHA (C10).
