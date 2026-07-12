# Research Dossier: Telegram bare-message last-speaker routing

**Generated**: 2026-07-12T15:01:45+10:00
**Query**: "How should GitHub issue #8 change Telegram bare-message routing to target the last agent that spoke while preserving reply-to and explicit name matching?"
**Effort**: Standard
**Tools**: Mixed
**Evidence**: 10 current sources · 4 historical sources

## Answer

`routeMessage` currently resolves reply-to tags first, then the first-word name matcher, then an inbound-only per-chat sticky target. The forwarder already sees the authoritative speaker id (`DeliveredMessage.from`) and serializes outbound Telegram sends, but it does not publish that fact back to inbound routing.

The smallest complete design is to keep explicit/current-target state for `/tail`, add an injected per-chat last-speaker state owned by `startBridge`, update it only after a non-receipt bubble is successfully sent to Telegram, and pass it to `routeMessage` as the bare-message fallback. Reply-to and `resolveTarget` remain ahead of the fallback and need no matcher changes.

R6 makes the state split intentional: explicitly selecting a silent agent does not replace the prior speaker as fallback. The selected target may still serve `/tail`; once a bare message is delivered to the prior speaker, that routed recipient becomes the selected target for subsequent `/tail`.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | Current precedence is tagged Telegram reply → first-token `resolveTarget` → sticky fallback → guidance. | `.pi/extensions/pij/telegram/bridge.ts:131-180` | Replace only the third decision input; preserve the first two branches byte-for-behaviour. | High |
| F-02 | The sticky map is private to `createBot`, keyed per inbound chat, and is updated by addressed text/replies/media rather than by outbound speech. | `.pi/extensions/pij/telegram/bridge.ts:280-354`, `.pi/extensions/pij/telegram/bridge.ts:362-425` | Last-speaker state must be a separate injected seam; reusing this map would preserve the bug. | High |
| F-03 | `/tail` reads the same sticky map and therefore has a distinct "current selected target" contract. | `.pi/extensions/pij/telegram/bridge.ts:302-311`, `.pi/extensions/pij/telegram/commands.ts:157-184`, `.pi/extensions/pij/telegram/bridge.test.ts:644-671` | Keep selected-target state for `/tail`; do not silently redefine the command around outbound speech. | High |
| F-04 | `startForwarder` is the authoritative observation point for speech: it skips receipts, tags every text/media bubble with `dm.from`, and serializes all sends through one queue. | `.pi/extensions/pij/telegram/bridge.ts:468-560` | Add an injected success callback here; queue order gives deterministic "last spoke" ordering. | High |
| F-05 | Individual send failures are caught and logged; the existing final "forwarded" log is not proof that any bubble reached Telegram. | `.pi/extensions/pij/telegram/bridge.ts:511-557` | Update last-speaker state on the first successful `send`/`sendMedia`, not merely when a delivered message is dequeued. | High |
| F-06 | `startBridge` already owns a shared injected map between inbound bot and outbound forwarder for reply threading. | `.pi/extensions/pij/telegram/index.ts:116-193` | Mirror the proven `pendingReply` composition pattern with a per-chat last-speaker map; no global mutable state or new dependency. | High |
| F-07 | Pure routing, fake grammY updates, real fs forwarder tests, and production `startBridge` wiring tests already exist without network access. | `.pi/extensions/pij/telegram/bridge.test.ts:57-172`, `.pi/extensions/pij/telegram/bridge.test.ts:322-570`, `.pi/extensions/pij/telegram/bridge.test.ts:683-778`, `.pi/extensions/pij/telegram/index.test.ts:146-178` | TDD can prove precedence, speech-success semantics, and the production shared-state seam deterministically. | High |
| F-08 | Captionless inbound media currently uses the same sticky fallback as bare text. | `.pi/extensions/pij/telegram/bridge.ts:356-425`, `.pi/extensions/pij/telegram/bridge.test.ts:803-828`, `docs/how/pij-telegram.md:145-153` | R3 applies last-speaker fallback uniformly to bare text and captionless media. | High |
| F-09 | Operator docs and README explicitly promise sticky default routing. | `docs/how/pij-telegram.md:53-81`, `README.md:143-169` | Both front doors must be updated with the new precedence and examples. | High |
| F-10 | The implementation sits in `pij-control-plane` and consumes existing `pij-messaging` ids/channel contracts unchanged. | `docs/plans/026-pij-telegram-bridge/pij-telegram-bridge-plan.md:34-41`, `docs/domains/pij-control-plane/domain.md:106-107` | No new domain or messaging-core contract is needed; record the behavior change in the control-plane domain history. | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | Plan 026 deliberately chose per-chat sticky fallback and documented the first-token collision risk. | `docs/plans/026-pij-telegram-bridge/pij-telegram-bridge-plan.md:64-85`, `docs/plans/026-pij-telegram-bridge/pij-telegram-bridge-plan.md:195-223` | Direct, superseded only for the fallback rule | Preserve allowlist, explicit matching, per-chat scope, `/tail`, and test architecture while replacing AC-03. |
| H-02 | Swipe-reply routing was phone-verified and intentionally outranks address tokens and sticky state, including honest handling of a gone tagged sender. | Commit `910376b`; `.pi/extensions/pij/telegram/bridge.test.ts:127-172` | Direct | Keep reply-tag precedence and gone-target behavior as regression requirements. |
| H-03 | Reply threading introduced a shared map in `startBridge` with callbacks injected into `createBot` and `startForwarder`. | Commit `b627ee5`; `.pi/extensions/pij/telegram/index.ts:128-176` | Direct | Reuse this composition style rather than exposing module globals or coupling the bot to fs state. |
| H-04 | Plan 040 added adjective-animal primary ids and regression coverage for partial matching of multi-hyphen names. | Commit `18b7421`; `.pi/extensions/pij/telegram/match.test.ts:46-57`; `docs/plans/043-telegram-last-speaker-routing/rulings.md#r1--planning-authorization-and-routing-precedence` | Direct | `match.ts` remains unchanged, but stale last-addressed fallback is now more visible in multi-agent phone conversations. |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| Partial or failed outbound sends | F-05 | Marking a sender before Telegram accepts a bubble would claim speech that never appeared in chat. | Define "spoke" as the first successful Telegram API send for a non-receipt delivered message, threaded or unthreaded; test all-failed and successful text/media paths. |
| Last speaker is no longer live | F-01, H-02 | Blind delivery to a vanished id would recreate the misrouting class the reply path already avoids. | Validate the fallback id against the live session snapshot and return an honest gone notice rather than silently using another target. |
| Bridge restart | F-02, H-01 | In-memory state is lost on restart, so no last speaker is known until the next outbound bubble. | Preserve the existing process-run persistence boundary and document guidance-on-unknown; durable Telegram history inference is out of scope. |

