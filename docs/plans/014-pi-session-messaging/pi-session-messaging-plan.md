# pij — Session Messaging & Observability — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-06-16
**Spec**: [pi-session-messaging-spec.md](./pi-session-messaging-spec.md)
**Status**: READY

## Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No critical `[NEEDS CLARIFICATION]`. Round-1 defaults recorded in spec `## Clarifications` (flagged, non-blocking). |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`. |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md` (project-rules are harness/agent-harness docs). |
| G4 | ADR Compliance | N/A | No `docs/adr/`. |
| G5 | Structure | PASS | All required sections present and populated. |
| G6 | Testing Alignment | PASS | Spec strategy = Hybrid: Phase 1 is tests-first (TDD core); every later phase has a validation task. |
| G7 | Domain Completeness | PASS | All 4 spec domains in Target Domains; NEW `pij-messaging` has a setup task (1.1); Manifest covers every file in task tables. |

## Summary

Build `pij`: two live, interactive pi sessions converse in near-realtime and one
(**parent**, expensive reviewer) observes the other (**worker**, cheaper generator).
The approach is hexagonal — a pure, pi-free core (session identity, monotonic `seq`,
timestamped events, state machine, command allow-list, discovery) behind ports, with
fs/process/pi adapters, wired by two entry points (a pi extension that receives/serves,
a `pij` CLI that acts). Messaging is fire-and-forget + self-identifying (the `from` id
rides in every message); observability is a per-session `events.ndjson` with `seq` +
ISO-8601 `timestamp` that a peer follows incrementally (`tail --since`) with built-in
age/stall detection. The load-bearing inject primitive (`sendUserMessage` idle/steer)
is already proven by the phase-1 scratch prototype, which Phase 3 graduates.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `pij-messaging` | **NEW** | create | Owns the registry format, delivery-channel protocol, `events.ndjson`+`seq`+`timestamp` contract, state/liveness model, command allow-list, and the `pij` CLI. |
| `pi runtime` | existing | consume | `sendUserMessage`/`isIdle`/`compact` + lifecycle events; no changes. |
| `extension-authoring-harness` | existing | consume | `just new` scaffold, vitest, Driver SDK smoke, Biome, self-check, CI. |
| `agent-tooling-interface` | existing | consume | The `pij` CLI is a model-/operator-facing surface; aligns with ATI conventions. Reuses `agent-workbench` liveness vocabulary (`active/stale/dead`). |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `docs/domains/pij-messaging/domain.md` | pij-messaging | contract | New domain doc (boundary, contracts, concepts). |
| `.pi/extensions/pij/core/types.ts` | pij-messaging | contract | Event/message/command/descriptor/state types + tagged-union results. |
| `.pi/extensions/pij/core/ports.ts` | pij-messaging | contract | `RegistryPort`/`EventLogPort`/`DeliveryPort`/`PiRuntimePort`/`ProcessPort`. |
| `.pi/extensions/pij/core/seq.ts` | pij-messaging | internal | Monotonic seq assignment (line-count derived + counter). |
| `.pi/extensions/pij/core/events.ts` | pij-messaging | internal | Event record build (seq+timestamp), filter (`--since`/`--type`/present-minus-N), age. |
| `.pi/extensions/pij/core/state.ts` | pij-messaging | internal | State machine + liveness verdict (active/stale/dead). |
| `.pi/extensions/pij/core/commands.ts` | pij-messaging | internal | Command allow-list (`compact`) + resolution. |
| `.pi/extensions/pij/core/discovery.ts` | pij-messaging | internal | Descriptor build + folder-filter (`--here`) + self-exclusion. |
| `.pi/extensions/pij/core/message.ts` | pij-messaging | internal | `[pij from <id>] …` framing + self-announce/role text. |
| `.pi/extensions/pij/core/receipts.ts` | pij-messaging | internal | `MessageReceipt` (`queued|delivered`) model + steered-delivery correlation (next turn_start after input(steer)). |
| `.pi/extensions/pij/adapters/fs-registry.ts` | pij-messaging | internal | `~/.pij/<id>.json` descriptor read/write/scan. |
| `.pi/extensions/pij/adapters/event-log.ts` | pij-messaging | internal | `~/.pij/<id>/events.ndjson` append/read (offset+seq+type). |
| `.pi/extensions/pij/adapters/channel.ts` | pij-messaging | internal | fs.watch delivery channel (atomic tmp→copy, debounce/dedupe). |
| `.pi/extensions/pij/adapters/process.ts` | pij-messaging | internal | pid probe + clock (liveness). |
| `.pi/extensions/pij/adapters/pi-runtime.ts` | pij-messaging | cross-domain | Only file importing `@earendil-works/*` — wraps `sendUserMessage`/`isIdle`/`compact`. |
| `.pi/extensions/pij/adapters/fakes.ts` | pij-messaging | internal | In-memory fakes for all ports (test seam). |
| `.pi/extensions/pij/index.ts` | pij-messaging | internal | Extension entry: boot announce/role, event capture, delivery injector, command exec, shutdown cleanup. |
| `.pi/extensions/pij/cli.ts` | pij-messaging | contract | `pij` bin: whoami/list/send/tail/state/path over the same core+adapters. |
| `.pi/extensions/pij/*.test.ts` | pij-messaging | internal | vitest against fakes + tmp-fs. |
| `harness/scripts/smoke-pij.ts` (or Driver scenario) | extension-authoring-harness | cross-domain | Two-window end-to-end smoke. |
| `docs/how/pij.md` | pij-messaging | internal | CLI reference + protocol + parent/worker workflow + AGENTS.md snippet. |

