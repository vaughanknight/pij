# Cold Re-Review — Contaminated Identity Repair

## Mission

Re-review the Seq 113 mode-aware external identity repair against the withdrawn
external-adopt guard review.

## Changed Scope

- `.pi/extensions/pij/core/current-session.ts`
- `.pi/extensions/pij/core/current-session.test.ts`
- `.pi/extensions/pij/cli.ts`
- `.pi/extensions/pij/cli.integration.test.ts`
- `skills/pij/references/00-routing.md`
- `skills/pij/references/routes/peer.md`
- `docs/plans/041-pij-inbox-no-tmux/tasks/phase-3-push-path-convergence-and-guidance/execution.log.md`

Write:
`docs/plans/041-pij-inbox-no-tmux/reviews/phase-3-contaminated-identity-rereview.md`.

## Required Proof

1. External no-pane `whoami` accepts only paneless `deliveryMode:"pull"`.
2. Tmux ambient self accepts only the exact current-process pane and rejects
   pull/mismatched attachments.
3. Contaminated external descriptor is rejected before repair.
4. `pij inbox register` repairs the same durable id to paneless pull and repeat
   registration is idempotent.
5. Repair preserves all durable identity/history fields and removes only stale
   pane/push/failure/once-close runtime. Specifically adjudicate whether
   `reportedAt`, `lastEventAt`, `spawnedBy`, model/effort, branch, and pack
   metadata are history or disposable runtime.
6. Skill guidance makes external register the first identity action.
7. Existing fresh external registration and exact-pane tmux behavior remain
   green.

## Dimension 0

Independently perform both:

- remove/bypass mode-aware validation → named production regression must RED;
- preserve the stale pane or omit `deliveryMode:"pull"` in repair → named
  production regression must RED.

Restore each byte-identically and prove GREEN. Worker mutation claims are not
proof.

## Gates

- Focused current-session + production integration tests
- `just test`
- `just pij-skill-check`
- `just typecheck`
- `just lint`
- `harness checks --quick`
- scope/package audit and `git diff --check`

## Boundaries

Read any required source. Do not fix code/tests. Write only the re-review
artifact. No global deployment, daemon restart, commit, push, merge, quarantined
identity use, or manual test.

Reusable-peer compact is fire-and-forget: send it immediately without `--wait`,
then continue verdict handling (Spine Seq 128).

## Verdict

Return `APPROVE`, `APPROVE_WITH_NOTES`, or `FIX_REQUIRED` with exact finding
evidence, then send concise JSON to `pij-concrete-reptile`.
