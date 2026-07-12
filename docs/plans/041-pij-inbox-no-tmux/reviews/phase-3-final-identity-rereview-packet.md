# Final Cold Re-Review — Identity Residuals

## Mission

Re-review only the two residual findings from
`phase-3-contaminated-identity-rereview.md` after the Seq 127 fix.

Write:
`docs/plans/041-pij-inbox-no-tmux/reviews/phase-3-final-identity-rereview.md`.

## Required Dispositions

### Explicit-id bypass

- With detectable ambient native identity, `PIJ_SESSION_ID` must not bypass
  mode-aware ambient validation.
- Resolver errors propagate.
- Explicit and validated ambient ids must match or fail `E-AMBIG`.
- Exact validated match succeeds.
- With no ambient native identity, direct explicit-id compatibility remains.
- Phonehome pending/bootstrap paths that rely on explicit id remain green.

### Durable report history

- External repair preserves append-only `reportedAt`.
- Repair still clears `agentOnce` and all stale pane/push/spawn runtime.
- Preserved `reportedAt` alone must not trigger once-close.

## Independent Dimension 0

1. Restore explicit-id early return/bypass: contaminated explicit-id regression
   must RED, then byte-identical GREEN.
2. Delete `reportedAt` during repair: history-preservation regression must RED,
   then byte-identical GREEN.

## Gates

- Focused residual suites
- `just test`
- `just pij-skill-check`
- `just typecheck`
- `just lint`
- `harness checks --quick`
- package/scope audit and `git diff --check`

## Boundaries

Read any required source. Do not fix code/tests. Write only the final re-review
artifact. No deployment, daemon restart, manual test, commit, push, merge, or
quarantined identity use.

On completion, compact is fire-and-forget: send immediately without `--wait`,
then continue verdict handling (Spine Seq 128).

## Verdict

Return `APPROVE`, `APPROVE_WITH_NOTES`, or `FIX_REQUIRED` with exact evidence,
then send concise JSON to `pij-concrete-reptile`.
