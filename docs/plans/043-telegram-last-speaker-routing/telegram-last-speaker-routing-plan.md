# Telegram Last-Speaker Routing
**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-07-12
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context

Incorporates `research-dossier.md` and rulings R1-R6. Current routing is Telegram reply-to tag, then first-token full/partial name match, then an inbound-only sticky target. The outbound forwarder is the authoritative place to observe which agent actually spoke in the chat.

### Summary

Bare Telegram text and captionless media must route to the last agent whose bubble successfully appeared in that chat. Telegram reply-to and explicit full/partial name matching keep their current higher precedence. Explicitly addressing silent agent B does not replace prior speaker A as the bare-message fallback; B becomes last speaker only after B successfully sends a Telegram bubble, threaded or unthreaded.

### Goals

- Route bare text to the last agent that successfully spoke in the same Telegram chat.
- Apply the same fallback to captionless photos, GIFs, and files.
- Count threaded agent replies as speech exactly like unthreaded replies.
- Preserve reply-to and explicit full/partial name matching behavior and precedence.
- Keep `/tail` attached to the most recently selected or routed recipient without using that selection as the bare-message fallback.
- Fail honestly when no last speaker is known or the recorded speaker is no longer registered.
- Prove the behavior offline with pure, bot-wiring, forwarder, and production-composition tests.

### Non-Goals

- Persist last-speaker state across bridge/daemon restarts.
- Change the partial-name grammar, memorable-id forms, or recency tie-break in `match.ts`.
- Change Telegram reply threading, sender tags, media limits, allowlist security, or the pij messaging wire.
- Add multiple outbound Telegram chats or operators.
- Require a live Telegram API round-trip for deterministic acceptance.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|--------------|----------------------|
| `pij-control-plane` | existing | **modify** | Own Telegram routing, bot/forwarder composition, commands, tests, and operator docs. |
| `pij-messaging` | existing | **consume** | Reuse `SessionId`, registry snapshots, `DeliveredMessage.from`, and `FsChannel`; no contract change. |
| `extension-authoring-harness` | existing | **consume** | Provide Vitest, typecheck, lint, smoke, and the final `harness checks` gate. |

### Testing Strategy

- **Approach**: Hybrid.
- **Rationale**: The precedence/state transitions are pure and require TDD; grammY/fs composition is best proven by the existing lightweight offline integration seams.
- **Focus Areas**: reply/name/fallback precedence; strict silent-address behavior; successful-vs-failed speech observation; threaded text; media; receipt exclusion; per-chat key normalization; `/tail` selection; missing speaker.
- **Excluded**: live Telegram network calls and manual phone acceptance.
- **Mock Usage**: Targeted mocks only at the Telegram Bot API boundary; use real `FsChannel`, temp directories, and existing descriptors elsewhere.

### Documentation Strategy

- **Location**: Hybrid.
- **Rationale**: `README.md` must stop promising sticky default routing; `docs/how/pij-telegram.md` must carry the exact precedence, examples, media rule, and restart boundary.

### Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=1, D=1, N=0, F=0, T=1 (sum 4)
- **Confidence**: 0.94
- **Assumptions**: One configured outbound `TELEGRAM_CHAT_ID`; state remains process-local; current sender-tag and reply-threading contracts remain stable.
- **Dependencies**: Existing grammY, `FsChannel`, registry, and harness only; no new package.
- **Risks**: State conflation, send-success timing, string/number chat-key mismatch, stale registered speaker, and restart loss.
- **Phases**: 1.

### Acceptance Criteria

1. **AC-01 Reply-to precedence**: A Telegram reply to `[pij-B]` routes the whole inbound text/media to B even when the first word matches A and the recorded last speaker is C.
2. **AC-02 Explicit-name precedence**: A full or partial session-name token routes to its deterministic `resolveTarget` match even when another agent spoke last; memorable adjective-animal matching remains unchanged.
3. **AC-03 Bare text fallback**: A bare text message routes in full to the most recent agent whose non-receipt outbound message produced at least one successful Telegram API send in that chat.
4. **AC-04 Captionless media fallback**: Captionless inbound photo/GIF/file routes to the same last speaker; no speaker means guidance and no download.
5. **AC-05 Threaded speech**: An agent bubble sent with `reply_parameters` quoting Jordan's message updates last-speaker state exactly like an unthreaded bubble.
6. **AC-06 Strict last-spoke**: If A spoke last, Jordan explicitly addresses silent B, then sends a bare message before B replies, the bare message still routes to A. B becomes fallback only after B successfully speaks.
7. **AC-07 Honest speech observation**: Receipts and delivered messages whose every Telegram send fails do not update last-speaker state; the first successful text/media/fallback-notice send does, even after an earlier part failed.
8. **AC-08 Per-chat isolation**: The configured string chat id and inbound numeric chat id normalize to the same key; a different chat has no inherited last speaker.
9. **AC-09 Missing speaker**: If the recorded last speaker is absent from the current registry snapshot, the bridge returns an honest gone/no-speaker response and does not silently use the selected target.
10. **AC-10 `/tail` selection**: Explicit address/reply selects that recipient for `/tail`; a later bare fallback delivery selects its actual recipient for `/tail` without changing the strict last-speaker rule.
11. **AC-11 Restart boundary**: After bridge restart, no speaker is assumed until a new outbound bubble succeeds; a bare message receives guidance rather than using stale or inferred history.
12. **AC-12 Documentation**: README and the Telegram guide describe reply-to > name match > last-speaker precedence, captionless media, threaded speech, strict silent-address behavior, and process-local state.

