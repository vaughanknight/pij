# Phase 3: Canary + derived safety + integration — Execution Log

## Progress

| Time | Task | State | Evidence |
|------|------|-------|----------|
| 2026-07-20 | pre-flight | known T15 red | `harness boot --json`: typecheck passed; only `adapters/channel.test.ts` `drains messages already present when watch starts, in order` timed out in `afterEach`, matching the standing T15 class. |
| 2026-07-20 | T001 | in progress | Read the packet, binding context, dispatch/ack implementation, canary ritual, descriptor identity fields, anomaly derivation, real-bin terminal-output precedent, smoke harness, and skill routes. |
| 2026-07-20 | T001 | question persisted | The packet requires `BriefAckReceipt.declaredRuntime` for model comparison and zero-record-write refusal, but does not specify the runnable canary reply wire shape or how the pass-time canary record joins the existing dispatch store. Asked the orchestrator for a narrow ruling before production design. |
| 2026-07-20 | T001 | ruling received | Canary is a real dispatch: caller writes a per-session nonce packet, standard `pij ack` proves sha/nonce + declared runtime, timeout truthfully leaves `delivered-unacked`, and CanaryRecord attaches to the real acked dispatch only after every check passes. |
| 2026-07-20 | T003 | red proven | Added record-derived anomaly tests. Existing 28 tests stayed green; only the new stale-unacked and half-open assertions failed before implementation. |
| 2026-07-20 | T001 | complete | Added pure pass/refuse coverage, five fail-loud argument cases, precondition zero-write proof, post-ack mismatch no-CanaryRecord proof, and real-bin timeout/pass tests using final-line assertions. |
| 2026-07-20 | T002 | complete | Added nonce packet generation under caller session data, real dispatch reuse, `canary-wait`, named timeout/model/identity refusals, UNPINNED caveat, and pass-time defensive-triple CanaryRecord coupled to the real dispatch/spine ref. |
| 2026-07-20 | T003 | complete | Stale dispatch, half-open allocation, clean-fixture, threshold, evidence-ref, and input/store immutability tests pass. |
| 2026-07-20 | T004 | complete | Extended the pure anomaly query with optional record inputs and wired CLI `pij anomalies` to allocation/dispatch stores; JSON and human evidence refs are read-only. Focused canary/anomaly/CLI suite passed 299 tests; typecheck passed. |
| 2026-07-20 | T005 | complete | Added the verb-family/how-to, worked project→stream→fence→dispatch→ack→canary→anomalies→close flow, workshop manifest JSON, and a direct non-tmux scratch-PIJ_HOME smoke. `npm run smoke -- team-scaffold` passes. |
| 2026-07-20 | T006 | complete | Updated `/pij` CLI coverage, C2 canary guidance, node-route record/anomaly rows, and kickoff steps 2/6/10/11 to invoke shipped verbs while linking the how-doc. `just pij-skill-check` passes. |
| 2026-07-20 | fix-0003 | red proven | Added the reviewer fixture: writer SHA A versus dispatch reread SHA B. The new test failed because canary exited 0 and created/delivered a dispatch instead of refusing before commitment. |
| 2026-07-20 | fix-0003 | complete | Threaded the writer SHA as internal-only dispatch metadata and now reject `E-CANARY-PACKET` immediately after the commitment-path reread. The fixture proves no dispatch record, spine event, or delivery occurs on mismatch. |

## Gates

