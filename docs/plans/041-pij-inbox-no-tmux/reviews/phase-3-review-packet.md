# Phase 3 Cold Review Packet — Push-Path Convergence and Guidance

## Mission

Cold-review the complete uncommitted Phase 3 implementation for Plan 041. The
coder completed T001-T010 and stopped before the orchestrator-owned review,
daemon-restart/live-proof, and ship gates.

- **Repo**:
  `/Users/jordanknight/pi-hacking/pij-worktrees/s041-inbox-no-tmux`
- **Diff base**: `e6f36be`
- **Plan**:
  `docs/plans/041-pij-inbox-no-tmux/pij-inbox-no-tmux-plan.md`
- **Tasks/log**:
  `docs/plans/041-pij-inbox-no-tmux/tasks/phase-3-push-path-convergence-and-guidance/`
- **Prior approval**:
  `docs/plans/041-pij-inbox-no-tmux/reviews/phase-2-inbox-review.md`
- **Write the verdict to**:
  `docs/plans/041-pij-inbox-no-tmux/reviews/phase-3-push-path-review.md`

## Review Contract

Review all changed files against T001-T010, AC-06/07/11/12/13/14, Phase 2 pull
non-ownership, event-before-marker ordering, and the granted fence. Use the
10-dimension flow-pair rubric at
`skills/flow-pair/references/review-rubrics.md`.

Mandatory focus:

1. Tmux envelopes remain immutable; markers publish only after a real injection
   outcome. Failed, unconsumed, and no-pane messages remain unread.
2. Receipt envelopes never inject, and their durable receipt event exists before
   their marker so external `send --wait` can resolve.
3. Pi marks only after `PijSession.onInbound` returns. Durable markers own
   start/reload history while `FsChannel.watch()` and process-local `seen` remain
   unchanged.
4. Pull descriptors remain daemon-unowned at heartbeat, drive, buffer, and drain
   gates; legacy descriptors preserve push behavior.
5. The restored s043 control-plane baseline is preserved. The source was commit
   `a831930bdcc190f58abf31f153131c0953227d9c`, blob
   `844464ee03dcbc54e3a660245ddac93095b0a5a7`; Phase 3 may add s041 text only.
6. `/pij`, CLI help, operator docs, and domain docs distinguish no-tmux pull from
   tmux/pi push without weakening push-not-poll or compact discipline.
7. Scope matches the frozen packet. No package/lock, registry, discovery, spawn,
   Copilot harness, watcher adapter, smoke-harness, or unrelated changes.

## Dimension 0 — Mandatory

Independently prove the tests are load-bearing. Perform targeted reversible
mutation proof for:

- marker ownership/post-outcome timing; and
- the push/pull guidance branch.

Record the exact mutation, RED result, byte-identical restoration hash, and GREEN
result. Do not accept the coder's mutation claim without direct evidence.

## Proof

Run the smallest focused commands that prove the changed behavior, then:

- `just typecheck`
- `just lint`
- `just pij-skill-check`
- `harness checks --quick`

R-004 applies: the shared Pi folder-trust smoke timeout is non-blocking and must
not trigger smoke-harness edits.

## Boundaries

- Read any repository source needed for review.
- Do not fix production code or docs.
- Temporary mutation edits must restore byte-identically.
- Write only the verdict artifact named above.
- Do not edit `.the-flow-state.json`, any `the-flow.json`/`the-flow.md`,
  `.flow-pair/**`, package/lock files, or government ledgers.
- Do not restart the daemon, run live proofs, commit, push, or merge.

## Verdict

Use `APPROVE`, `APPROVE_WITH_NOTES`, or `FIX_REQUIRED`. Findings must include
severity, exact file/line or command evidence, impact, and smallest fix. On
completion send:

```json
{
  "delegationId": "dlg-0001-review",
  "outcome": "COMPLETE",
  "verdict": "APPROVE | APPROVE_WITH_NOTES | FIX_REQUIRED",
  "reviewPath": "docs/plans/041-pij-inbox-no-tmux/reviews/phase-3-push-path-review.md",
  "findings": 0,
  "notes": "one concise evidence summary"
}
```
