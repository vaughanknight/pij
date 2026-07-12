# Phase 3 Targeted Re-Review Packet — F-001 to F-003

## Mission

Re-review only the dispositions of F-001, F-002, and F-003 from
`phase-3-push-path-review.md` after the compacted coder applied
`phase-3-fix-packet.md`.

- **Repo**:
  `/Users/jordanknight/pi-hacking/pij-worktrees/s041-inbox-no-tmux`
- **Original diff base**: `e6f36be`
- **Fixed diff capture**:
  `.flow-pair/runs/2026-07-12T11-01-40Z-github.com-AI-Substr/diffs/diff-0002.patch`
- **Write the verdict to**:
  `docs/plans/041-pij-inbox-no-tmux/reviews/phase-3-push-path-rereview.md`

## Required Dispositions

### F-001

Prove that for two messages to one tmux target, a successful first injection is
marked and receives its terminal receipt before a second `sendText` exception;
the failed second stays unread; the first is not replayed on the next tick; and
unrelated-target failure isolation remains intact.

### F-002

Verify the Seq 81 test-only change preserves the phantom `pij-watch` inbox
assertion while proving one retained target `msg-*`, one matching `read-*`, and
`FsChannel.listUnread(target) = []`. Confirm no production watcher or smoke
harness changed.

### F-003

Verify the guidance test asserts the exact C1 receive association and peer-route
clauses. Independently invert the receive mapping again; the named test must go
RED. Restore byte-identically, record the hash, and prove GREEN.

## Gates

Run focused regressions, then fresh:

- `just test`
- `just typecheck`
- `just lint`
- `just pij-skill-check`
- `harness checks --quick`

Confirm package-audit timestamp drift is absent/restored and scope remains within
the original fence plus the Seq 81 `watch.test.ts` addendum.

## Boundaries

- Read any source required.
- Do not fix code or documentation.
- Temporary F-003 mutation must restore byte-identically.
- Write only the re-review artifact named above.
- Do not modify `.flow-pair/**`, flow-state files, packages/locks, government
  ledgers, production watcher/smoke files, or unrelated paths.
- Do not restart the daemon, run live proof, commit, push, or merge.

## Verdict

Use `APPROVE`, `APPROVE_WITH_NOTES`, or `FIX_REQUIRED`. Send:

```json
{
  "delegationId": "dlg-0001-rereview-001",
  "outcome": "COMPLETE",
  "verdict": "APPROVE | APPROVE_WITH_NOTES | FIX_REQUIRED",
  "reviewPath": "docs/plans/041-pij-inbox-no-tmux/reviews/phase-3-push-path-rereview.md",
  "findings": 0,
  "notes": "concise fresh proof"
}
```
