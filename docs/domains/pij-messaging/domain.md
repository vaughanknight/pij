# Domain: pij-messaging

## Purpose

Own the product contract for two (or more) live pi sessions discovering each
other, exchanging fire-and-forget self-identifying messages + remote commands,
fanning one text message out to an ordered recipient set, and observing each
other's work through a per-session event stream with state/liveness signals.
Phase 1 establishes the **pi-free core** (types, port
contracts, monotonic seq, event build/filter/age, state + liveness, command
allow-list, peer discovery + self-resolution, message framing, and delivery
receipts) plus **in-memory fake adapters** with full unit coverage. Adapters
(fs registry/event-log/channel, pi-runtime), the extension wiring, and the
`pij` CLI land in Phases 2–5. Plan 041 adds immutable inbox envelopes,
atomic read markers, and a pull consumer for sessions without tmux. Plan 046
adds migration-safe structural forests, repository identity, lifecycle filters,
link validation, and current/old-prime projections without changing close ownership.

## Source Locations

| Path | Role |
|------|------|
| `.pi/extensions/pij/core/types.ts` | Pi-free domain vocabulary: ids, roles, tri-state `parentId`, `gitCommonDir`, current/old prime, tree/filter projections, state/liveness, watchdog sidecar/watcher/pause contracts, descriptor, event/query, message, receipt, error codes, `Result` tagged union. |
| `.pi/extensions/pij/core/ports.ts` | Hexagonal port interfaces: `RegistryPort`, `RepositoryIdentityPort`, `EventLogPort` (`+lastSeq/count/appendOnce`), `DeliveryPort`, `InboxPort`, `PiRuntimePort`, `ProcessPort`. |
| `.pi/extensions/pij/core/seq.ts` | `SeqCounter` — strictly-monotonic allocator with crash-safe recovery from `lastSeq()`. |
| `.pi/extensions/pij/core/events.ts` | `buildEvent` (seq + ISO timestamp), `filterEvents` (since/type/last), `eventAgeMs`/`latestEventAgeMs`. |
| `.pi/extensions/pij/core/state.ts` | `isWorking`, `liveness` (active/stale/dead), `isStalled`; `STALE_AFTER_MS`. |
| `.pi/extensions/pij/core/watchdog.ts` | Pure whole-life watchdog defaults, bounded exemption/reconciliation, scheduler, pause transitions, typed response derivation, self-teaching turn builder, capture gating, and UTF-8-safe bounded tail slicing. |
| `.pi/extensions/pij/core/commands.ts` | Remote-command allow-list (`compact`) + `validateCommand`. |
| `.pi/extensions/pij/core/discovery.ts` | `deriveSelfId`/`deriveHarnessPijId`, exact-folder and repository selection, current-only `filterPrime`, `excludeSelf`, `resolveSelf` (PIJ_SESSION_ID → lone-local → `E-AMBIG`). |
| `.pi/extensions/pij/core/tree.ts` | Effective-parent resolution, no-write link planning/cycle refusal, repository/global/subtree selection, filter algebra, and iterative cycle-safe forest projection. |
| `.pi/extensions/pij/core/memorable-id.ts` | Exact-pinned adjective/animal candidate sequence: PoC-compatible first vector plus deterministic full-space linear probing. |
| `.pi/extensions/pij/core/message.ts` | `frame`/`parseFrame` (`[pij from <id>] …`), `roleLabel`, boot `announceText`. |
| `.pi/extensions/pij/core/receipts.ts` | `MessageReceipt` model + `classifyOnInject`/`initialReceipt`/`markDelivered`/`correlateDeliveredAt`. |
| `.pi/extensions/pij/core/cli.ts` | Send/tree/link grammar and rendering, broadcast/wait projection, watchdog surfaces, and journal-first `state set|clear|verify` command dispatch. |
| `.pi/extensions/pij/core/session-join.ts` | Stable additive session projection and eval-safe environment exports for structural parent, repository, and prime history. |
| `.pi/extensions/pij/core/inbox.ts` | Pull inbox grammar, claim projection, hidden receipt preparation, and event-before-marker persistence. |
| `.pi/extensions/pij/adapters/fakes.ts` | In-memory implementations of the domain ports (Pattern P8: tests target these). |
| `.pi/extensions/pij/core/*.test.ts`, `adapters/fakes.test.ts` | Unit coverage for every core module + fakes (50 tests). |
| `.pi/extensions/pij/adapters/channel.ts` | Immutable `msg-*` publication plus exclusive/idempotent `read-*` markers, unread listing, and pi watcher watermarking. |
| `.pi/extensions/pij/adapters/sqlite-queue.ts` | SQLite WAL delivery state machine, append-only receipts, terminal retirement, reason-filtered revive requeue, queue counts, and open-recipient discovery. |
| `.pi/extensions/pij/index.ts` | Pi wiring: durable unread-derived watcher watermark, `PijSession.onInbound`, then post-callback `markRead`. |