Classification: `contract` (public interface), `internal` (domain-internal), `cross-domain` (touches another domain).

## Key Findings

*(Synthesised from `research-dossier.md`, workshops 001/002, and the proven phase-1 prototype — no subagent re-discovery needed; all sources are in-hand.)*

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Turn-submission primitive is **proven**: `sendUserMessage(text)` idle→turn, `{deliverAs:"steer"}` busy→queue. | Graduate `scratch/messenger_test/messenger.ts` inject logic verbatim into `adapters/pi-runtime.ts` + `index.ts`; do not redesign. |
| 02 | Critical | minih has **no per-event seq** and we require seq **and** ISO-8601 timestamp per line (spec AC-7/7a). | pij owns assignment: `seq` = persisted counter validated against line-count (crash-safe, derivable on reload); `timestamp` stamped at append. |
| 03 | High | `fs.watch` is flaky on file targets. | Watch the **directory**; writers do atomic tmp→`copyFileSync`; reader debounces + dedupes by message id (proven in prototype). |
| 04 | High | `agent-workbench` (AW) domain already owns Minih liveness/state vocabulary (`idle/in-progress/…`, watcher cleanup, pid liveness). | Reuse the `active/stale/dead` verdict + state names for consistency; pij owns its own **peer registry** (AW reads Minih runs — different source). No code reuse, vocabulary alignment only. |
| 05 | High | Remote commands are a shell-free **allow-list** (`compact` only); `from` id is self-asserted. | `core/commands.ts` is a tiny name→pi-action map; reject unknowns (`E-CMD`); document the trust limitation in `docs/how/pij.md`. |
| 06 | High | Data must live where a peer process can read it without project access; seq must survive `/reload`. | Store under `~/.pij/<id>/{events.ndjson,state.json}` + `~/.pij/<id>.json` descriptor; counter persisted in the run dir. |
| 07 | High | **Self-identification across a shared cwd**: parent + worker run in the *same* folder, so the CLI cannot resolve "which session am I" from cwd alone (`whoami`, `from`-stamping break). | Extension exports `PIJ_SESSION_ID` (+`PIJ_ROLE`) into the session **process env** at boot; child `pij` invocations inherit it. CLI resolves self from the env var; falls back to cwd registry scan only when exactly one local session exists, else errors `E-AMBIG`. |
| 08 | High | **Delivery receipts observable** (proven in `scratch/receipt_test/`): `input.streamingBehavior` (`null`=idle, `"steer"`=busy) classifies queued-vs-immediate at +0ms; delivery of a steered message = the **next `turn_start`** (incremented turnIndex) after the in-flight `turn_end` — **no `before_agent_start` fires for a steered inject**. | Add a `MessageReceipt` (`queued|delivered`) to core; receiver emits receipts back as ordinary pij messages; correlate steered delivery FIFO to the preceding `input(steer)`. Open: multiple-steer batching. |

