# Validation — day3-codex-doctrine-plan.md v1.1.0

- **Validated**: 2026-08-27T08:41:11Z
- **Target**: `docs/plans/392-day3-codex-doctrine/day3-codex-doctrine-plan.md`
- **Verdict**: **NEEDS ATTENTION** — frozen v1.1.0 SHA-256 `1647778cc070a648a44e11f00e015780283a0fb28a7a4fb0fd3915f594b3b3fa`
- **Contract sources**: `reports/validate-v2-plan.md`; authoritative `rulings.md`; `deferred-codex-phase.md`; `tasks/phase-1-telegram-sqlite-forwarder/tasks.md`; current cited source files
- **Checks**: frozen hash verified before and after review; findings 4-5 traced through Goals, AC-01/03/04/07, Phase 1 tasks 1.3/1.4/1.7, Risks, and T003/T004/T007; Phase 4, Domain Manifest, and Acceptance Coverage Map checked for deferred-Codex dependencies; active file:line anchors resolved against current source
- **Thesis / proof**: The at-least-once design and production-closure test are present, but the Phase 1 execution contract is not yet internally safe or accurately mapped.
- **Consumers**: Phase 1 implementation is blocked by one contradictory instruction; Codex is cleanly deferred and Phase 4 depends only on Phase 1.

## Findings

| Severity | Finding | Evidence | Impact | Smallest fix |
|---|---|---|---|---|
| HIGH | Finding 4 is not consistently resolved in the execution dossier or coverage map. | T004 first requires the sqlite `onMessage` handler to throw `ForwardIncomplete` when `undeliveredText > 0`, then its Notes say "the handler does not throw for them" (`tasks/phase-1-telegram-sqlite-forwarder/tasks.md:83`). AC-04 requires the production closure (`day3-codex-doctrine-plan.md:76`), and tasks 1.3/1.4 provide it (`:196-197`), but the coverage map assigns AC-04 only to 1.1/1.2 and `queue-consumer.test.ts` (`:244`). | An implementer can follow the no-throw note, or a reviewer can accept only the synthetic consumer proof, recreating the lost-message/false-ack defect from the cold verdict. | Change the T004 note to say `sendText` catches and counts failures while the sqlite `onMessage` handler throws; keep fs log-and-continue. Map AC-04 to 1.1-1.4 and name both the production `bridge.test.ts` rejection proof and lease-recovery proof. |
| MEDIUM | Finding 5 still has an active exactly-once promise in the Phase Index. | The plan rejects true exactly-once and defines at-least-once delivery (`day3-codex-doctrine-plan.md:28,38,86,186`), but the Phase 1 objective still says the bridge consumes the queue "exactly-once" (`:179`). | The one-line phase contract contradicts the detailed design and can revive the unprovable acceptance promise during dispatch or review. | Replace the Phase Index objective with the established contract: at-least-once, ack only after successful send, with bounded duplicate windows. |
| MEDIUM | Several cited line anchors are stale. | Full-body socket delivery is now `core/daemon/loop.ts:624-626`, not `:531`; `recoverStaleClaims` starts at `adapters/sqlite-queue.ts:397`, not `:390`; the daemon reset call is `daemon.ts:1545`, not `:1542`. In the dossier, the relevant receipt test is `core/cli.test.ts:1191`, not near `:785`; `DeliveryPort`/`InboxPort` declarations span `core/ports.ts:143-153`, not `:151-153`; `recoverStaleClaims` falls outside the cited `sqlite-queue.ts:250-395` range; and `consumeInbox` starts at `core/inbox.ts:207`, not `:208`. | Implementers lose time or inspect the wrong code, and the plan's source-match proof is overstated. | Refresh those anchors mechanically; the other checked active anchors still resolve. |

## Deferred Codex boundary

No dangling active Codex dependency was found: Phase 4 depends on Phase 1 only (`day3-codex-doctrine-plan.md:226`), the manifest carries only the deferred brief rather than Codex production files (`:158`), and AC-09 is explicitly deferred (`:249`). Codex production behavior was not re-proven, per the ruling.
