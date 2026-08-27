# FX002: Phase 2 missing Dim-0 witnesses (test-only; from reviews/phase-2-review.md FIX_REQUIRED)

**Status**: complete

**Branch**: `s392/day3-codex-doctrine` (tip is Phase 4 `c354d22`; git log first) · **Fence**: `.pi/extensions/pij/index.test.ts` ONLY · **No source change** — the production code is correct (orchestrator verified: `onInbound`→`pi.inject`→`sendUserMessage`; a throw rejects the consumer handler → row stays `claimed`; reload calls `disposeWatch?.()` which disposes the consumer + closes sqlite). These add the MISSING witnesses.

## Tasks
| Status | ID | Task | Path | Done When | Notes |
|--------|-----|------|------|-----------|-------|
| [x] | FX-A | Add a rejecting-inject test: boot with `PIJ_QUEUE_BACKEND=sqlite`, `makeFakePi` whose `sendUserMessage` THROWS on the first free-text inject; deliver one row via `SqliteQueue`; assert the delivery row state is `claimed`, NOT `acked` (query the queue), and no `acked` receipt exists. **Acceptance: mutation M2b (swallow the throw in the consumer handler) goes RED.** Exact mutate command in `reviews/phase-2-review.md`. Also (sibling, non-blocking): fix the "acks after injection" ordering test to sample the marker state from INSIDE `sendUserMessage` (the pattern exists ~60 lines above in the fs test — `markerStateDuringInbound`), not via a `waitFor` race. | `.pi/extensions/pij/index.test.ts` | FX-A test GREEN on HEAD; M2b RED; restore GREEN | test-only |
| [x] | FX-B | Add a reload-dispose witness: in the existing sqlite fake-timer reload test, bracket `vi.getTimerCount()` (or an equivalent live-consumer count) across a `/reload` and assert the count does not grow — i.e. the prior consumer's poller was disposed. **Acceptance: mutation M8 (drop the reload dispose) goes RED.** CAVEAT from the reviewer: `startQueueConsumer` `unref`s its timer and it is unverified whether vitest counts unref'd timers — the `getTimerCount` mechanism is a suggestion; the REQUIREMENT is that M8 goes RED, so if the timer isn't counted, witness the dispose another way (e.g. a spy on the returned disposer, or assert no second `onScan` from the old consumer after reload). | `.pi/extensions/pij/index.test.ts` | FX-B test GREEN on HEAD; M8 RED; restore GREEN | test-only |
| [x] | FX-C | Gates (`npx vitest run .pi/extensions/pij/index.test.ts`, `just typecheck`) + pathspec commit (`git commit -- .pi/extensions/pij/index.test.ts docs/plans/392-day3-codex-doctrine/tasks/fx002-phase2-witnesses/tasks.md`) + paste both mutation RED/GREEN into the execution log; report per schema | — | committed, mutations recorded | |

## Non-blocking (record, do not fix here)
- M6 (drop the `pij_send` sqlite handle close, `index.ts:133`) stays green — bounded resource growth, not data loss; a witness needs a new `SqliteQueue` open/close test seam. Follow-up, orchestrator-accepted the reviewer's judgement.