## Concepts

| Concept | Description | Contract |
|---------|-------------|----------|
| Session descriptor | Live presence/attachment data used to find and address a session. | `SessionDescriptor` — written to `~/.pij/<id>.json`; runtime fields may be refreshed without replacing durable identity/history. |
| Terminal observation | A durable statement of terminal evidence, not an inferred crash cause. | `requested` follows persisted pij close intent; `unrequested-by-pij` is an observed PID/pane absence without it; `unavailable` records a failed probe. Historical first-sweep and live observations remain distinguishable. |
| Spawn expectation | Pre-launch durable intent keyed by `spawnId`, independent of child registration. | Carries requested harness, named bounded deadline, pane/session correlation, and terminal/no-show latch. A same-key descriptor suppresses an expired no-show. |
| Prime designation/history | Mutually exclusive current and retired honor-system markers consumed by orchestration and projections. | `prime:true` is current; `oldPrime:true` is retired history; `list --prime` is current-only; legacy absence means neither. |
| Structural parent | Session hierarchy independent of close ownership. | `parentId:<id>` is explicit parent, `null` explicit root, and absence read-only falls back to legacy `spawnedBy`; `spawnedBy` remains authorization. |
| Repository identity | Stable grouping across a Git main checkout and linked worktrees. | Canonical absolute `gitCommonDir`; absent legacy descriptors can be resolved from folder without migration writes. |
| Session forest | Deterministic repository/global/subtree projection over one effective-parent graph. | OR within activity/liveness/lifecycle axes, AND across axes; dead/dissolved hidden by default; orphan/filtered-parent/cycle annotations; iterative bounded rendering. |
| Durable native identity | The same exact native session recovers the same pij-id and metadata after descriptor removal or machine restart. | Two-way `FsRegistry` ownership records keyed by native tuple and pij-id, with durable descriptor snapshots and no-replace publication; Pi persists its exact native id. |
| Memorable primary id | Newly minted identities use the actual `pij-<adjective>-<animal>` value everywhere; existing opaque ids are immutable. | Exact-pinned 1,202 x 355 corpus; deterministic non-repeating candidates; native/durable/legacy lookup precedes allocation. |
| Pre-bind reservation | A control-plane id is owned before its pane or descriptor exists. | The same atomic by-pij owner record arbitrates native claims and reservation claims; known failure releases only the owner token, while crash-orphans are retained. |
| Monotonic seq | Each event has a strictly-increasing `seq`, recoverable after `/reload`. | `SeqCounter(lastSeq)`; `EventLogPort.lastSeq()` is the recovery source. |
| Event line | One `events.ndjson` row carrying activity. | `PijEvent { seq, timestamp(ISO), type, data? }` — age computed from the stream alone. |
| Incremental follow | Read only what's new / of-interest / recent. | `EventQuery { since, type, last }` composed since→type→last. |
| Liveness verdict | Is a peer active/stale/dead? | `liveness(pidAlive, latestAgeMs)`; stall = working state + stale newest event. |
| Remote command | A sender can drive a narrow allow-listed action on a peer. | `validateCommand` accepts `compact`, rejects others with `E-CMD`. |
| Self-resolution | "Which session am I?" when parent+worker share a cwd. | `resolveSelf(envId, local)` — env wins, lone-local fallback, else `E-AMBIG`. |
| Framed message | Sender id rides inline for zero-lookup replies. | `frame`/`parseFrame` → `[pij from <id>] <body>`. |
| Delivery receipt | Sender learns queued-vs-delivered. | `MessageReceipt` (`queued`/`delivered`); steered delivery = next `turn_start` after `input(steer)` (finding 08). |
| Broadcast send | One raw text body is delivered once to each ordered target with independent outcomes. | Two or more unique repeatable `--to` targets; all-target preflight before the first delivery; per-target result/message id; later targets continue after a delivery-port failure. |
| Multi-message wait | A broadcast sender can wait honestly for every successful recipient. | Ordered `{to,messageId}` tracking; `queued` retains a target, `delivered`/`unverified` removes only that target, and one global timeout names unresolved recipients. |
| Immutable inbox | Message payload and read state are separate durable facts. | `msg-<id>.json` is retained; `read-<id>.json` existence is authoritative and marker publication is atomic/idempotent. |
| Delivery state machine | SQLite delivery progress and terminal operator decisions are durable, receipted facts. | `queued→claimed→injected→acked`; lease exhaustion may produce `parked` (open-but-stuck); any open state may become terminal `retired` with a reason receipt; only matching `recipient-closed` retirement reasons are `requeued` on revive. |
| Delivery ownership | Push and pull consumers share one unread/marker contract without double consumption. | Pi marks after `onInbound`; daemon-owned tmux marks after injection outcome; `deliveryMode:"pull"` is never daemon-owned. |
| Watchdog configuration | Supervision deviations are durable, additive, and pi-free. | `WatchdogSidecar`: optional enable/interval, `self\|compact\|exempt` pause tier, per-watcher capture policy, and `exemptUntilMs`; absence means default-on 20 minutes. A live exemption has an absolute bounded deadline; malformed legacy timing re-arms rather than extending safety-off. |
| Watchdog response | Delivered turns are interpreted without letting the observer's own effects fabricate health. | `evaluateResponse` uses typed event/pane/working attribution; paneless peers omit pane evidence; two silent fires ⇒ `stalled`. |
| Pull inbox | A non-tmux external session can register and block for messages without a daemon. | `pij inbox --wait [ms]`; first use auto-registers current ambient identity as pull-owned. |
| Durable receipt envelope | Receipt history resolves waits without waking peers or relying on a live process. | Persist/reuse the receipt event before publishing its read marker; receipt envelopes remain retained and hidden. |
| Semantic declaration clear | An assignment can return from a declared exception to undeclared without losing its work/history. | `state clear` targets an existing assignment, appends the journal-first `state-cleared` event, removes only descriptor `semanticState`, and refuses already-undeclared targets loudly. |

