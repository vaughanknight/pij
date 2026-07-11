# Review request — Plan 039 Phase 1

## Assignment

Perform a cold, read-only cross-model review of:

- Base: `6067b07`
- Head: `16a57e1`
- Commits:
  - `6cd6506` — Vitest/tsx plus ruling §8's live-test argument reorder
  - `16a57e1` — Pi/ws lock plus Node 22/24 CI

Write the verdict to:

`docs/plans/039-dependency-chores-audit/reviews/review.phase-1.md`

Then send the orchestrator only that path pointer.

## Sources

1. `docs/plans/039-dependency-chores-audit/dependency-chores-audit-plan.md`
2. `docs/plans/039-dependency-chores-audit/rulings.md`
3. `docs/plans/039-dependency-chores-audit/tasks/phase-1-dependency-audit/tasks.md`
4. `docs/plans/039-dependency-chores-audit/tasks/phase-1-dependency-audit/execution.log.md`
5. `docs/plans/039-dependency-chores-audit/reports/phase-1-checkpoint.md`
6. `skills/flow-pair/references/review-rubrics.md`

## Review contract

- Read the complete `6067b07..16a57e1` diff and relevant unchanged manifests/config.
- Check all rubric dimensions, emphasizing scope, plan alignment, audit proof, reproducible lock state, regression, and execution-log honesty.
- Verify the two commit scopes exactly match the fence/addendum.
- Verify final versions: Vitest 4.1.10, tsx 4.23.0, root esbuild 0.28.1, Pi family 0.80.6, root ws 8.21.0, wildcard Pi peers, minih-v0.2.4.
- Run fresh `npm audit --json`; require total 26, critical 0, and minih-only ancestry.
- Run full `harness checks` at quiescence. Report any brownout retry separately; persistent red is a finding.
- Verify CI matrix `[22, 24]`, unchanged report-only behavior, and an accurate minih-residual comment.
- Verify no Dependabot config/settings, minih ref, work item 040 package hunk, or unrelated direct dependency change.
- Do not edit source, manifests, workflow, tasks, checkpoint, or flow files.

## Dimension 0 evidence

The worker added no product behavior or new tests. For the five granted live-test calls, empirical RED→GREEN already occurred:

- RED: Vitest 4 rejected legacy `it(name, fn, { timeout })` in the three named suites.
- GREEN: after the reorder-only addendum, the full suite passed.

Verify purity with:

```bash
git diff --ignore-all-space 6cd6506^ 6cd6506 -- \
  harness/scripts/vetters/agent.live.test.ts \
  .pi/extensions/pij/core/agents/peer.live.test.ts \
  .pi/extensions/pij/core/agents/adapters/adapters.live.test.ts
```

The only semantic change must be `it(name, { timeout }, fn)` with identical names, bodies, assertions, and timeout values.

## Return format

The review artifact must contain:

- Reviewer model and exact diff range.
- Verdict: `APPROVE`, `APPROVE_WITH_NOTES`, or `FIX_REQUIRED`.
- Findings by severity with exact evidence.
- Dimension 0 evidence.
- Fresh commands and material results.
- Explicit scope/path comparison.
- One-line thesis: whether the 34→29→26 claim is supported.

No style-only noise. Any critical/high finding requires `FIX_REQUIRED`.
