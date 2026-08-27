# Day 3 — Telegram on the durable queue, pi receiver, Codex remote, pointer doctrine
**Mode**: Full
**Plan Version**: 1.3.0 — v1.2.0→1.3.0: last stale anchor (`loop.ts:531`→`:626`, validate-v2-plan-v1.2.md); v1.1.0 applied cold validate-v2 findings 4–5 (`reports/validate-v2-plan.md`; 1–3 deferred with Codex per Vaughan's ruling); v1.2.0 applied the narrow re-validation (`reports/validate-v2-plan-v1.1.md`: T004 note, AC-04 coverage, wording, anchors)
**Created**: 2026-08-27
**Status**: READY
**Spec source**: unified (this file)

**Stream**: s392-day3-codex-doctrine · **Seat**: pij-falling-outside (pm) · **o-prime**: pij-relative-panther · **Worktree**: `/Users/vaughanknight/GitHub/pij-worktrees/s392-day3-codex-doctrine` · **Branch**: `s392/day3-codex-doctrine` from `main@2953d75` · **Brief**: `government/briefs/s392-day3-codex-doctrine.md` (sha e4d617d6…6afa5) · **Rulings**: `rulings.md` (this folder) · **Thesis**: `thesis.md`

---

## Business Specification

📚 Incorporates findings from `reports/preamble-checkpoint.md` (this folder — the read-only source survey; no separate `research-dossier.md`) and `/Users/vaughanknight/.pij/pij-primitive-toucan/day3-implementer-notes.md` (sha 7fe92b57…9a60).

### Research Context
- The sqlite merge (`f14915b`, default backend `sqlite` in `adapters/channel-factory.ts:41`) moved every sender onto `SqliteQueue`; **no fs inbox file is written any more**. Two consumers still read only fs files via `FsChannel.watch`: the Telegram bridge (`telegram/index.ts:316` → `telegram/bridge.ts:649`) and the pi in-process receiver (`index.ts:314,377`). Both are dark under the default.
- Live evidence (read-only `sqlite3 ~/.pij/queue/pij.sqlite`): `pij-telegram` has 120 `failed` rows (retired by the o-prime 07:20Z), seq **149** `queued` (already delivered via fs pre-cutover — ruling: retire) and seq **290** `queued` (ruling: forward once).
- The sender's receipt lies for pull seats: `core/cli.ts:2225` `classifySendReceipt` tests raw `descriptor.deliveryMode === "pull"`; the `pij-telegram` descriptor has `deliveryMode:null, paneId:null, harness:"pi"` so it falls through to `delivered`. `effectiveDeliveryMode` (`core/cli.ts:2270`) already resolves it to `pull`. Same raw read at `core/cli.ts:693` (`daemonReceiptAuthoritative`).
- Queue API already sufficient for a consumer: `claim` (lease + attempt), `claimUnread` (ack), `settle`, `listQueued`, `recoverStaleClaims` (daemon sweep, all seats). `failed` is excluded from every list by construction (`adapters/sqlite-queue.ts:250-270`).
- Codex frame builders exist and are unit-proven (`adapters/codex-rpc.ts`: `buildCodexDelivery`, `encodeCodexRequest`) but are not wired into `adapters/daemon-tmux.ts sendSocket` nor `core/spawn.ts` (`codex` branch at :453). Codex CLI 0.148.0 runs but is **401 unauthenticated** — `codex login` is Vaughan's.
- Socket/RPC delivery already sends the full body (`core/daemon/loop.ts:626 via:"socket"`); the pointer line (`loop.ts:582-653`) is the socketless path. Doctrine (`docs/how/pij.md`, skill C10 at `~/.claude/skills/pij/references/00-routing.md:193`, `government/doctrine/preconditions-travel-with-remedies.md`) still states the pointer rule globally.

### Summary
Three independently-landable corrections, one PR each, in this order: **(3b)** make the Telegram bridge consume the durable sqlite queue **at-least-once, acking only after a successful send**, and make `pij send` honest about pull seats; **(3c)** put the pi in-process receiver on the same queue consumer; **(7)** relax the pointer-delivery doctrine to the harnesses that can still clip, with a routing-invariant test that pins it. **(2) Codex is DEFERRED** (Vaughan, 2026-08-27: "ignore codex for now as im remote") — its phase and the validator's three Codex findings live in `deferred-codex-phase.md`.

### Goals
- Telegram forwards every message sent to `pij-telegram` under the sqlite default, **at-least-once**: a row is acked only after its Telegram send succeeded, the queue's delivery state is the only watermark, and duplicates are bounded to two named windows (§ Risks).
- `pij send pij-telegram` (and any pull seat) reports `queued (pull-inbox)`, never `delivered: peer was idle`.
- A pi peer's in-process receiver gets its inbox under the sqlite default with no behaviour change on fs.
- Doctrine, how-doc, and the live skill say: body on socket/RPC; pointer only where a pty can clip (claude-socket and copilot-RPC today; codex remains pointer-path until its phase resumes); a test names the invariant.

### Non-Goals
- Changing the pointer path or its composer-idle guard for socketless seats (`loop.ts:641`) — it stays.
- Any daemon restart, bridge restart, or live-queue write by this stream (batons: o-prime).
- A `pij queue retire` verb (day-3 item 1, not this stream) — row 149 is retired by the o-prime with a handed-over statement.
- Codex `app-server --remote` (item 2) — DEFERRED by ruling; see `deferred-codex-phase.md`.
- True exactly-once Telegram delivery (would need a Telegram idempotency key + a send/ack transaction that does not exist) — the contract is at-least-once with bounded duplicate windows.
- Retrying Telegram API failures via the queue (current fs parity: log and continue; a durable retry is a follow-up — open[]).
- `--skip-backlog` for the bridge (follow-up, ruling 2).
- Writing anything under `government/**` (the doctrine amendment is DRAFTED in this folder for the o-prime to fold in).

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| pij-messaging | existing | **modify** | New `adapters/queue-consumer.ts` (poll/claim/ack consumer over `SqliteQueue`); bridge + pi receiver adopt it; send-receipt honesty in `core/cli.ts` |
| pij-control-plane | existing | **modify** | routing-invariant test (`core/daemon/loop.test.ts`) and delivery-routing how-doc (`docs/how/pij.md`) — test/doc only; no transport code changes while Codex is deferred |
| pij-skill | existing | **modify** | C10 wire-discipline text in the LIVE skill (`skills/pij/references/00-routing.md`, gated by `just pij-skill-check`) |
| extension-authoring-harness | existing | **consume** | `harness checks`, `npx vitest run .pi/extensions/pij/`, `harness observe` (no changes) |

### Testing Strategy
- **Approach**: Full TDD with fakes (house practice — orient-local: `.test.ts` sibling per module, `adapters/fakes.ts`, mutation-gated review).
- **Rationale**: every change here is a delivery-semantics change (ack-only-after-success, watermark, receipt honesty, transport routing); the invariant must be named in a test before the code moves, and the cold reviewer needs a RED→GREEN mutation to check.
- **Focus areas**: ack-only-after-success and lease recovery under crash/restart; the production forwarder closure driven with a failing `send` (not only a synthetic throwing handler); boot backlog vs retired rows; fs-backend parity; receipt classification for pull descriptors; routing invariant socket-vs-pointer.
- **Excluded**: real Telegram API, the live daemon/bridge (live proofs are o-prime-run or isolated-server, recorded as evidence, not vitest).
- **Mock usage**: targeted — `adapters/fakes.ts`, temp `PIJ_HOME` + real `SqliteQueue` on a temp db (no sqlite mocking), fake `bot.api` as in `bridge.test.ts`. No network, no token, no live daemon in tests.

### Documentation Strategy
- **Location**: `docs/how/` — `docs/how/pij-telegram.md` (backend + restart semantics, 3b), `docs/how/pij.md` (delivery routing + pointer doctrine, 7), plus the skill C10 text (7). No README changes.
- **Rationale**: these are operating-guide facts (what arrives where, and why), which is what `docs/how/` holds; the brief names the files.

### Complexity
- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=2, D=1, N=0, F=1, T=1 → 6 (band CS-3)
- **Confidence**: 0.85
- **Assumptions**: the daemon's `recoverStaleClaims` sweep covers bridge/pi rows (it is unfiltered by recipient — verified `sqlite-queue.ts:397`); `just pij-skill-check` is the only gate on skill text; (Codex assumptions moved to `deferred-codex-phase.md`).
- **Dependencies**: bridge restart baton (phase 1 live proof); s391 merges on `docs/how/pij.md` (rebase before phase 4).
- **Risks**: see § Risks & Assumptions.
- **Phases**: 3 active (one per PR) + 1 deferred

### Acceptance Criteria
1. **AC-01** Under `PIJ_QUEUE_BACKEND=sqlite` (default), a text message delivered to `pij-telegram` is sent to the chat once in the normal path (prefix `[from] …`, chunking unchanged), and its delivery row is acked (`reader=pij-telegram`) **only after** the send resolved; a second poll sends nothing.
2. **AC-02** A `kind:"receipt"` row addressed to `pij-telegram` is acked and never sent to the chat.
3. **AC-03** On forwarder start, every `queued` row is forwarded once (backlog), rows in `acked`/`failed`/`parked` are never forwarded, and a restart after ack forwards nothing.
4. **AC-04** If `deps.send` rejects for a text bubble, the **production forwarder closure** (not a synthetic handler) rejects on the sqlite branch, so the row stays `claimed` under its lease with no ack; after lease expiry + `recoverStaleClaims` it is redelivered; past `maxAttempts` it is `parked`. A row is never acked while a required text part is undelivered. Media failures keep the s113 W5 contract (bounded retry + honest echo to the sender) and count as handled.
5. **AC-05** With `PIJ_QUEUE_BACKEND=fs` the forwarder behaves exactly as today (every existing `startForwarder` test stays green; `seen` watermark still honoured).
6. **AC-06** `pij send pij-telegram "x"` for a descriptor `{harness:"pi", paneId:undefined, deliveryMode:undefined}` prints `queued (pull-inbox)` and `--json` gives `receipt:"queued", reason:"pull-inbox"`; a claude push seat still gets its existing classification.
7. **AC-07** (live, o-prime-run on the tested commit) after the bridge restart: row 290 reaches Vaughan's phone (phone confirmation is the oracle, `pij queue` is the sensor — both required); a fresh `pij send pij-telegram` arrives within 5 s; `pij queue --to pij-telegram` shows both `acked` with the ack receipt AFTER the send; the 120 `failed` rows and the retired 149 are untouched/un-forwarded.
8. **AC-08** (3c) A pi peer under sqlite receives each inbound message as an injected turn via the queue consumer (once in the normal path; same at-least-once contract as Phase 1), acks it only after `onInbound` returned, and a `pij send` from another seat lands without any fs file; under fs the receiver is byte-for-byte the current behaviour (existing `index.test.ts` green).
9. **AC-09** (2) DEFERRED — see `deferred-codex-phase.md`.
10. **AC-10** (7) `core/daemon/loop.test.ts` has a named routing-invariant test: claude-with-socket and copilot-with-rpcPort receive the BODY (`via:"socket"`, 0 keystrokes); a seat with neither — including every codex seat today — receives `pointerLine` (`via:"pointer"`); `docs/how/pij.md` and skill C10 state the per-harness rule and cite the test; `just pij-skill-check` green; a doctrine amendment draft exists at `docs/plans/392-day3-codex-doctrine/doctrine-amendment-pointer-relaxation.md`.

### Risks & Assumptions
- **Bridge outage backlog flood** (ruling 2 accepted): a long-dark bridge replays every queued row on restart. Accepted; `--skip-backlog` follow-up.
- **At-least-once, two duplicate windows** (validator finding 5): (W1) the ack fails after a successful send → one resend per lease expiry; (W2) the daemon restarts while the bridge is mid-send → `resetClaimsOnStart` (`daemon.ts:1545`, unscoped) re-queues the in-flight row → one resend. Both bounded to rows in flight at that instant; ack is issued immediately after the send chain resolves. Documented in the how-doc. Follow-up (open[]): token-scoped `resetClaimsOnStart` so the daemon only resets its own claims.
- **s391 overlap** on `core/spawn.ts`, `adapters/daemon-tmux.ts`, `core/types.ts` (phase 3 only): rebase onto main after each s391 merge before starting phase 3.
- **Skill text is a production push**: C10 edit lands only with `just pij-skill-check` green and the o-prime told before merge.

### Open Questions
- None blocking. Follow-ups in `open[]`: `--skip-backlog`; token-scoped `resetClaimsOnStart`; `pij queue retire` verb (s391); Codex phase (deferred).

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Codex app-server topology ownership | Integration Pattern | DEFERRED with the Codex phase — the validator's findings 1–3 (`reports/validate-v2-plan.md`) are the workshop's entry brief | see `deferred-codex-phase.md` |

None gate the active phases.

### Clarifications
#### Session 2026-08-27
- Q: Workflow Mode? → **Full** — four items, four PRs, three domains; decided by the orchestrator from the brief (no modal question UI — pij invariant 9).
- Q: Testing Strategy? → **Full TDD with fakes** — orient-local house practice.
- Q: Mock Usage? → **Targeted** — fakes + temp real sqlite + fake app-server; never network/token/live daemon.
- Q: Documentation Strategy? → **docs/how/ only** — brief names `docs/how/pij.md`; bridge semantics go to `docs/how/pij-telegram.md`.
- Q: Rows 149/290, watermark semantics, consumer placement, build config → answered by o-prime rulings 1–6 (`rulings.md`).
- Ruling (Vaughan, in-pane): Codex deferred ("ignore codex for now as im remote") → Phase 3 moved to `deferred-codex-phase.md`; Phase 4 depends on Phase 1 only.
- Validate-v2 (cold, `pij-civil-locust`, sha 29abeee3…): findings 4–5 applied (at-least-once contract; sqlite handler rejects on undelivered text; production-closure tests); findings 1–3 carried into the deferred file.

---

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none active (Codex topology deferred)

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | n (survey lives in `reports/preamble-checkpoint.md`) | informs Key Findings |
| workshops/*.md | n | — |
| rulings.md | y | authoritative: rows 149/290, watermark, consumer placement, fence, build config, Codex deferral |
| reports/validate-v2-plan.md | y | cold verdict on v1.0.0 (sha 29abeee3…): NEEDS ATTENTION, 5 HIGH — 4–5 applied here, 1–3 deferred with Codex |
| thesis.md | y | steer: consumers and rules catch up to sqlite/socket reality; three small landings |

---

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | no `[NEEDS CLARIFICATION]` markers; Round 1 answered from brief + rulings |
| G2 | Constitution | N/A | no `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | no `docs/project-rules/architecture.md` |
| G4 | ADR Compliance | N/A | no `docs/adr/` |
| G5 | Structure | PASS | all required sections present; AC ids resolve |
| G6 | Testing Alignment | PASS | TDD: test task precedes impl in every phase; ACs measurable |
| G7 | Domain Completeness | PASS | 4 target domains all in `docs/domains/registry.md`; manifest covers every file in task tables |

### Summary
The merge made delivery durable (SQLite) and byte-exact (sockets), but two consumers and the doctrine still assume fs files and pty keystrokes. This plan adds one small queue consumer and points the Telegram bridge (Phase 1) and the pi receiver (Phase 2) at it, fixes the sender's pull-seat receipt, and pins the socket-vs-pointer routing invariant in a test so the doctrine can be relaxed to match (Phase 4). Delivery to Telegram is at-least-once: a row is acked only after its send succeeded, and the two duplicate windows are named and bounded. Phase 3 (Codex) is deferred by ruling. Each active phase is one reviewable PR; Phase 1 is urgent and independent.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/adapters/queue-consumer.ts` (+`.test.ts`) | pij-messaging | contract | NEW — poll/claim/handle/ack consumer over `SqliteQueue`; shared by bridge + pi receiver |
| `.pi/extensions/pij/telegram/bridge.ts` (+`.test.ts`) | pij-messaging | internal | `startForwarder` accepts `MessageChannel`; sqlite branch |
| `.pi/extensions/pij/telegram/index.ts` (+`.test.ts`) | pij-messaging | internal | `runtimeFor` → `openChannel`; `BridgeRuntime.channel: MessageChannel` |
| `.pi/extensions/pij/core/cli.ts` (+`.test.ts`) | pij-messaging | internal | `classifySendReceipt` + `daemonReceiptAuthoritative` use `effectiveDeliveryMode` |
| `docs/how/pij-telegram.md` | pij-messaging | internal | backend + restart/backlog semantics |
| `.pi/extensions/pij/index.ts` (+`.test.ts`) | pij-messaging | internal | pi receiver + `pij_send` deps → `openChannel` + consumer (fence widened, ruling 3) |
| `.pi/extensions/pij/core/daemon/loop.test.ts` | pij-control-plane | internal | routing-invariant test (test-only) |
| `docs/how/pij.md` | pij-control-plane | internal | delivery routing + pointer doctrine text |
| `skills/pij/references/00-routing.md` (C10 only) | pij-skill | contract | LIVE skill text; gate `just pij-skill-check` |
| `docs/plans/392-day3-codex-doctrine/doctrine-amendment-pointer-relaxation.md` | pij-skill | internal | DRAFT for the o-prime (government is single-writer) |
| `docs/plans/392-day3-codex-doctrine/deferred-codex-phase.md` | pij-control-plane | internal | Deferred Phase 3 + validator findings 1–3 (no code in this plan version) |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Bridge and pi receiver are hard-wired to `new FsChannel` + `FsChannel.watch` (`telegram/index.ts:316`, `telegram/bridge.ts:649`, `index.ts:314,377`); the default backend writes no fs file → both dark | One `startQueueConsumer` adapter; both call sites switch to `openChannel` + consumer when `sqliteOf(channel)` is defined |
| 02 | Critical | `classifySendReceipt` (`core/cli.ts:2225`) reads raw `deliveryMode`; pij-telegram has none and no pane → `delivered: peer was idle` while the row stays `queued` (spine 23889) | Use `effectiveDeliveryMode` there and in `daemonReceiptAuthoritative` (`:693`); pin with a pull-descriptor test |
| 03 | High | `SqliteQueue` already has the whole state machine the consumer needs (`claim`/`claimUnread`/`recoverStaleClaims`); `failed` rows are excluded from every list by construction | No write-side change to `sqlite-queue.ts`; consumer = claim → handler → ack; failure = leave claimed, lease sweep retries/parks |
| 04 | High | The daemon's lease sweep is recipient-agnostic (`sqlite-queue.ts:397`) so bridge/pi rows self-heal after a crash; but a consumer process with no daemon would never retry | Consumer runs its own `recoverStaleClaims` on each poll only for rows it owns? — NO: keep it daemon-owned (single sweeper); document the dependency; test drives the sweep explicitly |
| 05 | High | Codex: builders exist but no ws client/route/topology; the validator found three further gaps (production route gate `loop.ts:617-624`; one-process argv-only spawn contract `spawn.ts:144-148`/`tmux.ts:52-81`; 0.148 protocol needs `initialize`, `threadId`, mandatory `expectedTurnId`) | DEFERRED by ruling — all carried in `deferred-codex-phase.md` |
| 07 | Critical | The production forwarder closure swallows every `deps.send` error (`telegram/bridge.ts:573-581`, "log, continue"); a consumer that acks after the closure resolves would ack a message Telegram never received (validator finding 4) | sqlite branch: the closure counts undelivered required text parts and REJECTS when any remain, leaving the row claimed for lease recovery; fs branch keeps log+continue; tests drive the production closure with a rejecting `send` |
| 08 | High | "Exactly-once" is unprovable: send and ack are not one transaction, and `resetClaimsOnStart` (`daemon.ts:1545`) re-queues every claimed row incl. the bridge's in-flight claim (validator finding 5) | Contract = at-least-once, ack only after success, two named bounded duplicate windows; Goals/ACs/how-doc say so; token-scoped reset is a follow-up |
| 06 | Medium | Socket/RPC already delivers full bodies (`loop.ts:626`); the pointer is the socketless path; doctrine text is global | Extend the existing socket-first/pointer describes in `loop.test.ts` with a named invariant test; docs cite it |

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | 3b — Telegram forwarder on the sqlite queue + honest pull receipt | pij-messaging | Bridge consumes the durable queue at-least-once — ack only after a successful send, bounded duplicate windows; `pij send` stops lying for pull seats | None |
| 2 | 3c — pi in-process receiver adopts the queue consumer | pij-messaging | pi peers receive under the sqlite default with fs parity | Phase 1 (consumer) |
| 3 | 2 — Codex app-server `--remote` (DEFERRED) | pij-control-plane | deferred by ruling — `deferred-codex-phase.md` | — |
| 4 | 7 — Pointer-delivery doctrine relaxation | pij-control-plane / pij-skill | Test pins socket-vs-pointer routing; docs, skill C10, and a doctrine draft say so | Phase 1 (order only; no code dependency) |

#### Phase 1: 3b — Telegram forwarder on the sqlite queue + honest pull receipt

**Objective**: Make `startForwarder` consume `SqliteQueue` at-least-once (claim → send → ack-only-on-success) with the delivery state as the watermark, fix the pull-seat send receipt, and hand the o-prime a tested commit + proof + the row-149 retirement statement.
**Domain**: pij-messaging
**Delivers**: `adapters/queue-consumer.ts` (+test); sqlite-capable `startForwarder`; `runtimeFor` on `openChannel`; receipt fix; how-doc; handover file `reports/phase-1-handover.md`.
**Depends on**: None
**Key risks**: the two duplicate windows (W1 ack-after-send failure, W2 daemon restart mid-send) are documented, not eliminated; fs parity must stay green (AC-05); the sqlite handler must never resolve while a required text part is undelivered (finding 07).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Write `adapters/queue-consumer.test.ts` (RED): claim→handler→ack exactly once in seq order; `kind:"receipt"` rows reach the handler flagged and are acked; handler throw ⇒ row stays `claimed`, no ack, `recoverStaleClaims` (fake `now`) redelivers once, `parked` past `maxAttempts`; boot backlog: `queued` rows handled once, `acked`/`failed`/`parked` never; poll drains N rows per tick; dispose stops polling; `onScan` heartbeat fires per scan | pij-messaging | Tests exist and FAIL for want of the module | Per finding 03/04; temp `PIJ_HOME`, real `SqliteQueue` |
| 1.2 | Implement `adapters/queue-consumer.ts` `startQueueConsumer({queue, self, onMessage, pollMs=500, leaseMs=60_000, token, log?, onScan?}) → dispose` — loop: `while (row = queue.claim(self,{leaseMs,token}))` → `await onMessage(row)` → `queue.claimUnread(self,row.messageId,{reader:self, readAt})`; on throw: log + leave claimed (lease sweep owns retry); serialized per seat; `unref` timer | pij-messaging | 1.1 GREEN; `tsc --noEmit` clean | No write-side change to `sqlite-queue.ts` |
| 1.3 | Write sqlite twins in `telegram/bridge.test.ts` (RED): forwards once + row acked with the ack receipt timestamped AFTER `send` resolved (AC-01); receipt acked not sent (AC-02); backlog forwarded, `failed` row (pre-seeded via raw update helper) never sent, restart after ack sends nothing (AC-03); **production closure** with a `deps.send` that rejects for a text bubble → row stays `claimed`, no ack, no `released` receipt; after `recoverStaleClaims` (fake `now`) it is resent (AC-04); media-only failure with `echoFailure` wired → row acked (handled per s113 W5); existing fs tests untouched (AC-05) | pij-messaging | Tests FAIL on the current `startForwarder(FsChannel)` signature | `new SqliteQueue(home)` on temp home; per finding 07 |
| 1.4 | `startForwarder(channel: MessageChannel, deps)`: refactor the per-message closure into `forwardOne(dm): Promise<{undeliveredText: number}>` (counts text bubbles whose `send` rejected; media keeps the s113 W5 retry+echo and counts as handled). `sqliteOf(channel)` defined ⇒ `startQueueConsumer` whose handler awaits `forwardOne` and **throws `ForwardIncomplete`** when `undeliveredText > 0` (row stays claimed → lease recovery; ack only when 0); else the current `FsChannel.watch(..., deps.seen)` path with log+continue unchanged. Ack is issued by the consumer immediately after the handler resolves | pij-messaging | 1.3 GREEN; all prior `startForwarder` tests GREEN | Per findings 07/08; no `sqlite-queue.ts` write-side change |
| 1.5 | `telegram/index.ts`: `BridgeRuntime.channel: MessageChannel`; `runtimeFor` → `openChannel(pijHome)` (respects `PIJ_QUEUE_BACKEND`); pass `seen` only when the channel is fs; `index.test.ts` asserts sqlite default wiring and fs opt-out | pij-messaging | `index.test.ts` GREEN; `pij telegram start --help`/init unchanged | `echoFailure`/inbound `deliver` unchanged (port method) |
| 1.6 | `core/cli.test.ts` (RED→GREEN): descriptor `{harness:"pi"}` (no pane, no mode) ⇒ `queued`/`pull-inbox` text + JSON; claude push seat unchanged. Fix `classifySendReceipt` and `daemonReceiptAuthoritative` to use `effectiveDeliveryMode` | pij-messaging | AC-06 test GREEN; existing receipt tests GREEN | Per finding 02 (obs-04 included by ruling 3) |
| 1.7 | `docs/how/pij-telegram.md`: "Queue backend & restart semantics" — sqlite default; claim → send → ack-only-on-success; **at-least-once** with the two named duplicate windows (W1 ack-after-send failure, W2 daemon restart mid-send) and their bounds; state = watermark; backlog on restart; `PIJ_QUEUE_BACKEND=fs` opt-out; `pij queue --to pij-telegram` as the sensor, the phone as the oracle | pij-messaging | Section present; commands copy-paste valid | Per finding 08 |
| 1.8 | Gates + handover: `npx vitest run .pi/extensions/pij/`, `tsc --noEmit`, `just pij-skill-check`, `harness checks` (pwsh known-red reported); pathspec commit; write `reports/phase-1-handover.md` with commit sha, bridge start command bound to the worktree CLI (`PIJ_HOME=~/.pij npx tsx <worktree>/.pi/extensions/pij/cli.ts telegram start`) and post-merge main variant, the AC-07 proof sequence (phone = oracle, `pij queue` = sensor, ack receipt after the send; detailed in the dossier T008), and the row-149 retirement statement (`UPDATE deliveries SET state='failed', last_error='delivered-via-fs-pre-cutover', updated_at=… WHERE seq=149 AND state='queued'; INSERT INTO receipts(seq,state,attempt,at,detail) VALUES (149,'retired',0,…,'delivered-via-fs-pre-cutover')`) for the o-prime to run before restart | pij-messaging | Gates recorded with output paths; pointer sent to o-prime; PR opened after cold review | Live proof is the o-prime's (ruling 6) |

#### Phase 2: 3c — pi in-process receiver adopts the queue consumer

**Objective**: The pi extension's own receiver (`index.ts:314-395`) and its `pij_send` tool deps use `openChannel`; under sqlite the receiver runs `startQueueConsumer` (ack after `receiver.onInbound`), under fs it is unchanged.
**Domain**: pij-messaging
**Delivers**: sqlite-capable pi receiver; tests; no schema change.
**Depends on**: Phase 1 (consumer)
**Key risks**: the fs `seen` watermark logic must remain exactly as is for fs; `noteInboxScan` heartbeat must keep firing (plan 057 inbox-poll-stalled detector).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | `index.test.ts` (RED): with `PIJ_QUEUE_BACKEND=sqlite` a message enqueued via `SqliteQueue.deliver` reaches `session.onInbound` once, row acked with `reader=<self>`, `noteInboxScan` stamped per poll; with `fs` the existing watch/markRead path runs (existing assertions) | pij-messaging | Tests FAIL on current wiring | Reuse Phase 1 temp-home pattern |
| 2.2 | `index.ts`: `new FsChannel(pijHome, pollPrimaryWatchOpts())` → `openChannel(pijHome)`; branch on `sqliteOf(channel)`: consumer with `onMessage = receiver.onInbound(dm, dm.messageId)` + `onScan = receiver.noteInboxScan`; else current watch block; `pij_send` deps `delivery: openChannel(pijHome)` | pij-messaging | 2.1 GREEN; all `index.test.ts` GREEN | Ack marker `{readAt, reader:self}` parity with fs `markRead` |
| 2.3 | Gates + pathspec commit + `reports/phase-2-report.md`; PR after cold review | pij-messaging | Gates recorded; pointer sent | |

#### Phase 3: 2 — Codex app-server `--remote` (DEFERRED)

**Status**: DEFERRED by ruling (Vaughan, 2026-08-27, `rulings.md`). No tasks in this plan version. The full phase draft and the validator's three Codex findings (production route gate, one-process spawn contract, 0.148 protocol lifecycle) are preserved in `deferred-codex-phase.md` as the entry brief for resumption.

#### Phase 4: 7 — Pointer-delivery doctrine relaxation

**Objective**: Pin the routing invariant in a test and bring the how-doc, the live skill C10 text, and a drafted doctrine amendment in line: body on socket/RPC; pointer only for socketless seats.
**Domain**: pij-control-plane (test/doc) · pij-skill (C10)
**Delivers**: named invariant test; `docs/how/pij.md` section; C10 amendment; doctrine draft file.
**Depends on**: Phase 1 (order only)
**Key risks**: skill edit is live for every agent — `just pij-skill-check` must be green before commit and the o-prime told before merge.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | `core/daemon/loop.test.ts`: `describe("routing invariant — body on socket/RPC, pointer only without")`: claude+socket ⇒ `via:"socket"`, 0 send-keys; copilot+rpcPort ⇒ `via:"socket"`; a codex seat (no endpoint today) and any seat with neither ⇒ `via:"pointer"` with `pointerLine` and the composer-idle guard still consulted | pij-control-plane | Test GREEN on current code (documents, then guards) | Extends existing socket-first/pointer describes; the codex line flips to socket only when the deferred phase lands |
| 4.2 | `docs/how/pij.md`: "Delivery routing" — per-harness table (claude socket / copilot RPC / codex pointer-today / pi in-process), the rule, the clip history (2.1.246), cite 4.1 by name | pij-control-plane | Section present, cites the test | |
| 4.3 | `skills/pij/references/00-routing.md` § C10: amend the pointer clause to "persist bodies ≥ the pty budget to disk **only for socketless seats**; socket/RPC seats receive the body" (one clause; keep the rest); run `just pij-skill-check` | pij-skill | `just pij-skill-check` GREEN; diff limited to C10 | Live skill — tell o-prime before merge |
| 4.4 | Draft `doctrine-amendment-pointer-relaxation.md` in this folder: the ruling text for `government/doctrine/preconditions-travel-with-remedies.md` ("the pointer is the remedy for the pty clip; on a channel that cannot clip, deliver the body"), with evidence pointers (4.1; `reports/pij-comms-review-2026-08-27.md` §5/§11/§13 benchmarks — cite the FULL PATH, not bare "review §N") | pij-skill | File exists; o-prime folds it in | Government single-writer |
| 4.5 | Gates + pathspec commit + report; PR after cold review | pij-control-plane | Gates recorded; pointer sent | |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | 1.1, 1.2, 1.3, 1.4 | `bridge.test.ts` sqlite "forwards once + acked" |
| AC-02 | 1.1, 1.3, 1.4 | `bridge.test.ts` sqlite "receipt acked not sent" |
| AC-03 | 1.1, 1.3, 1.4 | `queue-consumer.test.ts` backlog + `bridge.test.ts` restart-after-ack |
| AC-04 | 1.1, 1.2, 1.3, 1.4 | `queue-consumer.test.ts` throw→claimed→sweep→redelivered→parked (consumer contract) **and** `bridge.test.ts` sqlite describe: production `forwardOne` closure with a rejecting `deps.send` → row stays `claimed`, no ack; `recoverStaleClaims` (fake `now`) → resent (lease recovery on the production path) |
| AC-05 | 1.4, 1.5 | existing `startForwarder` fs tests + `index.test.ts` fs opt-out |
| AC-06 | 1.6 | `core/cli.test.ts` pull-descriptor receipt |
| AC-07 | 1.8 | o-prime live proof per `reports/phase-1-handover.md` |
| AC-08 | 2.1, 2.2 | `index.test.ts` sqlite receiver |
| AC-09 | — | DEFERRED (`deferred-codex-phase.md`) |
| AC-10 | 4.1–4.4 | `loop.test.ts` invariant; `just pij-skill-check`; draft file |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| W1: ack fails after a successful Telegram send → one duplicate per lease expiry | Low | Low | Ack immediately after the send chain resolves; documented bound |
| W2: daemon restart while the bridge is mid-send → `resetClaimsOnStart` re-queues the in-flight row → one duplicate | Low | Low | Bounded to rows in flight at that instant; documented; follow-up token-scoped reset |
| A required text part fails and the row is acked anyway (lost message) | — | High | Eliminated by design: sqlite handler rejects on `undeliveredText > 0` (task 1.4), tested on the production closure (1.3) |
| Bridge restart floods the chat with a long backlog | Low today | Medium | Ruling 2 accepted; `--skip-backlog` follow-up |
| s391 lands on `docs/how/pij.md` before Phase 4 | Medium | Low | Rebase before Phase 4; Phases 1–2 are disjoint |
| Skill C10 edit breaks `pij-skill-check` budgets | Low | High (live) | Minimal clause edit; gate before commit |
| Consumer process without a daemon never retries a failed row | Low | Low | Documented; the daemon is always up in the fleet; test drives the sweep explicitly |

## Fixes

| ID | Created | Summary | Domain(s) | Status | Source |
|----|---------|---------|-----------|--------|--------|
| FX003 | 2026-08-27 | Phase 4 SKILL.md invariant-2 clause true under fs/dual (pointer path is sqlite-only) | pij-skill (live) | FIXED 4dca931 (PD-02 diff empty, 85 lines) — Phase 4 re-review queued | `reviews/phase-4-review.md` finding B |
| FX002 | 2026-08-27 | Phase 2 missing Dim-0 witnesses (rejecting-inject→claimed; reload-dispose) — test-only, no source change | pij-messaging (test) | APPROVED — Phase 2 re-review (phase-2-rereview.md): M2b+M8 RED, coder strengthened happy-path beyond brief; F1/F2 closed | `reviews/phase-2-review.md` FIX_REQUIRED (F1/F2) |
| FX001 | 2026-08-27 | Restore the pane-less tick witness for `daemonReceiptAuthoritative` (one negative test; mutation 6 must go RED) | pij-messaging (test-only) | APPROVED — cold re-review (fx001-review.md): mutation 6 RED, coder log accurate; finding 7 discharged | `reviews/phase-1-review.md` mutation 6 (post-merge FIX_REQUIRED); `fixes/FX001-pane-less-tick-witness.md` |

## Item 10a: pane-resolution guard

**Added post-plan by o-prime ruling (2026-08-27, `rulings.md`)** — not in the original brief. Half 2 of the cross-government pane-misbind incident (`government/incidents/2026-08-27-cross-government-pane-misbind.md`); half 1 (retire-on-close) is s391.

**Objective**: `IndexState.rebuild` must not index `byPane` for a dissolved/terminal descriptor, so `resolvePane` never returns a dead seat for its (possibly reused) pane. Fence: `core/daemon/index-state.ts` (+test). The `loop.ts` bind-guard (require copilot `--session-id` evidence; refuse to bind a dissolved seat) is item 10b, landing after s391 item 5 (shared `loop.ts`). Full task table: `tasks/item-10a-index-state-guard/tasks.md`.

## Item 9: pay the pij-skill-check debt

**Added post-plan by o-prime ruling** (item 9; fence `skills/pij/**`; own PR, cold-reviewed). Clear the 10 `just pij-skill-check` ✗ (3 budget overages + 7 marker/order strings) by consolidating redundant prose and adding required verbatim strings, WITHOUT dropping any load-bearing instruction from a live skill. Full task table: `tasks/item-9-skill-check-debt/tasks.md`.

## Item 11: fix the pij-skill-check order-check false-positive

**Added post-plan by o-prime ruling** (promoted from item-9 finding F5 + re-review R1; fence `harness/scripts/**`; after item 9, before 10b). Fix the `head -1` marker resolution so an incidental backward cross-reference doesn't cause a false "out of order" (Req 1), ADD an ordering assertion that the read-back precondition precedes fleet-confirmation with the reviewer's mutant as the RED fixture (R1), add a script test, and revert the forced doc reorder if it harmed reading. Full table: `tasks/item-11-skillcheck-order-fix/tasks.md`.

## Item 12: harden pij-skill-check (R2/R3/R4)
**Follow-up to item 11** (o-prime-approved, own PR, harness/scripts only, no s391 dep). Close the three residual coverage limits the item-11 cold review found by attacking its own approval: R2 (in-section decoy bypasses R1 — reviewer-verified 4-line anchor fix), R3 (Build-config read-back site needs a literal clause pin), R4 (second order loop :479-495 still whole-file). Table: `tasks/item-12-skillcheck-hardening/tasks.md`.

## Item 10b: pane-misbind BIND guard + shared resolver (the real incident fix)
The resolution/bind half of the cross-government pane-misbind incident. Shared lifecycle-filtered resolver for the 6 unguarded pane→id sites + a grep-sweep test (no 7th unfiltered site) + the loop.ts bind guard (refuse dissolved; require the seat's own session-id evidence) + the actual-route daemon replay (pane-less dissolved seat + fresh unregistered same-harness pane → zero deliveries, zero binds). 10a (index guard) lands with it. Full table + re-verified anchors: `tasks/item-10b-bind-guard/tasks.md`.

## Item 14: C9 watchdog-mute wording
Budget-flat amendment to `00-routing.md` C9: `pij report state done` does NOT silence the watchdog (only `blocked|question|hold|waiting` mute — `core/watchdog.ts:332`); a seat standing by parks `hold`/`waiting`, reach for `interval` not `pause`. Mirror one line in orient-oprime duty 7 if budget. Skill-text PR gate. Table: `tasks/item-14-c9-watchdog-wording/tasks.md`.

## Item 17: bind-guard advisories (one follow-up PR)
The four advisories from the item-10b bind-guard cold review (`reviews/item-10b-review.md`), landed as ONE PR in the o-prime's ordered sequence ADV-2 → ADV-4 → ADV-3 → ADV-1. ADV-2 is the only behaviour change: the planned-bind guard (`loop.ts:392-397`) refuses **silently** and collapses transient `probe-unavailable`/`identity-indeterminate` (retry) into the same outcome as `foreign-session-id` (a real conflict → refuse) — add a once-per-seat log naming `identity.cause` and distinguish the two ("never silent", daemon.ts:566 comment). ADV-4/ADV-3 harden the grep-sweep test (win32 path separator; reversed-operand + destructuring bypass shapes; comment false-positives; line-anchored allowlist). ADV-1 pins the copilot `!isCopilotSessionId(planned)` clause that today deletes green (zero coverage). Full table + anchors: `tasks/item-17-bind-guard-advisories/tasks.md`.

## Item 18: watchdog-sensor ratchet + doc/relay parked-state cleanup
Closes the E6 class the item-14 review surfaced: `cli.integration.test.ts:327` pins the DOC's own literal ("If done, run `pij report state done`") instead of `buildWatchdogTurn`'s real OUTPUT — so the doc omits the `ready` option the emitter actually offers (`watchdog.ts:411-413`) and the gate stays green. ADV-1/2 = re-anchor the ratchet against `buildWatchdogTurn` output (minus the `[pij watchdog #N for id]` header prefix): a doc missing `ready`/the mute set → RED. ADV-3 = fix `docs/how/pij-watchdog.md` (add `ready` to the recovery axis; state the full mute set `blocked|question|hold|waiting`, `done`/`ready` never mute). ADV-5 = `orient-oprime.md` duty 7 relay menu (`:117-118`) drops `waiting|blocked|question` — only `now`/`ready`/issuer-`hold` are relayable to a status-stale seat. INFO-7 = C9's "per node doctrine" citation points where the split isn't (`state.ts:145`, not node.md). Skill-text PR gate. Table: `tasks/item-18-watchdog-ratchet/tasks.md`.

## Item 20: transport post-write ack — no duplicate on ack-loss (T1/T2)
Closes OBS-04 (s393 spec-seat cold review): the Claude inbox-socket and Copilot `--ui-server` RPC sends return `"failed"` for BOTH a pre-write failure (nothing landed → safe retry, T1) and a post-write ack loss (bytes already delivered, only the ack was lost → T2). `drainTmuxInbox` re-enqueues on `"failed"` (`loop.ts:704`), so a T2 failure re-sends → the peer sees the message twice. The pane path already solves exactly this with `unverified` ("payload WAS typed, replaying could duplicate an accepted turn" → CONSUME, not retry — `loop.ts:748-752`, `ports.ts:27`). Fix: the socket/RPC adapters track a `wrote` flag and return `unverified` (delivered-unconfirmed) on any failure AFTER the bytes flushed, keeping `failed` only for pre-write/never-connected; `drainTmuxInbox`'s socket branch treats `unverified` like the pane path (consume via the single receipt path, never blind re-send). Pin T1 (fail-before-write → retry) and T2 (fail-after-write → no dup) with fakes. Table: `tasks/item-20-transport-dup-window/tasks.md`.

## Item 21: bind-guard advisory tail (ADV-A2 + ADV-B + ADV-C)
The non-blocking tail from the item-17 bind-guard review (`reviews/item-17-review.md`, `reviews/item-17-adva-reconfirm.md`). ADV-A2: `drive.settled` is in the same never-reset class as bindRefusalCauses was — after refuse→bind→refuse→re-bind the spawner's last word is a STALE refusal for a now-bound seat (`buildBoundNotice` is gated on `!drive.settled`, so the re-bind is silent); one-line fix resets `settled` where a refusal is reported so the re-bind re-announces. ADV-B: the refusal notify covers only `foreign-session-id`+`malformed-planned-copilot-id`; `no-harness-process`+`harness-process-present` still refuse forever silently, and the planned-bind path has NO timeout (never reaches the bind-timeout fail) — "never silent" is ~1/3 delivered. ADV-C: the grep-sweep is still line-scoped (multi-line arrows, aliased destructures `const {paneId: pid}=d`, line-scoped `undefined` exclusion bypass) — narrowed, not closed. Table: `tasks/item-21-bind-guard-tail/tasks.md`.

## Item 23: transport receipt honesty — `sent` outcome + defer to durable ack (from item-20 ADV-1/ADV-2)
The live check (restart #3) showed the claude socket path reads `unverified` on the sender-side transport receipt ~systemically (seq 3260 = unverified; pane-less socket seat 5/5 post-restart) while the DURABLE queue evidence is intact (acked). Impact = pessimistic transport receipts, no dup/loss. o-prime ruling (b): (1) a flushed claude socket write is **`sent`** (a new, non-pessimistic outcome), NAK/drop stays `failed`, `confirmed` only on a positive `orig_msg_id` ack; (2) the sender-side receipt DEFERS to the durable reader-ack — a queue `acked` ⇒ report `delivered` regardless of transport; (3) MEASURE ackWaitMs once at 1000ms to settle whether the receiver ever positively acks success, recorded in the spec outstanding list. Table: `tasks/item-23-transport-receipt-honesty/tasks.md`.

## Item 29: Telegram bridge — die loud + daemon supervises + auto-restart (URGENT)
The bridge (human channel to Vaughan's phone) died SILENTLY twice today; the standalone `pij telegram` process (its own tmux window) has SIGINT/SIGTERM handlers but NO uncaughtException/unhandledRejection/exit-reason handler, and logs via stdout+tee (lossy on abrupt death) — so an unhandled rejection in the grammy long-poll dies leaving the log on the last "forwarded" line. And `maybeStartBridge` runs only at daemon STARTUP (`index.ts:362`), never re-checking, so a dead bridge is never restarted. Fix: (a) the standalone command writes its OWN log file + installs exit/uncaught/unhandled handlers that flush reason+code before dying; (b) the daemon SUPERVISES on tick — recorded bridge pid dead + telegram.env present ⇒ restart (reuse maybeStartBridge's stale-lock reclaim) + spine note + owner capture regardless of exemption; (c) fake kills the child ⇒ restarted within one tick + note. Table: `tasks/item-29-telegram-bridge-supervision/tasks.md`.
