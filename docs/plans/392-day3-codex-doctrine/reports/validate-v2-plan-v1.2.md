# Validation — day3-codex-doctrine-plan.md v1.2.0

- **Validated**: 2026-08-27
- **Target**: `docs/plans/392-day3-codex-doctrine/day3-codex-doctrine-plan.md` at frozen SHA-256 `f3934168b3fc1dd4bae30ed18e6281242c92604b4e25f6a0cde7d0953d0152dd`
- **Companion dossier**: `tasks/phase-1-telegram-sqlite-forwarder/tasks.md` at frozen SHA-256 `a88705ea437e3de92a73ef561cf3ca75be030722a58ee952d905fd04f6d10e37`
- **Verdict**: **NEEDS ATTENTION** — 0 critical, 0 high, 1 medium
- **Contract sources**: `reports/validate-v2-plan.md`; `reports/validate-v2-plan-v1.1.md`; frozen plan and Phase 1 dossier
- **Checks**: narrow third pass only — T004 throw semantics, AC-04 production-path coverage, active exactly-once promises, and the seven refreshed source anchors; Codex was not re-proven
- **Thesis / proof**: The semantic regressions are closed, but the source-match claim is not fully true because one active copy of the socket-delivery anchor still points at the old line.
- **Consumers**: Phase 1's execution semantics are coherent; one mechanical anchor correction remains before the plan's READY evidence is accurate.

## Finding

| Severity | Finding | Evidence | Impact | Smallest fix |
|---|---|---|---|---|
| MEDIUM | One of the seven refreshed anchors remains stale in the active Key Findings table. | `day3-codex-doctrine-plan.md:171` still says full-body socket delivery is at `loop.ts:531`. Current `core/daemon/loop.ts:531` is only the `DrainedTmuxMessage.via` type declaration; the production `sendSocket` call is at `:624` and the confirmed `via: "socket"` record is at `:626`. The plan's Research Context already has the corrected `core/daemon/loop.ts:626` anchor at line 22, so this is a stale duplicate rather than a design gap. | An implementer following Key Findings lands on the wrong code, and v1.2.0's claim that all seven anchors were refreshed is overstated. | Change the Key Findings citation from `loop.ts:531` to `core/daemon/loop.ts:624-626` (or the precise `:626` evidence anchor). |

## Narrow check results

- **T004 / AC-04 semantics**: PASS — T004's task body and Notes both require the sqlite `onMessage` handler to throw `ForwardIncomplete` when `undeliveredText > 0`; fs remains log-and-continue.
- **AC-04 coverage**: PASS — the coverage map names both the production `bridge.test.ts` rejecting-`deps.send` proof and `recoverStaleClaims` lease recovery on that production path.
- **Exactly-once wording**: PASS — no active end-to-end exactly-once promise remains. The affirmative "ack exactly once" in task 1.1 is a bounded normal-path state-transition assertion, not a crash/restart Telegram-delivery guarantee; Non-Goals and finding 08 explicitly reject true exactly-once delivery.
- **Refreshed anchors**: 6/7 fully clean. `recoverStaleClaims` `:397`, `resetClaimsOnStart` `daemon.ts:1545`, receipt tests `core/cli.test.ts:1191`, `DeliveryPort`/`InboxPort` `core/ports.ts:143-153`, the expanded sqlite range `:250-420`, and `consumeInbox` `core/inbox.ts:207` resolve. The socket-delivery anchor has the stale duplicate described above.