| Gate | Result | Evidence |
|------|--------|----------|
| Pre-flight `harness boot` | known T15 red | Typecheck passed; one channel cleanup timeout in the authorized T15 family. |
| Focused T001-T004 | pass | Canary + anomalies + CLI: 299/299 tests; typecheck passed. |
| Team-scaffold smoke | pass | Scratch git repo and PIJ_HOME completed project/create/fence/dispatch/ack/canary/anomalies/close without tmux. |
| `just pij-skill-check` | pass | Router/module parity, CLI coverage, pointer integrity, worktree lifecycle, and prime invariants all green; only existing advisory line-budget warnings remain. |
| Final focused Phase 3 | pass | Canary + anomalies + CLI: 307/307 tests after project-scoped allocation anomaly wiring; typecheck and touched-file Biome checks passed. |
| Full lint | pass | `just lint` exited 0; only 10 pre-existing warnings and the Biome schema-version notice remained, none in touched files. |
| Full smoke | pass | All 11 smoke cases passed, including the new `pij-team-scaffold` walkthrough. |
| Full gate attempt 1 | known T15 red | Typecheck passed; 3216 tests passed, 11 skipped. Only `adapters/channel.test.ts` `drains messages already present when watch starts, in order` timed out in cleanup. |
| Full gate attempt 2 | known T15 red | 3216 tests passed, 11 skipped. Only `daemon-push.test.ts` `pushes only ONCE per stalled transition (latch)` timed out. |
| Full gate attempt 3 | known T15 red | 3215 tests passed, 11 skipped. Only `telegram/bridge.test.ts` `omits /main from the repository context prefix` and `telegram/index.test.ts` `forgets last-speaker state across a bridge restart` timed out under full-suite load. |
| T15 isolated confirmation | pass | The four tracked contention suites passed isolated: channel 14, daemon-push 21, telegram index 20, telegram bridge 71 (126/126). |
| `harness checks` | known T15 red | local-paths, typecheck, lint, windows-compat, smoke, package audit, and snapshots passed. Only the test sensor failed with four load-timeout cases in the tracked family; its retained tail named `telegram/index.test.ts` `forwards a long inbox reply to the chat, chunked, via the bot api` and channel `drains messages already present when watch starts, in order`. |
| fix-0003 regression | pass | Writer SHA A versus reread SHA B refuses `E-CANARY-PACKET`; zero dispatch records, spine events, and deliveries. Red proof was exit 0 before the guard; green proof is 1/1. |
| fix-0003 canary matrix | pass | `canary.test.ts`: 8/8. |
| fix-0003 focused P3 | pass | Canary + anomalies + CLI: 308/308, adding the new regression to the prior 307. |
| fix-0003 typecheck/lint | pass | `just typecheck` passed; `just lint` exited 0 with the same 10 pre-existing warnings and schema notice, none in touched files. |
| fix-0003 `harness checks` | known T15 red | Seven sensors passed. Only `daemon-push.test.ts` `pushes only ONCE per stalled transition (latch)` timed out under full-suite load; the unchanged suite passed isolated 21/21. |

## Discoveries

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| 2026-07-20 | T001 | question | A transient text nonce reply cannot directly reuse `BriefAckReceipt.declaredRuntime`, while a durable pre-pass dispatch would violate the packet's zero-record-write refusal rule on timeout. The exact responder command/wire shape and pass-time dispatch attachment are therefore contract-significant. | Persisted and asked the orchestrator before writing canary production code; anomaly work remains independent after T001 is specified. | T001/T002; Context Brief; workshop 001 D4 |
| 2026-07-20 | T001 | decision | Canary reuses the real dispatch/ack wire: nonce bytes live in a caller-session packet file, sha recomputation proves leg (a), and `BriefAckReceipt.declaredRuntime` proves leg (b). | Precondition refusals remain fully zero-write; timeout/post-ack mismatch preserve transport truth but never attach CanaryRecord; pass attaches it to the real acked Dispatch via a dispatch-kind coupled commit. | dlg-0003 addendum 1 |
| 2026-07-20 | fix-0003 | review fix | The canary writer SHA was validated but not bound to the recursive dispatch reread, allowing replacement bytes to become the recorded and acknowledged packet. | Carry the writer SHA as internal-only dispatch metadata and compare it immediately after the dispatch path rereads the packet, before record creation, spine append, or delivery. | rev-0003 required fix; fix-0003 |
