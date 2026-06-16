# pij — Session-to-Session Messaging & Observability

**Mode**: Full

## Research Context

📚 Specification incorporates findings from `research-dossier.md` and
`minih-prior-art.md`. Load-bearing primitive (`pi.sendUserMessage` idle/steer)
is **proven** via the phase-1 scratch prototype. minih supplies the event/state
data model (we add a per-event `seq` and drop its persisted inbox). Topology is
peer-to-peer (two interactive pi TUIs), not minih's spawn-and-own.

## Summary

**WHAT**: A system (`pij`) that lets two live, interactive pi sessions converse
in near-realtime and lets one session **observe** another's work. A **parent**
(expensive reviewer model — mostly input tokens) directs and reviews a **worker**
(cheaper generator model — output tokens), following the worker's event stream
incrementally and firing rapid feedback.

**WHY**: Cheap, fast, local agent-to-agent collaboration where the expensive
model reviews and the cheap model generates — without the parent re-ingesting the
whole worker context on every check.

Three subsystems: **discovery** (find peer sessions), **messaging**
(fire-and-forget, self-identifying injection + remote commands), **observability**
(per-session `events.ndjson` with `seq` + state/liveness).

## Goals

- Two pi sessions discover each other automatically via a shared `~/.pij/`
  registry, filterable by project folder path.
- A session can fire a message to another that is injected like human input —
  immediately if idle, via steering if busy.
- Messages carry the sender's id so the receiver can reply with zero lookup.
- A session can send a **remote command** to another; first command: `compact`.
- Each session records everything it does to `events.ndjson` with a monotonic
  `seq`, so a peer can follow incrementally (`--since`, `--type`, present-minus-N).
- A session exposes a **state** (working vs static) and **liveness** (alive /
  stale / dead) signal readable without parsing the event stream.
- A `pij` Node CLI is the working surface; `pij path <id>` enables direct reads.
- The whole thing is built hexagonally (ports/adapters + DI) with CI, vitest,
  Biome, and npm audit.

## Non-Goals

- **No request/response handshake or message acks** — messaging is fire-and-forget. (Delivery *receipts* in AC-13 are a one-way, best-effort `queued`/`delivered` signal the receiver volunteers; they are not a confirmation the sender waits on, and receipts themselves are not acked.) No persisted inbox / message history.
- **No headless RPC broker** — both peers are visible interactive pi TUIs.
- **No arbitrary remote code execution** — remote commands are a tiny allow-list.
- **No cross-machine networking** — local filesystem only (single host) for v1.
- **No automatic loop-prevention orchestration** — humans/agents drive the loop;
  `source:"extension"` guard is available but bidirectional auto-chat is out of scope.
- **No sender authentication / trust model** — `from` id is self-asserted (v1).

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| pij-messaging | **NEW** | **create** | Owns discovery, messaging, commands, event stream, state/liveness, the CLI. |
| pi runtime | existing | **consume** | Uses `sendUserMessage`/`isIdle`/`compact` + lifecycle events (no changes). |
| extension-authoring-harness | existing | **consume** | T2 scaffold, vitest, smoke (Driver SDK), Biome, self-check, CI. |
| agent-tooling-interface | existing | **consume** | Aligns with the existing agent-facing tool/command UX conventions. |

### New Domain Sketches

#### pij-messaging [NEW]
- **Purpose**: Peer-to-peer discovery, fire-and-forget messaging + remote
  commands, and an observable per-session event/state stream between live pi
  sessions, surfaced through the `pij` CLI.
- **Boundary Owns**: the `~/.pij/` registry format, the delivery-channel protocol,
  the `events.ndjson` + `seq` contract, the session state/liveness model, the
  command allow-list, and the CLI surface.
- **Boundary Excludes**: pi's turn engine (consumed via `PiRuntimePort`), the
  worker's actual task work (observed, not owned), any network transport, and
  durable message storage (explicitly out — fire-and-forget).

## Testing Strategy