## Phases

### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | Domain + pure core + ports + fakes | pij-messaging | TDD the pi-free core (identity, seq, events+timestamp, state/liveness, commands, discovery, message framing) behind ports. | None |
| 2 | Adapters | pij-messaging | Real fs/process/pi adapters implementing the ports (registry, event-log, channel, process, pi-runtime). | Phase 1 |
| 3 | pij extension (receive + serve) | pij-messaging | Wire core+adapters into the pi extension: boot announce/role, event capture, idle/steer injector, command exec, shutdown cleanup. | Phase 2 |
| 4 | pij CLI (act + observe) | pij-messaging | `pij` bin: whoami/list/send(+--command)/tail(--since/--type/--lines/--follow)/state/path. | Phase 2 |
| 5 | Smoke + CI + docs | extension-authoring-harness | Two-window Driver smoke, GitHub Actions, README + `docs/how/pij.md`, self-check. | Phases 3,4 |

> No "Phase 0: Establish Backpressure" — `backpressure-coverage.md` was not produced (post-spec seam not run); its absence is non-blocking and changes nothing.

---

#### Phase 1: Domain + pure core + ports + fakes

**Objective**: Stand up the NEW domain and a fully unit-tested, pi-free core behind ports.
**Domain**: pij-messaging
**Delivers**: domain doc + registry/map entries; `core/{types,ports,seq,events,state,commands,discovery,message}.ts`; `adapters/fakes.ts`; passing vitest suite.
**Depends on**: None
**Key risks**: seq crash-safety design (finding 02); getting the state/liveness verdict aligned with AW vocabulary (finding 04).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.0 | **Harness pre-flight** — `/eng-harness-flow --event pre-implement --phase "Phase 1" --plan-dir docs/plans/014-pi-session-messaging` | — | Router envelope handled; verdict narrated verbatim before code | Harness seam |
| 1.1 | Create domain: `docs/domains/pij-messaging/domain.md` (boundary/contracts/§Concepts), source dir `.pi/extensions/pij/`, registry entry, domain-map node + edges (consume→pi runtime, harness; align→AW) | pij-messaging | Domain doc + registry + map updated; `just new`-style T2 layout scaffolded | NEW-domain setup (G7) |
| 1.2 | **Tests first**: spec the core — seq monotonicity+crash recovery, event build (seq+ISO timestamp) + filters (`--since`/`--type`/present-minus-N) + age, state machine transitions, liveness verdict (active/stale/dead), command allow-list, discovery folder-filter + self-exclusion, message framing | pij-messaging | Failing vitest covering findings 01–05 acceptance | TDD (G6) |
| 1.3 | Define `core/ports.ts` + `core/types.ts` (tagged-union results P4; structural entry types P6) | pij-messaging | Ports compile; no `@earendil-works` import in `core/` (P2) | |
| 1.4 | Implement `core/{seq,events,state,commands,discovery,message}.ts` to green | pij-messaging | All 1.2 tests pass; constants colocated (P5) | Per findings 02,04,05 |
| 1.5 | Implement `adapters/fakes.ts` (in-memory all ports) | pij-messaging | Core services testable with zero I/O (P8) | Mock-free seam |
| 1.z | **Harness phase-end** — `/eng-harness-flow --event phase-end --plan-dir docs/plans/014-pi-session-messaging` | — | Router envelope handled at phase end | Harness seam |

#### Phase 2: Adapters