### Risks & Assumptions

- A Telegram bubble counts as speech only after an awaited API call resolves successfully.
- The last-speaker callback fires once per delivered message, on its first successful bubble; later chunks from the same serialized message cannot reorder speakers.
- A registered-but-dead descriptor retains existing registry semantics; this plan adds no process-liveness rule to explicit matching.
- Optional live phone proof would require the shared `daemon-restart` baton, but deterministic acceptance does not.

### Open Questions

None.

### Workshop Opportunities

None. R3-R6 resolve the state, media, threading, and strict-fallback decisions.

### Clarifications

#### Session 2026-07-12

- **Workflow Mode**: Simple.
- **Testing Strategy**: Hybrid.
- **Mock Usage**: Targeted Telegram API mocks.
- **Documentation**: Hybrid (`README.md` + `docs/how/pij-telegram.md`).
- **Media scope**: Captionless inbound media uses last-speaker fallback.
- **Speech definition**: Threaded and unthreaded agent bubbles both count after successful forwarding.
- **Strict fallback**: Explicitly addressing silent B does not replace prior speaker A.

## Planning Seam
_Refinement opportunities still open - recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none - all resolved.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| `research-dossier.md` | yes | Supplies current execution path, history, state split, hazards, and proof seams. |
| `workshops/*.md` | no | Rulings R3-R6 directly settle the material design questions. |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Builder defaults and all material routing decisions are recorded in R3-R6. |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`. |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md`; existing domain boundaries are preserved. |
| G4 | ADR Compliance | N/A | No accepted ADRs under `docs/adr/`. |
| G5 | Structure | PASS | Both halves, task table, measurable ACs, findings, manifest, coverage, and risks are present. |
| G6 | Testing Alignment | PASS | TDD regressions precede implementation; offline wiring and full harness gates follow. |
| G7 | Domain Completeness | PASS | All target domains exist; every task file is mapped; no new domain or dependency is introduced. |

### Summary

