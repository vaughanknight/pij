# Review packet — S045 Phase 1 / dlg-0002

**To**: `pij-literary-peafowl` (cold separate-session reviewer)
**From**: `pij-evolutionary-jellyfish`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s045-copilot-5-6-effort-levels`
**Branch/base**: `s045/copilot-5-6-effort-levels` / `347b6dd732110bc76b3d421e61a401cc228149d6`
**Coder**: `pij-dizzy-yak` · Copilot `gpt-5.6-sol` xhigh · compacted before review

## Mission

Cold-review the uncommitted S045 implementation against the validated plan, current rulings, and the actual diff. The coder wrote both code and tests; green output is a claim, not proof.

## Read first

- `docs/plans/045-copilot-5-6-effort-levels/copilot-5-6-effort-levels-plan.md`
- `docs/plans/045-copilot-5-6-effort-levels/rulings.md`
- `docs/plans/045-copilot-5-6-effort-levels/tasks/phase-1/tasks.md`
- `docs/plans/045-copilot-5-6-effort-levels/tasks/phase-1/execution.log.md`
- `.flow-pair/runs/2026-07-12T21-28-52Z-github.com-AI-Substr/diffs/diff-0001.patch`
- `skills/flow-pair/references/review-rubrics.md`

Read all six changed product/docs files in full, not only the patch:

- `.pi/extensions/pij/core/models/registry.ts`
- `.pi/extensions/pij/core/models/registry.test.ts`
- `.pi/extensions/pij/core/models/validate.test.ts`
- `.pi/extensions/pij/core/spawn.test.ts`
- `.pi/extensions/pij/core/models/cli-models.test.ts`
- `docs/how/pij-models-discovery.md`

## Required review

1. Exact trio contract: `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` → `none,low,medium,high,xhigh,max`; never `minimal`.
2. Raw Pi rows and model overrides are corrected only for provider `github-copilot` + exact ids.
3. Copilot seed clones inherit the correction; fallback aliases carry the same levels while remaining `verified:false`.
4. Unrelated Copilot models, a same-id non-Copilot provider, Codex levels, duplicate row count/order, and warn-don't-block remain unchanged.
5. Pi-client scope is bounded: Pi filter advertisement, shared bare-id validation, unchanged `:<level>` translation. Provider-prefix normalization is intentionally out of scope.
6. Held path `docs/domains/pij-control-plane/domain.md` is untouched.
7. Docs state the actual behavior without implying fallback aliases are live-verified.
8. Scope: compare `git diff --name-only` to the granted six-file product/docs fence; the execution log is the only worker-authored plan artifact.

## Dimension 0 — mandatory independent mutation proof

Run independent RED → restore byte-identical → GREEN checks. At minimum prove all three load-bearing guards:

1. Disable the curated trio branch → targeted tests RED.
2. Remove only the `provider === "github-copilot"` parse guard → same-id non-Copilot preservation test RED.
3. Add `minimal` to the curated constant → validation/warning/advertisement tests RED.

Use `just flow-pair-mutate` where suitable or an equivalent controlled edit. Record the exact mutation, RED output, restored SHA/byte identity, and GREEN output. A missing/non-vacuous proof means `FIX_REQUIRED`.

## Gate and blocker adjudication

The coder reports:

- targeted model tests `195/195`;
- flow-pair `148/148`;
- full suite `1809 passed, 10 skipped`;
- typecheck, lint, Pi-free assertion, live Pi/Copilot JSON, pkg audit, snapshots green;
- `harness checks` red only because `.pi/extensions/pi-peacock/smoke.ts:15` hardcodes the main checkout path/branch; targeted pij smoke passes.

Verify whether the smoke failure is genuinely unrelated and outside S045's fence. Do not fix it. A correct S045 diff may receive `APPROVE_WITH_NOTES` while the orchestrator keeps the phase gate blocked; any S045 defect remains `FIX_REQUIRED`.

## Output

Write exactly one review artifact:

`docs/plans/045-copilot-5-6-effort-levels/reviews/review.phase-1.dlg-0002.md`

Include:

- `Verdict: APPROVE | APPROVE_WITH_NOTES | FIX_REQUIRED`
- findings table: severity · file:line · claim · evidence · smallest fix
- Dimension 0 mutation evidence
- AC-01..AC-08 coverage table
- scope/fence verdict
- gate/blocker classification

Then send:

`<VERDICT> — review at docs/plans/045-copilot-5-6-effort-levels/reviews/review.phase-1.dlg-0002.md`

## Forbidden

- No product/doc fixes.
- No write outside the one review artifact, except temporary mutation edits that are restored byte-identically.
- Do not touch `docs/domains/pij-control-plane/domain.md`, `.flow-pair/**`, `the-flow.json`, `the-flow.md`, `.the-flow-state.json`, `government/**`, package files, git staging/commits, or daemon state.