**Objective**: Implement the real fs/process/pi adapters against the Phase-1 ports.
**Domain**: pij-messaging
**Delivers**: `adapters/{fs-registry,event-log,channel,process,pi-runtime}.ts` + adapter tests (tmp-fs, real `fs.watch`).
**Depends on**: Phase 1
**Key risks**: fs.watch reliability (finding 03); seq persistence across reload (finding 02/06).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.0 | **Harness pre-flight** — `/eng-harness-flow --event pre-implement --phase "Phase 2" --plan-dir docs/plans/014-pi-session-messaging` | — | Verdict narrated verbatim | Harness seam |
| 2.1 | `adapters/fs-registry.ts` — write/read/scan `~/.pij/<id>.json` descriptors | pij-messaging | tmp-fs test: write→scan returns descriptor; stale-file tolerated | Finding 06 |
| 2.2 | `adapters/event-log.ts` — append (seq counter + ISO timestamp) + read (byte offset, `--since`, `--type`) over `~/.pij/<id>/events.ndjson` | pij-messaging | tmp-fs test: append N, read since K returns >K only; seq monotonic after simulated reload | Findings 02,06 |
| 2.3 | `adapters/channel.ts` — atomic tmp→copy write + dir `fs.watch` read w/ debounce+dedupe | pij-messaging | tmp-fs test: rapid writes all delivered once, ordered | Finding 03 (proven path) |
| 2.4 | `adapters/process.ts` — pid liveness probe + clock | pij-messaging | test: live pid→alive, bogus pid→dead | Finding 04 |
| 2.5 | `adapters/pi-runtime.ts` — wrap `sendUserMessage`(idle/steer)/`isIdle`/`compact` (only pi-importing file) | pij-messaging | typecheck against shipped `types.d.ts`; logic lifted from prototype | Finding 01 |
| 2.z | **Harness phase-end** — `/eng-harness-flow --event phase-end --plan-dir docs/plans/014-pi-session-messaging` | — | Envelope handled | Harness seam |

#### Phase 3: pij extension (receive + serve)

**Objective**: The pi extension that announces, captures its own events, receives messages/commands, and serves discovery.
**Domain**: pij-messaging
**Delivers**: `.pi/extensions/pij/index.ts` wiring core+adapters to the pi ExtensionAPI.
**Depends on**: Phase 2
**Key risks**: one `session_start` for all reasons (P10); injector must match the proven idle/steer behaviour exactly (finding 01).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.0 | **Harness pre-flight** — `/eng-harness-flow --event pre-implement --phase "Phase 3" --plan-dir docs/plans/014-pi-session-messaging` | — | Verdict narrated verbatim | Harness seam |
| 3.1 | `session_start` (all reasons, P10): assign/lookup id, write registry descriptor, init event-log + state, watermark existing channel ids | pij-messaging | On boot, `~/.pij/<id>.json` + run dir exist; reload doesn't duplicate | P10 |
| 3.2 | Boot self-announce + role injection (PARENT/WORKER param) via `sendUserMessage` | pij-messaging | New session receives the announce text (workshop 001) with its id + role | AC-2 |
| 3.3 | Event capture: append pi events (tool_call/tool_result/message/usage) to `events.ndjson` (+seq,+timestamp) | pij-messaging | Activity produces ordered, timestamped events | AC-7/7a |
| 3.4 | Delivery injector: watch channel → frame `[pij from <id>] …` → idle→send / busy→steer | pij-messaging | idle path immediate; busy path steers after turn (matches prototype) | AC-3/4, finding 01 |
| 3.5 | Command exec: allow-listed `compact` → `ctx.compact()`; reject unknown | pij-messaging | `--command compact` compacts; unknown rejected before pi call | AC-6, finding 05 |
| 3.6 | `session_shutdown`: close watchers, clear/flag descriptor | pij-messaging | No leaked watchers; `pij list` no longer shows it as active | P-cleanup |
| 3.7 | Export `PIJ_SESSION_ID` (+`PIJ_ROLE`) into the session **process env** at boot so child `pij` CLI invocations resolve "self" unambiguously when two sessions share a cwd | pij-messaging | A `pij whoami` run from inside the session returns *this* session's id even with a sibling in the same folder | **Finding 07** (HIGH) |
| 3.8 | Emit **delivery receipts**: on inject classify via `input.streamingBehavior` (→ `delivered` idle / `queued` busy); watch the next `turn_start` after an `input(steer)` → emit `delivered`; send each receipt back to the sender as an ordinary pij message | pij-messaging | Sender of a busy-peer message receives `queued` then `delivered`; idle-peer message receives a single `delivered` | **Finding 08**; AC-13; uses `core/receipts.ts` |
| 3.z | **Harness phase-end** — `/eng-harness-flow --event phase-end --plan-dir docs/plans/014-pi-session-messaging` | — | Envelope handled | Harness seam |

