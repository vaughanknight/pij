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
`pij` CLI land in Phases 2–5.

## Source Locations

| Path | Role |
|------|------|
| `.pi/extensions/pij/core/types.ts` | Pi-free domain vocabulary: ids, roles, optional prime designation, state/liveness, descriptor, event/query, message, receipt, error codes, `Result` tagged union. |
| `.pi/extensions/pij/core/ports.ts` | Hexagonal port interfaces: `RegistryPort`, `EventLogPort` (`+lastSeq/count`), `DeliveryPort`, `PiRuntimePort`, `ProcessPort`. |
| `.pi/extensions/pij/core/seq.ts` | `SeqCounter` — strictly-monotonic allocator with crash-safe recovery from `lastSeq()`. |
| `.pi/extensions/pij/core/events.ts` | `buildEvent` (seq + ISO timestamp), `filterEvents` (since/type/last), `eventAgeMs`/`latestEventAgeMs`. |
| `.pi/extensions/pij/core/state.ts` | `isWorking`, `liveness` (active/stale/dead), `isStalled`; `STALE_AFTER_MS`. |
| `.pi/extensions/pij/core/commands.ts` | Remote-command allow-list (`compact`) + `validateCommand`. |
| `.pi/extensions/pij/core/discovery.ts` | `deriveSelfId`/`deriveHarnessPijId`, `filterByFolder`, `filterPrime`, `excludeSelf`, `resolveSelf` (PIJ_SESSION_ID → lone-local → `E-AMBIG`). |
| `.pi/extensions/pij/core/message.ts` | `frame`/`parseFrame` (`[pij from <id>] …`), `roleLabel`, boot `announceText`. |
| `.pi/extensions/pij/core/receipts.ts` | `MessageReceipt` model + `classifyOnInject`/`initialReceipt`/`markDelivered`/`correlateDeliveredAt`. |
| `.pi/extensions/pij/core/cli.ts` | Send grammar, ordered broadcast preflight/fan-out/result projection, and target/message wait correlation. |
| `.pi/extensions/pij/adapters/fakes.ts` | In-memory implementations of all five ports (Pattern P8: tests target these). |
| `.pi/extensions/pij/core/*.test.ts`, `adapters/fakes.test.ts` | Unit coverage for every core module + fakes (50 tests). |
| `.pi/extensions/pij/index.ts` | Extension wiring — **stub in Phase 1**; real registry write + announce + delivery + capture land in Phase 3. |

## Concepts

| Concept | Description | Contract |
|---------|-------------|----------|
| Session descriptor | Live presence/attachment data used to find and address a session. | `SessionDescriptor` — written to `~/.pij/<id>.json`; runtime fields may be refreshed without replacing durable identity/history. |
| Prime designation | Optional honor-system marker consumed by orchestration and list filters. | `SessionDescriptor.prime?: boolean`; only explicit `true` is prime, while `false` and legacy absence are not. |
| Durable native identity | The same exact native session recovers the same pij-id and metadata after descriptor removal or machine restart. | Two-way `FsRegistry` ownership records keyed by native tuple and pij-id, with durable descriptor snapshots and no-replace publication; Pi persists its exact native id. |
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

## Contracts

| Contract | Consumer | Shape / Guarantee |
|----------|----------|-------------------|
| `Result<T>` | whole core, CLI, tests | Tagged union `{ok:true,value}` / `{ok:false,code,message}` (Pattern P4 — no throws). |
| Five ports | Phase 2/3 adapters, tests | `RegistryPort`, `EventLogPort(+lastSeq/count)`, `DeliveryPort`, `PiRuntimePort`, `ProcessPort`. Only `PiRuntimePort`'s real adapter imports pi. |
| `PijEvent` + `EventQuery` | event log adapter, `pij tail` | seq+ISO-timestamp lines; filters compose deterministically. |
| `MessageReceipt` + correlation | Phase 3 receiver wiring, `pij send` | queued/delivered lifecycle; pure correlation to the runtime turn stream. |
| Broadcast send result | CLI users and automation | Human output has one recipient row; JSON is `{from,results:[...]}` with ordered per-target successes or errors. Preflight failure produces no deliveries; runtime partial failure exits non-zero after attempting later targets. |
| Error codes | CLI surface (workshop 001) | `E-NOID/E-SELF/E-CMD/E-DEAD/E-NOREG/E-ARG/E-AMBIG`; duplicate/colliding native identity mappings fail as `E-AMBIG`. |

## Boundary Owns

- Peer registry descriptor vocabulary + durable native-identity binding + discovery/self-resolution rules.
- Prime filter/projection semantics on the shared descriptor and `pij list`.
- Event stream shape (seq+timestamp), filtering, and age/stall semantics.
- State + liveness verdict taxonomy (vocabulary aligned with `agent-workbench`).
- Fire-and-forget message framing + delivery-receipt lifecycle.
- Ordered one-to-many text fan-out, all-target preflight, per-recipient outcomes, and multi-message wait completion.
- Remote-command allow-list.
- The five port contracts the adapters implement.

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
