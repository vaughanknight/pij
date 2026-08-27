# Phase 2 execution log

**Delegation**: `dlg-0002`  
**Worker**: `pij-gunboat-diplomat`  
**Implementation commit**: `621c846d9faa83140c6fd997f4fb2e9b49202481`

## TDD evidence

- RED: `index.test.ts` added three sqlite-default tests; all three failed against the
  fs-only wiring (no sqlite injection/ack and `pij_send` wrote no sqlite row).
- GREEN: `index.test.ts` passes 14/14.
- Focused integration: `index.test.ts`, `index.send-schema.test.ts`, and
  `queue-consumer.test.ts` pass 27/27.

## Implementation

- `pij_send` uses `openChannel(pijHome)` and closes a selected sqlite queue in `finally`
  after the synchronous dispatch.
- Session boot uses `openChannel` with poll-primary fs options.
- SQLite starts `startQueueConsumer`; `receiver.onInbound` completes before the consumer
  acks, and `onScan` calls `receiver.noteInboxScan`.
- Reload/shutdown disposes the consumer and closes its sqlite handle.
- The fs branch retains its prior `listUnread`/`seen`/`watch`/`markRead` flow; its two
  direct-fs tests explicitly set `PIJ_QUEUE_BACKEND=fs`.
- No live restart was performed.

## Gates

| Gate | Result |
|------|--------|
| Changed-file Biome | PASS — `index.ts` and `index.test.ts` clean |
| `just typecheck` | PASS |
| `npx vitest run .pi/extensions/pij/` | PASS — 171 files passed, 2 skipped; 3923 tests passed, 15 skipped |
| `just lint` | Known out-of-fence red in existing `copilot-rpc`, producer, model, and flow-pair files |
| `just pij-skill-check` | Known out-of-fence route budget/pointer/order debt |
| `harness checks` | Passed local paths, typecheck, package audit, snapshots; known reds remain lint, missing-`pwsh` repository test, Windows-at-lint, and smoke |

The aggregate red sensors are unchanged from Phase 1 and outside this dispatch fence.