## Contracts

| Contract | Consumer | Shape / Guarantee |
|----------|----------|-------------------|
| `Result<T>` | whole core, CLI, tests | Tagged union `{ok:true,value}` / `{ok:false,code,message}` (Pattern P4 — no throws). |
| Seven domain ports | adapters, tests | `RegistryPort`, `RepositoryIdentityPort`, `EventLogPort(+lastSeq/count/appendOnce)`, `DeliveryPort`, `InboxPort`, `PiRuntimePort`, `ProcessPort`. Only `PiRuntimePort`'s real adapter imports pi. |
| Effective-parent/link contract | tree CLI, adopt validation, tests | One tri-state parent function drives both projection and cycle refusal; unknown/self/cyclic changes return tagged errors before registry writes. |
| Forest projection | CLI users and automation | JSON root `{roots}` with raw descriptor fields plus `effectiveParentId`, computed state, problem metadata, and children; human `P`/`O` markers and finite deep/corrupt output. |
| `PijEvent` + `EventQuery` | event log adapter, `pij tail` | seq+ISO-timestamp lines; filters compose deterministically. |
| `MessageReceipt` + correlation | Phase 3 receiver wiring, `pij send` | queued/delivered lifecycle; pure correlation to the runtime turn stream. |
| Broadcast send result | CLI users and automation | Human output has one recipient row; JSON is `{from,results:[...]}` with ordered per-target successes or errors. Preflight failure produces no deliveries; runtime partial failure exits non-zero after attempting later targets. |
| Inbox read contract | pi watcher, daemon, pull CLI | List durable unread envelopes; publish read markers only after the owning consumer outcome; marked history is skipped across ticks/reloads. |
| Receipt persistence | pull CLI, daemon | Atomic `appendOnce(receipt-envelope:<envelopeId>)` happens before `markRead`; retries reuse the event and finish the marker. |
| Watchdog pure contract | daemon manager, compact seams, CLI/tests | `effectiveWatchdog`, `reconcileWatchdogExemption`, `applyWatchdogExemption`, `isFireDue`, `evaluateResponse`, `buildWatchdogTurn`, `captureSlice`, `applyCompactPause`, `applyWorkingTransition`, and `applyWatchdogResume`; reconciliation pins `deadline-1` live and `deadline` re-armed, and descriptor activity is an input, never an event-log read. |
| Error codes | CLI surface (workshop 001) | `E-NOID/E-SELF/E-CMD/E-DEAD/E-NOREG/E-ARG/E-AMBIG`; duplicate/colliding native identity mappings fail as `E-AMBIG`. |

## Boundary Owns

- Peer registry descriptor vocabulary + durable native-identity binding + discovery/self-resolution rules.
- Memorable primary-id sequence, collision retry, legacy opaque-id preservation, and reservation ownership.
- Structural-parent, repository-selection, tree/filter/link, and current/old-prime projection semantics.
- Event stream shape (seq+timestamp), filtering, and age/stall semantics.
- State + liveness verdict taxonomy (vocabulary aligned with `agent-workbench`).
- Fire-and-forget message framing + delivery-receipt lifecycle.
- Immutable inbox envelopes, atomic read markers, SQLite delivery/retirement state, and push/pull delivery ownership.
- Ordered one-to-many text fan-out, all-target preflight, per-recipient outcomes, and multi-message wait completion.
- Remote-command allow-list.
- Whole-life watchdog vocabulary, pure scheduling/response/pause/capture decisions, and self-teaching turn text.
- The six port contracts the adapters implement.

