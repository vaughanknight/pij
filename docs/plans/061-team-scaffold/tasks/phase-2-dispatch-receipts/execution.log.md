# Phase 2: Dispatch receipts — Execution Log

## Progress

| Time | Task | State | Evidence |
|------|------|-------|----------|
| 2026-07-20 | T001 | complete | Freeze suites passed on P1 HEAD before production P2 edits: message 8, inbox 16, CLI 243 (267 total). |
| 2026-07-20 | T002 | complete | Red proof failed on missing brief-ack framing, inbox action, dispatch canonicalizer, and dispatch store; all named AC-05 tests now pass. |
| 2026-07-20 | T003 | complete | Added additive BriefAckReceipt framing/guard, hidden durable inbox action, Dispatch guard/canonical transitions, DispatchStorePort, and `~/.pij/dispatches/` adapter. T001 remained green; typecheck passed. |
| 2026-07-20 | T004 | in progress | Added dispatch store-contract and journal adjudication/crash-window tests before widening recovery. |
| 2026-07-20 | T005 | complete | Widened recovery with dispatch canonical adjudication and mandatory store threading through CLI write ports, runtime-axis, daemon composition, acceptance fixtures, and all real/fake test rigs. Typecheck + 415 targeted tests passed. |
| 2026-07-20 | T009 | complete | Added red-to-green coverage for `markCommitted` failure; `coupledRecordCommit` now stops before appendOnce, returns a named committed-marker error, and leaves the landed record + intent for next-write adjudication. |
| 2026-07-20 | T004 | complete | Dispatch intent/committed adjudication, crash-window exact-once replay, store parity, and a nested-lock peer-delivery probe are green. |
| 2026-07-20 | T006 | complete | Added positional-target `dispatch`, dispatch-id `ack`, packet hashing/header, undelivered→delivered-unacked→acked coupled commits, shared-store wait, brief-ack receipt delivery, actor attribution, evidence/JSON, and real-bin coverage. |
| 2026-07-20 | T007 | complete | Added 5-case fail-loud matrices per verb, unknown-id and sha-mismatch zero-write refusals, undelivered delivery failure, and timeout evidence that remains `delivered-unacked`. |
| 2026-07-20 | T008 | complete | Recorded the packet header as a reusable spawn-boot acknowledgement primitive; no spawn code changed in this phase. |
| 2026-07-20 | fix-0002 | complete | Strengthened the real-bin `dispatch --wait` test to require the timeout as the final output and reject any false `state=acked` output. |

## Gates

| Gate | Result | Evidence |
|------|--------|----------|
| Pre-flight `harness boot` | known T15 red | Typecheck passed. Full test boot timed out in `adapters/channel.test.ts` afterEach for `drains messages already present when watch starts, in order`; this matches the packet's tracked T15 class and is not in scope to modify. |
| Targeted Phase 2 | pass | Typecheck + touched-file Biome clean; 9 files, 467 tests passed, including real-bin dispatch timeout→ack and all recovery/acceptance fixtures. |
| Full lint | pass | `just lint` exited 0; only 10 pre-existing warnings and the Biome schema-version info remained, none in touched files. |
| Full gate attempt 1 | known T15 red | `just typecheck` passed; 3196 tests passed, 11 skipped. Only `telegram/bridge.test.ts` `normalizes an existing exact canonical prefix to one` and `telegram/index.test.ts` `degrades to the sender tag for missing descriptors and non-git folders` timed out under full-suite load. |
| Full gate attempt 2 | known T15 red | `just typecheck` passed; 3196 tests passed, 11 skipped. Only `daemon-push.test.ts` `pushes only ONCE per stalled transition (latch)` and `adapters/channel.test.ts` `drains messages already present when watch starts, in order` timed out; the failing set shifted, matching tracked contention behavior. |
| T15 isolated confirmation | pass | The four implicated files passed isolated: channel 14, daemon-push 21, telegram index 20, telegram bridge 71 (126/126). |
| `harness checks` | known T15 red | local-paths, typecheck, lint, windows-compat, smoke, package audit, and snapshots passed. Test sensor had only `pushes only ONCE per stalled transition (latch)`, already green isolated. |
| fix-0002 mutation proof | red as required | With `waitDispatch()` temporarily treating `delivered-unacked` as terminal, the strengthened real-bin test failed: final output was `brief-ack seat=unknown message=unknown`, not `state=delivered-unacked (timeout awaiting brief ack)`. |
| fix-0002 restored proof | pass | Restored the ack-only predicate exactly; the named real-bin test passed. Typecheck and the focused 9-file Phase 2 suite then passed 467/467. |

Reviewer note: the daemon-push timeout drives daemon tick composition, including construction of the newly threaded `FsDispatchStore` and `RuntimeAxisTracker`, but seeds no dispatch recovery intent; the channel/telegram timeout tests do not exercise the dispatch coupled-write/recovery path. All Phase 2 dispatch and recovery tests are green.

## Discoveries

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| 2026-07-20 | T001 | constraint | P2 must preserve the three-value `ReceiptState` and existing delivery receipt wire/action shapes before additive brief acknowledgements land. | Added named freeze tests before production changes. | AC-06; F-04 |
| 2026-07-20 | T006 | decision | The packet's `[--to]` sketch conflicted with workshop 001 and defined no safe target inference. | Orchestrator ruled workshop 001 authoritative: `pij dispatch <id> --packet <file> [--wait]`; target is a required positional, no `--to`, inference, or default. | dlg-0002 T006 ruling; workshop 001; KF-01 |
| 2026-07-20 | T006 | decision | A packet header cannot name its own transport messageId because `deliver()` allocates that id after the immutable body is written. | Orchestrator ruled the runnable command is `pij ack <dispatchId> --packet-sha <sha>`; ack joins through the durable dispatch record, then the receipt carries the actual recorded transport messageId plus packetId+sha. Unknown ids refuse loudly. | dlg-0002 T006 ruling 2; provisional W-002 amendment |
| 2026-07-20 | T008 | reuse | The pre-send packet header is transport-independent: a spawn boot task can embed the same dispatch id + packet sha + first-action ack command and later join the actual transport message id through the dispatch record. | Preserve this header block as the reusable mechanical ack primitive for a later spawn/skill plan; no code in P2. | INS-001; W-002 |
| 2026-07-20 | fix-0002 | test-proof | A state substring emitted before `waitDispatch()` starts cannot prove the wait reached its terminal timeout path. | Pin the final non-empty output line to `renderDispatchWaitTimeout(record)` and reject `state=acked`; the reviewer mutation now fails. | rev-0002 required fix; AC-05 |