- **Approach**: **Hybrid** — TDD for the pure core/services (seq assignment, state
  machine, discovery/folder-filter, command allow-list, message framing);
  lightweight tests for adapters; a **smoke scenario** (Driver SDK) for the
  two-window end-to-end path.
- **Rationale**: hexagonal core is pure and deterministic → high-value unit tests
  against fake adapters; the integration risk (fs.watch, pi injection) is covered
  by smoke.
- **Focus Areas**: seq monotonicity + crash safety; idle-vs-steer branch; channel
  atomic write / watch; `--since`/`--type` filtering; state transitions; liveness verdict.
- **Excluded**: pi internals; cross-machine; performance benchmarking.
- **Mock Usage**: **Avoid mocks — fake adapters / real fixtures only** (hexagonal
  ports make this natural).

## Documentation Strategy

- **Location**: **Hybrid** — README "pij" section (quick start) + `docs/how/pij.md`
  (CLI reference, protocol, parent/worker workflow, the AGENTS.md self-announce snippet).
- **Rationale**: agents need a discoverable protocol reference; humans need a quick start.

## Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=2, D=1, N=1, F=1, T=2  (sum 9)
- **Confidence**: 0.75
- **Assumptions**: single host; both peers run the pij extension; pi 0.79.x API stable.
- **Dependencies**: pi `ExtensionAPI` (`sendUserMessage`/`isIdle`/`compact`); node fs/process; pij harness.
- **Risks**: fs.watch flakiness; seq durability across `/reload`; liveness false-positives; command-surface security.
- **Phases** (provisional — architect finalizes):
  1. **Core + ports + fakes** — domain model, seq, state machine, command allow-list, discovery/filter (pure, fully unit-tested).
  2. **Adapters + extension** — fs registry/event-log/channel, pi-runtime adapter, the pij extension wiring (boot registry write + self-announce + delivery injector + event capture).
  3. **`pij` CLI** — list/send/cmd/tail/state/path over the same core + adapters.
  4. **Liveness + observability polish** — pid probe, state/liveness verdict, `--since`/`--type` filters, present-minus-N.
  5. **Smoke + CI + docs** — two-window smoke, GitHub Actions, README + docs/how/pij.md, self-check.

## Acceptance Criteria

1. **Discovery**: with two pij sessions running in the same folder, `pij list --here` lists both with id, folder path, state, and data-dir path.
2. **Boot self-announce**: on session start the extension injects a message naming the session's own id and how to use pij; the snippet is also present in AGENTS.md.
3. **Message (idle)**: `pij send <id> "hi"` to an idle session injects `[pij from <senderId>] hi` and triggers a response.
4. **Message (busy)**: the same send to a streaming session is delivered via steering after the current turn (no mid-stream interruption); the sender gets a `queued` then `delivered` receipt (see AC-13).
5. **Reply with no lookup**: a received message exposes the sender id such that `pij send <senderId> "..."` reaches the original sender.
6. **Remote command**: `pij send <id> --command compact` causes the target session to compact (via `ctx.compact()`); unknown command names are rejected (allow-list).
7. **Event stream + seq + timestamp**: a session's `events.ndjson` records its activity (tool_call/tool_result/message/usage at minimum); every line carries a strictly monotonic `seq` **and** an ISO-8601 `timestamp`, so a reader can compute each event's age and detect stalls directly from the stream (no separate clock).
7a. **Stall detection**: `pij tail`/`state` surface the age of the most recent event (now − latest `timestamp`); a worker with `state=working` but a stale newest event is detectable as a stall without external timing.
8. **Incremental follow**: `pij tail <id> --since <seq>` returns only events after `<seq>`; `--type tool_call` filters by type; present-minus-N shows the last N.
9. **State signal**: `pij state <id>` reports working vs static (idle/in-progress/…) plus the age of the latest event (derived from its `timestamp`), without the caller parsing the full event stream.
10. **Liveness**: a crashed/exited session is reported `dead` (pid gone); a quiet-but-alive one `stale`; an active one `active`.
11. **Direct path**: `pij path <id>` prints the session's `events.ndjson`/data-dir path, readable directly with file tools.
12. **Quality gates**: `just typecheck`, `just lint` (Biome), `just test` (vitest), npm audit, and the two-window smoke all pass in CI.
13. **Delivery receipts**: when a session sends a message, the sender receives `delivered` immediately if the peer was idle, or `queued` (peer busy/steered) followed by `delivered` when the peer actually consumes it. Receipts ride back as ordinary fire-and-forget pij messages and are visible in `pij tail`/`state`. **Mechanism proven** in `scratch/receipt_test/`: `input.streamingBehavior` classifies queued-vs-immediate at +0ms; the next `turn_start` (incremented turnIndex) marks delivery of a steered message.

