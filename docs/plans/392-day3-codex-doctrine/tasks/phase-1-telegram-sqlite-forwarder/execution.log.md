# Phase 1 execution log

**Delegation**: `dlg-0001`  
**Worker**: `pij-gunboat-diplomat`  
**Worktree**: `/Users/vaughanknight/GitHub/pij-worktrees/s392-day3-codex-doctrine`
**Implementation commit**: `69f1c4524c39340ff63c26ba498fd489ca3faeec`

## TDD evidence

| Task | RED | GREEN |
|------|-----|-------|
| T001/T002 queue consumer | `queue-consumer.test.ts` failed because `./queue-consumer.js` did not exist | 5/5 tests passed |
| T003/T004 sqlite forwarder | 6 sqlite tests failed at the production `channel.watch is not a function` assumption | 80 passed, 1 pre-existing skip in `bridge.test.ts` |
| T005 runtime factory | 3 tests failed: `runtimeFor` was unavailable and `openChannel` dropped fs watcher options | 27 passed, 1 pre-existing skip across `channel-factory.test.ts` + `index.test.ts` |
| T006 receipt honesty | pane-less `{harness:"pi"}` returned `delivered` instead of `queued/pull-inbox` | the new receipt test and explicit push control passed; full `cli.test.ts` passed 462/462 |

## Implementation

- Added `startQueueConsumer`: serialized claim -> handler -> `claimUnread`, immediate backlog scan, unref polling, scan heartbeat, and dispose.
- Handler rejection leaves the sqlite row `claimed`; the daemon lease sweep remains the only retry/park owner.
- Widened `startForwarder` to `MessageChannel`. SQLite uses the consumer and throws `ForwardIncomplete` when any required text bubble is undelivered; fs keeps the prior watch/log-and-continue behavior.
- Made `runtimeFor` use `openChannel`, preserving poll-primary watcher options for the explicit fs backend.
- Made receipt classification and daemon authority use `effectiveDeliveryMode`.
- Documented sqlite default, state watermark, W1/W2 duplicate windows, retry/park behavior, fs opt-out, queue sensor, and phone oracle.
- Did not modify `adapters/sqlite-queue.ts`, the live daemon/bridge, or a live queue.

## Gate evidence

| Gate | Result | Evidence |
|------|--------|----------|
| Changed-file Biome | PASS | `npx biome check` on the 10 changed TypeScript files: 10 checked, no fixes |
| Typecheck | PASS | `just typecheck` |
| Focused phase tests | PASS | 574 tests passed, 2 skipped after fixture intent was made explicit in allowed tests |
| Widened fixture test | PASS | `fs-registry.overlay.test.ts`: 44/44 passed after the pane-only ruling |
| Full pij tests | PASS | `npx vitest run .pi/extensions/pij/`: 171 files passed, 2 skipped; 3920 tests passed, 15 skipped |
| Full repository tests | KNOWN RED OUTSIDE FENCE | `just test`: 4534 passed, 19 skipped, 1 failed because `pwsh` is unavailable (`release-age-policy.test.ts`, `spawnSync pwsh ENOENT`) |
| Lint | KNOWN RED OUTSIDE FENCE | Changed files are clean; repo-wide `just lint` reports existing diagnostics in `copilot-rpc.test.ts`, `producers/**`, `core/agents/cli-verbs.test.ts`, `core/harness/badmodel.test.ts`, `core/models/match.ts`, and `skills/flow-pair/test/**` |
| pij skill check | KNOWN RED OUTSIDE FENCE | Existing route budget/pointer/order failures under `skills/pij/**` |
| Windows compatibility | KNOWN RED OUTSIDE FENCE | Typecheck passed; the composite stopped at the same repo-wide lint failures |
| Smoke | RED OUTSIDE PHASE SURFACE | 9 scenarios passed; `pij-watchdog` reported `smoke first fire was not queued`, and `pi-peacock` hit its worktree assertion |
| `harness checks` | RED | Passed `local-paths`, `typecheck`, `pkg-audit`, `snapshots`; failed `lint`, the known missing-`pwsh` test, `windows-compat` at lint, and the two smoke scenarios above |

## Scope ruling

`pij-falling-outside` approved a pane-only fence widening for the four daemon-owned receipt
fixtures. The only edits were `paneId:"%1"` plus the ruled one-line comment at
`.pi/extensions/pij/adapters/fs-registry.overlay.test.ts:166,181,197,550`.
