# s037 reviewer brief

**Reviewer model**: Copilot `gpt-5.6-sol`, xhigh
**Spawn**: lazy, after coder `dlg-0001` reports complete
**Mode**: read-only review

## Review target

- Plan: `docs/plans/037-pij-broadcast/pij-broadcast-plan.md`
- Validation: `docs/plans/037-pij-broadcast/validations/pij-broadcast-validation.md`
- Execution evidence: `docs/plans/037-pij-broadcast/execution.log.md`
- Final phase diff: supplied after coder completion

## Required checks

1. Existing positional single-recipient send and wait output remain byte-for-byte compatible.
2. Repeatable `--to` parsing is isolated; unrelated scalar flags retain prior semantics.
3. Duplicate/mixed/invalid broadcast forms fail before delivery.
4. Full-target preflight produces zero inbox writes on any static target error.
5. Fan-out preserves input order, raw body, unique message ids, independent outcomes, and continued attempts after a runtime delivery failure.
6. Broadcast waiting correlates every successful `{to,messageId}`, exits only when all are terminal or timed out, names unresolved targets, and preserves non-zero partial-failure exit status.
7. No daemon/session transport code changed.
8. Concurrent s036 additions in `cli.ts` and `docs/how/pij.md` remain intact.
9. Live-deployed `skills/pij/references/routes/peer.md` is touched only after ship-time approval and `just pij-skill-check`.

## Mandatory Dim-0 proof

Mutation-test one load-bearing broadcast guard or assertion:

- apply a deliberate temporary mutation;
- prove the relevant targeted test turns RED;
- restore the file byte-identically;
- prove the test returns GREEN;
- record mutation, RED command/output summary, restore proof, and GREEN command.

## Verdict

Return `APPROVE`, `APPROVE_WITH_NOTES`, or `FIX_REQUIRED` with exact file:line evidence. A clean verdict without named files and Dim-0 evidence is invalid.

Forbidden: edits; `.the-flow-state.json`; `the-flow.json`; `the-flow.md`; `.flow-pair/**`.