## Boundary Excludes

- The pi runtime SDK details (event hooks, `sendUserMessage`, `compact`) — isolated in `adapters/pi-runtime.ts` (Phase 3).
- Filesystem layout/atomic-write mechanics of `~/.pij/` — `adapters/` (Phase 2).
- Process argv/stdout wiring and imperative polling timers — the top-level `pij` CLI; the pure messaging grammar, dispatch, and result contracts remain owned here.
- Pi command/tool/UI registration — belongs to `agent-tooling-interface`.
- Generator/smoke/self-check orchestration — belongs to `extension-authoring-harness`.

## Dependencies

### This Domain Depends On

| Domain / System | Type | Contract Used |
|-----------------|------|---------------|
| pi runtime | consume (Phase 3 only, via `PiRuntimePort`) | `isIdle()`, steer/immediate inject, `compact()`, input/turn lifecycle events. |
| `extension-authoring-harness` | consume | `just new` generator, vitest, Biome, self-check, retros, difficulty ledger. |
| `agent-workbench` | align vocabulary | `active/stale/dead` liveness + working-state names (no code reuse). |

### Domains That Depend On This

| Domain | Contract Used |
|--------|---------------|
| `agent-tooling-interface` | (future) `pij` command/CLI surface + self-announce text. |

## History

| Plan | Change | Date |
|------|--------|------|
| 014-pi-session-messaging / Phase 1 | Created `pij-messaging` domain; pi-free core (8 modules) + fake adapters + 50 unit tests; ports incl. `EventLogPort.lastSeq/count`; receipts (finding 08) + self-resolution (finding 07) modelled pure. | 2026-06-16 |
| 014-pi-session-messaging / Phases 2–5 | Shipped the domain end-to-end: fs adapters (registry/event-log/channel/process/pi-runtime); the `PijSession` coordinator + thin `index.ts` extension (boot announce, capture, inbound serve, receipts); the `pij` CLI (6 verbs, exit codes, `PIJ_HOME` override); two-peer integration smoke (AC-1..11+13) in CI + the Driver `/pij` smoke; report-only `npm audit` in CI; `docs/how/pij.md` + README + AGENTS.md self-announce + `npm link` PATH. Single-pi-importer invariant holds (`index.ts` + `adapters/pi-runtime.ts` only). | 2026-06-16 |
| 019-pij-tmux-control-plane / T029 | Added presence-independent native identity records, deterministic harness-scoped candidate ids, Pi exact native-id persistence, and durable-field-preserving session boot. | 2026-07-11 |
| 037-pij-broadcast / Phase 1 | Added repeatable `--to` text fan-out with ordered all-target preflight, independent recipient results, continued delivery after partial runtime failure, and terminal-set receipt waiting. | 2026-07-11 |
| 038-pij-prime-designation | Added optional `SessionDescriptor.prime`, `filterPrime`, `pij list --prime`, ordinary-list `P` visibility, and JSON `prime:boolean` compatibility. | 2026-07-11 |
| 040-memorable-pij-session-ids | New identities now use collision-safe two-word primary ids; exact native and legacy opaque identities reuse their stored id, and `prime` survives allocation, snapshots, and reattachment. | 2026-07-11 |
| 041-pij-inbox-no-tmux | Added `InboxPort`, immutable `msg-*` plus atomic `read-*`, ambient pull registration/`pij inbox --wait`, durable receipt-event convergence, and post-outcome tmux/pi read ownership. | 2026-07-12 |
| 046-pij-real-trees | Added tri-state structural parents, canonical Git common-directory identity, repository/global/subtree forests, composable filters, no-write link validation, iterative deep/cycle-safe rendering, and additive old-prime projection while preserving `spawnedBy` close ownership. | 2026-07-13 |
| 055-pij-watchdog | Added additive sidecar/descriptor contracts and the pure default/schedule/pause/response/turn/capture core consumed by daemon-owned supervision and watchdog CLI projections. | 2026-07-17 |
| 059-detection-integrity / Phase 2 | Replaced permanent `exempt` safety-off state with a 60-minute default, durable absolute deadline, legacy normalization, and exact-boundary re-arm contract. | 2026-07-20 |
| 060-state-model-v2 | Added `pij state clear`: an auditable assignment-scoped declaration removal that preserves task/runtime truth and never extends semantic vocabulary. | 2026-07-20 |
| 059-detection-integrity / Phase 3 | Added evidence-classified terminal observations and bounded pre-launch expectations keyed by `spawnId`, including historical-vs-live reconciliation and no-show suppression on descriptor correlation. | 2026-07-20 |
