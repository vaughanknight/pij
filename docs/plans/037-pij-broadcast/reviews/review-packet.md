# s037 code review packet

**Delegation**: `dlg-0001`
**Reviewer role**: independent CODE reviewer
**Verdict artifact**: `docs/plans/037-pij-broadcast/reviews/reviewer-verdict.md`

## Inputs

- Plan: `docs/plans/037-pij-broadcast/pij-broadcast-plan.md`
- Plan validation: `docs/plans/037-pij-broadcast/validations/pij-broadcast-validation.md`
- Coder report: `docs/plans/037-pij-broadcast/reports/coder-report-dlg-0001.json`
- Execution log: `docs/plans/037-pij-broadcast/execution.log.md`
- Review rubric/requirements: `docs/plans/037-pij-broadcast/reports/reviewer-brief.md`
- Scoped patch archive: `docs/plans/037-pij-broadcast/reviews/coder-diff.patch.gz`
- Decompressed scoped patch sha256: `f3f03d3b5695bccdf3548be1108b801d2981f605a4dcac7fb97a9f86947818ff`
- Peer-route gate evidence: `docs/plans/037-pij-broadcast/reports/peer-route-evidence.md`
- Live target attestations: `docs/plans/037-pij-broadcast/reports/live-smoke-attestations.md`

`flow-pair observe` could not produce its ledger artifact because it scanned the whole concurrent worktree and rejected unrelated s036 `the-flow.json`; harness observation `DL-006` records the defect. Review only the scoped patch above.

## Instructions

1. Read all inputs and the actual scoped files.
2. Review correctness, compatibility, types, error/partial-failure semantics, wait state, test quality, docs, and scope.
3. Run the mandatory Dim-0 mutation proof from `reviewer-brief.md`; restore byte-identically.
4. Run the smallest tests needed to verify findings.
5. Write `reviewer-verdict.md` with `APPROVE`, `APPROVE_WITH_NOTES`, or `FIX_REQUIRED`, exact file:line evidence, mutation RED/restore/GREEN proof, and any findings.
6. Send the orchestrator only this pointer: `docs/plans/037-pij-broadcast/reviews/reviewer-verdict.md`.

Read-only product review: do not leave product-code or plan changes behind. The verdict artifact is your only allowed write.

Forbidden: `.the-flow-state.json`, `the-flow.json`, `the-flow.md`, `.flow-pair/**`, `government/**`, and all paths outside the scoped review inputs.