#### Phase 4: pij CLI (act + observe)

**Objective**: The `pij` Node CLI — the working surface for agents/humans.
**Domain**: pij-messaging
**Delivers**: `.pi/extensions/pij/cli.ts` + `bin`/justfile wiring; per-command tests against fakes.
**Depends on**: Phase 2 (shares core+adapters; can proceed parallel to Phase 3)
**Key risks**: output/JSON shape stability (workshop 001 open Q); exit/error codes.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.0 | **Harness pre-flight** — `/eng-harness-flow --event pre-implement --phase "Phase 4" --plan-dir docs/plans/014-pi-session-messaging` | — | Verdict narrated verbatim | Harness seam |
| 4.1 | `pij whoami` + `pij list [--here]` (+`--json`) | pij-messaging | `whoami` resolves self via `PIJ_SESSION_ID` (fallback: lone cwd session; else `E-AMBIG`); `list` shows peers w/ id/state/liveness, `--here` filters, self marked | AC-1, finding 07, workshop 001 |
| 4.2 | `pij send <id> "<text>"` + `--command <name>` (stamps `from`, writes channel; warn-on-stale, block-on-dead). Surfaces the live **receipt** to the sender (`delivered`, or `queued`→`delivered`) | pij-messaging | Message reaches peer channel; `from` id stamped; receipt shown; codes E-NOID/E-SELF/E-CMD/E-DEAD | AC-3/5/6/13 |
| 4.3 | `pij tail <id> --since N --type T --lines N --follow` (+`--json`) with `age` column + next-since trailer | pij-messaging | `--since` returns >N only; `--type` filters; present-minus-N; age rendered | AC-8/7a |
| 4.4 | `pij state <id>` (+`--json`): state + liveness + latest-event age | pij-messaging | working/static + active/stale/dead + age reported without stream parse | AC-9/10 |
| 4.5 | `pij path <id> [--events\|--state\|--dir]` | pij-messaging | Prints correct on-disk paths for direct file read | AC-11 |
| 4.z | **Harness phase-end** — `/eng-harness-flow --event phase-end --plan-dir docs/plans/014-pi-session-messaging` | — | Envelope handled | Harness seam |

#### Phase 5: Smoke + CI + docs

**Objective**: Prove the two-window path end-to-end, gate it in CI, and document the protocol.
**Domain**: extension-authoring-harness (+ pij-messaging docs)
**Delivers**: Driver smoke scenario, GitHub Actions workflow, README section, `docs/how/pij.md`, green self-check.
**Depends on**: Phases 3,4

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 5.0 | **Harness pre-flight** — `/eng-harness-flow --event pre-implement --phase "Phase 5" --plan-dir docs/plans/014-pi-session-messaging` | — | Verdict narrated verbatim | Harness seam |
| 5.1 | Two-window smoke (Driver SDK): boot A+B, `pij list --here` sees both, `send` idle+busy, `--command compact`, `tail --since`, `state` | extension-authoring-harness | Scenario passes deterministically | AC-1..11 end-to-end |
| 5.2 | GitHub Actions CI: typecheck→lint(Biome)→test(vitest)→npm audit | extension-authoring-harness | CI green on PR | AC-12 |
| 5.3 | Docs: README "pij" quick start + `docs/how/pij.md` (CLI ref, protocol, parent/worker workflow, AGENTS.md self-announce snippet) | pij-messaging | Fresh agent can act from the announce + doc | Workshops 001/002 |
| 5.4 | `just self-check` green; update `docs/domains/registry.md` + `domain-map.md` history | pij-messaging | self-check exit 0 | Closeout |
| 5.z | **Harness phase-end** — `/eng-harness-flow --event phase-end --plan-dir docs/plans/014-pi-session-messaging` | — | Envelope handled | Harness seam |

## Acceptance Criteria