## Domain Impact

| Domain / boundary | Relationship | Contract or constraint | Evidence |
|-------------------|--------------|------------------------|----------|
| `pij-control-plane` | modify | Telegram bridge routing and bot/forwarder composition; injected mutable state only. | F-02, F-04, F-06, F-10 |
| `pij-messaging` | consume unchanged | `SessionId`, `DeliveredMessage.from`, `FsChannel.watch`, and registry snapshots remain existing contracts. | F-04, F-10 |
| Telegram API | external boundary | A sender becomes last speaker only after at least one successful chat API call. | F-05 |

## Planning Handoff

- **Preserve**: allowlist-first middleware; reply-to precedence and gone notice; first-token full/partial matching and deterministic tie-break; sender tags; reply threading; serialized text/media forwarding; `/tail` selected-target behavior; process-run in-memory scope. A threaded agent reply still updates last-speaker state.
- **Change carefully**: split selected-target state from last-speaker fallback; update speaker state only on successful non-receipt forwarding; use string chat keys so configured `chatId` and inbound numeric ids meet without precision-changing conversion.
- **Prove explicitly**: address silent B after A spoke, then send a bare message — it must still route to A until B successfully emits a Telegram bubble.
- **Likely files/symbols**: `telegram/bridge.ts` (`BridgeDeps`, `Routing`, `routeMessage`, `createBot`, `ForwarderDeps`, `startForwarder`), `telegram/index.ts` (`startBridge`), their sibling tests, `README.md`, `docs/how/pij-telegram.md`, `docs/domains/pij-control-plane/domain.md`.
- **Decisions still required**: none from research; Builder workflow/testing/mock/documentation choices remain the plan-stage inputs.
