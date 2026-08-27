Verdict: FIX_REQUIRED

## D1 — Standalone-ness

| # | severity | spec §/line | evidence (file:line or quote) | what to change |
|---|---|---|---|---|
| 1 | high | §6.2 line 281 | Quote: `(... plan 392 Phase 4)` uses a plan/phase identity inside the test name. | Cite `EXT/core/daemon/loop.test.ts:1405-1513` and the four descriptive case names without carrying the plan/phase suffix into the handoff. |
| 2 | medium | §7.3 line 386 | Quote: `Live proof L2 in report §11` requires the reader to know which report and what `L2` means. | Name the full report path and describe the observation without the item label. |
| 3 | medium | §9.1 line 456 | `bind-degraded`, `pre-bind`, and `daemon-owned target` are used as classification terms but are absent from §0 and §17; the cited range starts at `classifySendReceipt`, not the definitions behind `classifyBindHealth`. | Define the terms and cite the source that computes them, or replace them with their explicit lifecycle/timing predicates. |
| 4 | low | §14 line 603 | Quote: `(+WPI)` is undefined project shorthand. | Remove the tag or expand it at first use. |
| 5 | medium | §14 line 605 | Quote: `The review's test list §10` has no source path, and `every merge to date was ruled on ...` carries process/governance history that is unnecessary to operate the subsystem. | Cite the exact report path for the test matrix and state only the actionable fact: no CI workflow currently runs it. |
| 6 | low | §15 line 628 | Quote: `House practice` is organisation-relative language in an otherwise standalone handoff. | State the concrete repository commands and mutation-review procedure directly, without attributing them to a house/team. |

## D2 — Factual anchors on `ed20a68`

| # | severity | spec §/line | evidence (file:line or quote) | what to change |
|---|---|---|---|---|
| 1 | high | §2 line 58; §4 lines 148-165, 192-194; §7.3 line 386; §14 line 603; glossary line 649 | `EXT/daemon.ts:1172-1174,1239-1244` lists queued rows and calls `settle(...,"injected")` without `claim()`. Only `claim()` increments `attempt` (`EXT/adapters/sqlite-queue.ts:359-378`); `settle()` preserves the existing attempt (`:385-403`), and recovery parks only when that value is already `>= 6` (`:427-443`). A daemon pointer row therefore remains at attempt 0 across re-announcements and does not park after six pointer sends. | Correct the ownership statement and state diagram, remove `attempt+1`/nine-minute parking claims for pointer delivery, and explicitly distinguish consumer claims from daemon pointer settlement. If six-pointer parking is intended, the implementation needs a counter transition before the prose can claim it. |
| 2 | medium | §5 line 216 | The claim that `openChannel` is the only production constructor is contradicted by `EXT/cli.ts:595,609` (`runQueueMigrate` directly constructs `FsChannel` and `SqliteQueue`) and `EXT/adapters/channel-factory.ts:123` (`migrateFsInboxes` directly constructs `FsChannel`). | Scope the rule to normal live channel selection and list the intentional migration/operator exceptions. |
| 3 | medium | §13 G3 line 537 | `EXT/daemon.ts:1628` uses `instanceof SqliteQueue` to choose the receiver of `resetClaimsOnStart()`; only `:1629` chooses the log label. The two reset branches are behaviorally equivalent today, but the statement `only chooses a log label` is not what the cited source says. | Say that the remaining behavioral use is redundant/equivalent and the second use selects the label, or simplify the source first. |
| 4 | medium | §13 G10 line 551; Appendix A line 696 | `EXT/adapters/spine-store.ts:10,78` anchors only `spine/events.lock`. `spine/write.lock` is defined by `EXT/adapters/platform-write-lock.ts:3,44`. | Add the missing `platform-write-lock.ts` citation and source-index row. |
| 5 | high | §7.1 lines 333-337 | `EXT/adapters/claude-socket.ts:152-159` writes the frame, then lets a later socket error return `failed`; `:159` returns `confirmed` after a 150 ms timer unless a negative drop report arrives. There is no positive acceptance ACK. Thus `failed` is not always proof that nothing landed, and `confirmed` is local write completion plus absence of a timely negative report, not proven receiver acceptance. | Describe the negative-ack window precisely and document the possible duplicate if bytes land but an error wins before confirmation. |
| 6 | high | §7.2 line 361 | `EXT/adapters/copilot-rpc.ts:66-75` writes the request before the response timeout/error paths. The server can enqueue the prompt and lose/refuse the response, after which pij returns `failed` and retries. `retry-safe` is therefore not guaranteed. | Document the lost-response duplicate window and whether Copilot offers an idempotency key; do not equate timeout with “nothing landed.” |
| 7 | medium | §1 line 30; §12 line 522 | The universal claims that an endpoint-less seat gets a pointer and that a Claude/Copilot body is never typed conflict with the shipped fs escape hatch. `EXT/daemon.ts:1172-1222` enables pointers only when `sqliteOf(channel)` exists; `EXT/core/daemon/loop.ts:680-723` otherwise falls through to body typing. The spec itself acknowledges this at §7.3 and G7. | Qualify both headline/doctrine statements with `sqlite`/`dual`, and name `PIJ_QUEUE_BACKEND=fs` as the compatibility exception at first use. |

## D3 — Completeness against the required coverage

| # | severity | spec §/line | evidence (file:line or quote) | what to change |
|---|---|---|---|---|
| 1 | high | §7.1 lines 333-337; §7.2 line 361; §8 lines 440-443; §13 G4 | The duplicate-window discussion covers consumer send-then-ack windows W1/W2 only. The direct Claude and Copilot transports also retry after outcomes that can occur after request bytes were written (`claude-socket.ts:152-159`; `copilot-rpc.ts:66-75`). | Add transport-specific at-least-once ambiguity windows, their bounds, and any receiver dedupe behavior. This is required operational knowledge for retry and incident analysis. |
| 2 | medium | §15 line 628 | The handoff gives raw `npx` commands, but the repository's canonical gates are `just typecheck`, `just test [selector]`, and the done/ship gate `harness checks` (`justfile:74-84,166-175`; `AGENTS.md:158-169`). | Give the canonical targeted and full-gate commands so a zero-context engineer does not bypass the harness contract. |

## Anchor tally

Anchors checked: 64 across §3, §4, §6, §7, §9, §13, Appendix A, and the benchmark source. Failed citation/semantic anchors: 7. The MERGE benchmark values matched `reports/pij-comms-review-2026-08-27/benchmarks.md`.