- [ ] **AC-1 Discovery**: two pij sessions in one folder → `pij list --here` lists both (id, folder, state, data-dir).
- [ ] **AC-2 Boot announce**: session start injects the session's id + how-to-use text; snippet present in AGENTS.md.
- [ ] **AC-3 Message (idle)**: `pij send <id> "hi"` to idle session injects `[pij from <senderId>] hi` and triggers a turn.
- [ ] **AC-4 Message (busy)**: same send to a streaming session delivers via steer after the turn (no mid-stream interrupt).
- [ ] **AC-5 Reply no-lookup**: received message exposes the sender id → `pij send <senderId> "…"` reaches the sender.
- [ ] **AC-6 Command**: `pij send <id> --command compact` compacts the target via `ctx.compact()`; unknown names rejected.
- [ ] **AC-7 Event stream**: `events.ndjson` records activity with strictly monotonic `seq` **and** ISO-8601 `timestamp`.
- [ ] **AC-7a Stall detection**: `tail`/`state` surface latest-event age; `working` + stale newest event is detectable without external timing.
- [ ] **AC-8 Incremental follow**: `tail --since N` returns only `seq>N`; `--type` filters; present-minus-N works.
- [ ] **AC-9 State**: `pij state <id>` reports working/static + latest-event age without stream parse.
- [ ] **AC-10 Liveness**: crashed→`dead` (pid gone), quiet-but-alive→`stale`, active→`active`.
- [ ] **AC-11 Direct path**: `pij path <id>` prints the readable `events.ndjson`/data-dir path.
- [ ] **AC-12 Quality gates**: typecheck, Biome lint, vitest, npm audit, two-window smoke all green in CI.
- [ ] **AC-13 Delivery receipts**: sender gets `delivered` (idle peer) or `queued`→`delivered` (busy peer) receipts; visible in `pij tail`/`state`. Grounded in `scratch/receipt_test/` (input.streamingBehavior + next turn_start).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `fs.watch` misses/duplicates events | Med | High | Dir-watch + atomic tmp→copy + debounce/dedupe (proven in prototype); smoke covers rapid sends. |
| `seq` non-monotonic across `/reload` | Med | High | Persisted counter validated against line-count on init; tested in 2.2 with simulated reload. |
| Inject path diverges from proven prototype | Low | High | Lift `messenger.ts` logic verbatim into `pi-runtime.ts`/`index.ts`; smoke re-proves idle+steer. |
| Liveness false-positive (alive read as dead) | Low | Med | pid probe + lastEventAt window (AW vocabulary); `stale` distinct from `dead`. |
| Remote-command surface abused | Low | High | Hard allow-list (`compact`); no shell; `from` self-asserted limitation documented. |
| CLI/extension core drift | Low | Med | Single shared `core/` imported by both entry points (one source of truth). |
| Shared-cwd self-identification (parent+worker same folder) | Med | High | Extension exports `PIJ_SESSION_ID` into session env; CLI resolves self from it, `E-AMBIG` when unset + multiple local (finding 07, task 3.7/4.1). |
| Receipt correlation under multiple queued steers | Low | Med | v1 correlates each `delivered` to the next `turn_start` after an `input(steer)`; if N steers batch into one turn, receipts may coalesce. Test with N rapid triggers; document if batching observed (finding 08). |

## Harness Seams

- **Entry point**: `/eng-harness-flow --event <seam> [--phase <id>] [--plan-dir <p>] --json` — the single door to the engineering harness; child skills are private and never named here.
- **Backpressure** (post-spec seam): not run for this plan — no `backpressure-coverage.md`; absence is non-blocking, no Phase 0 folded in.
- **Pre-implement** (`--event pre-implement`): fired by the implement verb at each phase start (the `N.0` rows); verdicts narrated verbatim (`healthy / SLOW / UNHEALTHY / UNAVAILABLE`). `UNAVAILABLE` falls back to standard testing.
- **Phase end** (`--event phase-end`): fired at each phase seam (the `N.z` rows); `--event plan-complete` fires at merge.
- **Best-effort**: every seam is advisory and never blocks; the router decides what the harness does.

---

## Validation Record (2026-06-16)

### Validation Thesis

