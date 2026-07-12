# Phase 3 Fix Packet — Review F-001 to F-003

## Mission

Fix only the three findings in
`docs/plans/041-pij-inbox-no-tmux/reviews/phase-3-push-path-review.md`.
Do not broaden Phase 3 or redo already-approved behavior.

- **Repo**:
  `/Users/jordanknight/pi-hacking/pij-worktrees/s041-inbox-no-tmux`
- **Original delegation**: `dlg-0001`
- **Reviewer**: `pij-vicious-swift`
- **Review verdict**: `FIX_REQUIRED`

## Allowed Files

- `.pi/extensions/pij/core/daemon/loop.ts`
- `.pi/extensions/pij/core/daemon/loop.test.ts`
- `.pi/extensions/pij/daemon.ts`
- `.pi/extensions/pij/daemon.test.ts`
- `.pi/extensions/pij/core/daemon/watch.test.ts`
- `.pi/extensions/pij/cli.integration.test.ts`
- `docs/plans/041-pij-inbox-no-tmux/tasks/phase-3-push-path-convergence-and-guidance/tasks.md`
- `docs/plans/041-pij-inbox-no-tmux/tasks/phase-3-push-path-convergence-and-guidance/execution.log.md`

The `watch.test.ts` test-only fence was granted at government Spine Seq 81 for
exactly the F-002 assertions below. No production watcher file is authorized.

## Required Fixes

### F-001 — Per-message progress on same-target partial failure

When two unread messages target the same bound tmux peer and `sendText` succeeds
for the first but throws for the second:

- publish the first message's marker and terminal receipt before the later
  failure escapes;
- keep the failed second message unread;
- do not inject the first message again on the next tick; and
- preserve failure isolation for unrelated targets.

Add a permanent regression with two messages for one target. Prefer the smallest
design that makes progress per message; do not weaken event-before-marker,
post-outcome timing, no-pane behavior, or pull non-ownership.

### F-002 — Retained watch-delivery regression

Keep the existing phantom `pij-watch` inbox assertion. Replace only the stale
target-inbox deletion assertion with proof that:

- exactly one `msg-*` envelope remains;
- a matching `read-*` marker exists; and
- `FsChannel.listUnread(target)` returns `[]`.

Do not edit the watcher adapter or smoke harness.

### F-003 — Load-bearing AC-14 mapping test

Strengthen the existing CLI/skill guidance regression so it asserts the exact C1
receive association:

- pi push → automatic in-process injected turn;
- tmux control-plane push → automatic daemon-injected turn;
- external pull → `pij inbox --wait [ms]`.

Also assert the exact peer-route clauses needed to preserve this mapping. Repeat
the reviewer's receive-column inversion mutation and require the named test to go
RED, then restore byte-identically and prove GREEN.

## Proof

Run focused regressions for all three findings, then:

- `just test`
- `just typecheck`
- `just lint`
- `just pij-skill-check`
- `harness checks --quick`

Record exact counts, the F-003 mutation/RED/GREEN/hashes, and finding dispositions
in the Phase 3 execution log. Mark only the coder-owned fix work complete.

## Forbidden

- No daemon restart or live proof.
- No commit, push, merge, or branch operation.
- No production watcher, smoke-harness, package/lock, registry, discovery, spawn,
  Copilot harness, flow-state, `.flow-pair`, government, or unrelated changes.
- Do not modify the review verdict artifact.

## Report

Send:

```json
{
  "delegationId": "dlg-0001-fix-001",
  "outcome": "COMPLETE | BLOCKED",
  "summary": "what changed",
  "filesChanged": ["..."],
  "testsRun": 0,
  "testsPassed": 0,
  "gatesClean": true,
  "notes": "finding dispositions and mutation evidence"
}
```