## Risks & Assumptions

- **fs.watch reliability** → mitigated by dir-watch + atomic tmp→copy + debounce/dedupe (proven in prototype).
- **seq durability** across `/reload` → persisted counter or line-count derivation (architect picks).
- **liveness accuracy** → pid probe + lastEventAt, mirroring minih's `run-liveness`.
- **security** → command allow-list only; `from` id self-asserted (documented limitation).
- **Assumption**: peers cooperate (no adversarial sessions) on a single trusted host.

## Open Questions

- Data location: `~/.pij/<id>/{events.ndjson,state.json}` vs in-project? (leaning `~/.pij/<id>/`).
- Which exact pi events the extension captures into `events.ndjson`, and at what fidelity.
- Liveness thresholds (stale window seconds; heartbeat cadence).
- Does the worker's *own outbound messages* appear in its event stream (likely yes, as `message`/custom events)?
- **Multiple queued steers**: do N rapid steered messages batch into one follow-up turn or N sequential turns? (Affects receipt correlation — not yet exercised; cheap to test with N triggers.)

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| pij CLI surface + agent UX | CLI Flow | The agent-facing experience must be ergonomic + self-teaching | command/flag shape; the self-announce prompt; how the worker is told to reply |
| Parent/worker workflow | Integration Pattern | The review loop + follow-along observability is the product | when parent reads vs tails; feedback cadence; how "done" is signalled |

*(Folded into this spec per user direction; can be run as formal workshops later.)*

## Clarifications

### Session 2026-06-16

Round 1 answered by **reasoned default** (user directed "straight into spec";
choices are determined by previously-stated constraints). **Flagged for correction.**

- **Q: Workflow Mode?** → **Full**. Rationale: CS-4, multi-component, hexagonal
  with multiple ports/adapters, two entry points, CI — beyond Simple's single-phase scope.
- **Q: Testing Strategy?** → **Hybrid** (TDD core/services, lightweight adapters,
  smoke for two-window). Rationale: user asked for vitest + CI; pure core suits TDD.
- **Q: Mock Usage?** → **Avoid mocks — fake adapters / real fixtures**. Rationale:
  hexagonal ports make fakes the natural seam (user asked for ports/DI).
- **Q: Documentation Strategy?** → **Hybrid** (README + `docs/how/pij.md`).
  Rationale: agents need a protocol reference; humans need quick start.

> ⚠️ If any of these four defaults are wrong, say so and I'll re-open this session
> and adjust before the architect stage.

### Session 2026-06-16 (delivery receipts)

- Added **delivery receipts** (AC-13) after a live scratch prototype
  (`scratch/receipt_test/`) confirmed the lifecycle is observable end-to-end:
  - `input.streamingBehavior` (`null`=idle, `"steer"`=busy) is pi's authoritative
    queued-vs-immediate classification, firing at **+0ms**.
  - **Delivered (idle)** = `before_agent_start`/`turn_start` (~immediate).
  - **Delivered (steered)** = the **next `turn_start`** (incremented turnIndex) after
    the in-flight turn's `turn_end` — **no `before_agent_start` fires for a steered
    message**; correlate FIFO to the preceding `input(steer)`.
  - Observed queued→delivered gap in the run: ~13.85s (the value the sender's
    `delivered` receipt waits on).
- Receipts are **fire-and-forget** like all pij messages (no ack-of-receipt).