**Raison d'être**: Give a worker/implementer an implementation-ready, domain-aware phased plan to build pij (peer messaging + observability) without re-deriving design — grounded in the spec, workshops 001/002, and the proven phase-1 prototype.

**Value claim**: Implementation is cheaper and safer because phases, domains, files, ACs, and risks are explicit and tied to proven prior art (the inject primitive already works).

**Artifact promise**: The tasks stage can expand each phase into a task dossier and the implement stage can build with minimal clarification; every spec AC maps to a task.

**Intended beneficiaries**: implementing agent(s), the parent reviewer, future maintainers.

**Proof target**: Implementation.

**Evidence standard**: each spec AC → a phase task; NEW domain has a setup task; Domain Manifest covers every file in task tables; testing tasks align with the spec's Hybrid/TDD strategy.

**Thesis source**: `pi-session-messaging-spec.md` + `workshops/001`,`002` + `research-dossier.md`.

**Thesis verdict**: Advanced.

**Main thesis risk**: Phase 1 bundles domain setup + 8 core files + tests — the largest phase; the tasks stage should decompose it carefully.

---

| Agent (lens, inline) | Lenses Covered | Issues | Verdict |
|---|---|---|---|
| Coherence | phase order, dependencies, deliverables | 0 | ✅ |
| Risk & Security | risk↔finding cross-ref, command allow-list, privacy | 0 (allow-list + self-asserted `from` documented) | ✅ |
| Completeness / CS challenge | AC testability, phase size, CS | 1 MEDIUM (Phase 1 size) open | ⚠️ |
| Domain Boundaries | NEW-domain setup, manifest, registry alignment | 0 (G7 PASS) | ✅ |
| Thesis Alignment | thesis drift, proof-level fit, evidence | 0 | ✅ |
| Forward-Compatibility | tasks/implement consumers, self-id contract | 1 HIGH fixed | ⚠️→✅ |

**Lens coverage**: 11/15 (Thesis Alignment ✓, Forward-Compatibility ✓, Coherence, Risk, Completeness, Domain Boundaries, Evidence Sufficiency, Proof-Level Fit, Hidden Assumptions, Security & Privacy, Deployment/Ops).

### Thesis Verdict

- **Thesis understood?** Yes
- **Thesis source**: spec + workshops + dossier
- **Value claim advanced?** Yes
- **Proof level**: Target = Implementation; Actual = Implementation
- **Evidence quality**: Strong (every AC mapped; primitive proven)
- **Main thesis risk**: Phase 1 is the heaviest phase; decompose at the tasks stage.

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| Tasks stage (`5 tasks --phase "Phase N: Title"`) | Stable phase titles + per-phase task tables with success criteria | shape mismatch | ✅ | Phase Index + per-phase tables present, titles unambiguous |
| Implement stage (`6 implement`) | Files + ACs + testing approach per phase | contract drift | ✅ | Domain Manifest + AC list + G6-aligned test tasks |
| `pij` CLI (separate process) | Resolve own session id when parent+worker share a cwd | encapsulation lockout | ✅ (fixed) | Finding 07 + task 3.7/4.1: `PIJ_SESSION_ID` env export; `E-AMBIG` fallback |
| Harness router | Pre-implement/phase-end seams visible per phase | lifecycle ownership | ✅ | `N.0`/`N.z` rows + Harness Seams section |

**Thesis alignment**: The plan advances the value claim (cheap, proven peer messaging + observability) at Implementation proof level; main risk is Phase 1's size, deferred to the tasks stage.

**Outcome alignment**: The plan, as written, advances the spec's North Star — *"parent (expensive) reviews/orchestrates while worker (cheaper) generates, followed incrementally via the event stream"* — by sequencing the proven inject primitive, the seq+timestamp event log, and the parent-facing CLI in dependency order.

**Standalone?**: No — downstream consumers (tasks + implement stages, the CLI process) exist and are satisfied above.

**Overall: VALIDATED WITH FIXES** — 1 HIGH (self-identification across shared cwd) found and fixed inline; 1 MEDIUM (Phase 1 size) recorded for the tasks stage; no open CRITICAL/HIGH.