Introduce a process-local per-chat last-speaker map in `startBridge`, injected into the inbound bot and outbound forwarder beside the existing reply-threading map. Keep a separate selected-target map for `/tail`; use only last-speaker state for otherwise bare routing. Update that state on the first successful non-receipt Telegram send, then revise tests and operator documentation around the new precedence.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/telegram/bridge.ts` | `pij-control-plane` | internal | Pure routing decision, selected-target state, and outbound speech callback. |
| `.pi/extensions/pij/telegram/bridge.test.ts` | `pij-control-plane` | internal | Precedence, state, text/media, failure, threading, and command regressions. |
| `.pi/extensions/pij/telegram/index.ts` | `pij-control-plane` | internal | Own and inject normalized per-chat last-speaker state. |
| `.pi/extensions/pij/telegram/index.test.ts` | `pij-control-plane` | internal | Prove the production bot/forwarder shared-state seam with real fs adapters. |
| `.pi/extensions/pij/telegram/commands.ts` | `pij-control-plane` | internal | Rename the `/tail` accessor from sticky to selected-target semantics. |
| `README.md` | `pij-control-plane` | cross-domain | Repo front-door summary of Telegram routing behavior. |
| `docs/how/pij-telegram.md` | `pij-control-plane` | internal | Authoritative operator routing/media/restart guide. |
| `docs/domains/pij-control-plane/domain.md` | `pij-control-plane` | contract | Record the changed Telegram conversation-state contract. |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Selected target and last speaker are intentionally different after R6; unifying them would preserve the bug. | Maintain separate maps and add the A-spoke/B-addressed/bare-to-A regression. |
| 02 | High | `startForwarder` is the only authoritative point where a successful Telegram bubble and its sender are both known. | Inject `onSpoke(from)` and fire it once on the first successful text/media send, never on receipt/all-fail. |
| 03 | High | Inbound `ctx.chat.id` is numeric while configured outbound `chatId` is a string. | Key last-speaker state by `String(chatId)` and prove the production seam. |
| 04 | High | `startBridge` already composes inbound/outbound state with the `pendingReply` map. | Mirror that dependency-injection pattern; do not add globals or persistence. |
| 05 | High | Threaded replies are ordinary forwarder sends plus `reply_parameters`. | Keep `onSpoke` independent of `replyTo`; R5 becomes a direct regression. |
| 06 | Medium | `/tail` still needs an operator-selected recipient even though selected target no longer drives bare fallback. | Rename sticky terminology to selected target and update it after every successful inbound routing decision. |
| 07 | Medium | s040 memorable ids extend existing partial matching but require no matcher change. | Leave `match.ts` untouched; preserve `match.test.ts` and add bridge-level precedence coverage only. |

### Implementation

**Objective**: Route bare Telegram text and captionless media to the strict last speaker while preserving explicit routing, `/tail`, reply threading, and existing security/wire contracts.
**Testing Approach**: Hybrid - TDD for pure/forwarder behavior, lightweight offline production composition, then repository gates.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Add RED regressions for reply/name/last-speaker precedence, strict silent-address behavior, captionless media, threaded speech, partial/all send failures, receipts, chat-key isolation, missing speaker, `/tail`, and restart-unknown behavior. | `pij-control-plane` | `.pi/extensions/pij/telegram/bridge.test.ts`, `.pi/extensions/pij/telegram/index.test.ts` | Targeted tests fail only because last-speaker state/callbacks are not implemented; watcher cases retain explicit bounded timeouts. | AC-01 through AC-11; Findings 01-06. |
| [ ] | T002 | Implement separate selected-target and per-chat last-speaker seams: rename routing/command terminology, inject `getLastSpeaker` and `onSpoke`, normalize chat keys, update on first successful non-receipt send, preserve reply/name precedence, and return honest guidance/gone behavior. | `pij-control-plane` | `.pi/extensions/pij/telegram/bridge.ts`, `.pi/extensions/pij/telegram/index.ts`, `.pi/extensions/pij/telegram/commands.ts` | T001 is GREEN; `match.ts`, reply threading, sender tags, allowlist, media limits, and pij wire behavior remain unchanged. | Persist side effects through injected closures only; no global mutable state. |
| [ ] | T003 | Update operator and domain documentation for the new precedence, examples, captionless media, threaded speech, strict silent-address rule, `/tail` selection, and restart boundary. | `pij-control-plane` | `README.md`, `docs/how/pij-telegram.md`, `docs/domains/pij-control-plane/domain.md` | All three docs agree with AC-01 through AC-12 and no longer promise sticky bare-message routing. | R3-R6. |
| [ ] | T004 | Run targeted Telegram tests, typecheck/lint/test through existing recipes, and the full `harness checks` signal inventory; inspect the load-bearing diff against the granted fence. | `extension-authoring-harness` | N/A - existing commands only | All deterministic gates pass; any optional live phone proof is separately baton-granted and not required for acceptance. | No new tooling; no daemon restart for deterministic proof. |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T001, T002 | Pure + bot reply precedence tests. |
| AC-02 | T001, T002 | Explicit memorable partial-name precedence tests; existing matcher suite remains green. |
| AC-03 | T001, T002 | Outbound A then bare text -> A, then outbound B -> bare text -> B. |
| AC-04 | T001, T002 | Captionless media targets last speaker; unknown speaker prevents download. |
| AC-05 | T001, T002 | Forwarded message with pending `replyTo` invokes speech update. |
| AC-06 | T001, T002 | A spoke, B explicitly selected but silent, bare -> A. |
| AC-07 | T001, T002 | Receipt/all-fail/partial-success forwarder cases. |
| AC-08 | T001, T002 | `startBridge` production wiring test with string config id and numeric update id. |
| AC-09 | T001, T002 | Missing recorded speaker returns honest response with no delivery/download. |
| AC-10 | T001, T002 | `/tail` selection before and after last-speaker fallback delivery. |
| AC-11 | T001, T002, T003 | Fresh bridge has no assumed speaker; docs state process-local boundary. |
| AC-12 | T003 | README/how/domain text review plus final diff inspection. |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Selected target accidentally remains the fallback | Medium | High | Separate names/types and the strict A/B regression before implementation. |
| Speaker recorded before Telegram success | Medium | High | Callback only after awaited success; all-fail and partial-success tests. |
| String/number chat ids never meet | Medium | High | String-normalized map keys plus `startBridge` integration coverage. |
| Multi-part send updates too late | Low | Medium | Fire once immediately after the first successful part, not after the whole queue tick. |
| Recorded speaker disappears | Low | Medium | Check the current registry snapshot; honest no-target response, never selected-target fallback. |
| Restart loses context | Medium | Low | Preserve existing process-local boundary and document guidance until a new speaker appears. |
| Live bridge validation interrupts shared peers | Low | High | Offline acceptance by default; optional live proof requires `daemon-restart` baton. |
