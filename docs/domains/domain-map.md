# Domain Map

```mermaid
flowchart LR
    SWS[session-work-state\ncontracts: session DB semantics, schema, reset, TodoSqlStore/widgetSnapshot/cleanup, Peacock replay]
    ATI[agent-tooling-interface\ncontracts: sql tool, /sql, todo tool, /todo, /minih UX, /peacock footer chrome]
    H[extension-authoring-harness\ncontracts: generator, smoke, self-check, feedback, pkg vet/audit]
    PI[pi runtime\ncontracts: extension lifecycle, tools, commands]
    V[vetter pipeline\ncontracts: Verdict, Finding, Vetter; vetted: schema]
    RL[agentic-loops\ncontracts: StopReason, IterationRunner, PlanModel]
    AW[agent-workbench\ncontracts: MinihRunSummary, MinihViewSnapshot, MinihAdapterResult, persistence facade]
    MH[Minih artifacts\ncontracts: run.json, events.ndjson, inbox/state/history, output/report.json]
    PIJ[pij-messaging\ncontracts: SessionDescriptor, PijEvent+EventQuery, 5 ports, MessageReceipt, resolveSelf, Result]
    FWN[file-watch-notify\ncontracts: Config/parseConfig, reconcile/WatchReconciler, WatchDeps, InjectPort/deliverNotices, file_watch_notify tool]

    ATI -->|uses current-session store + todo contracts| SWS
    ATI -->|registers tool/command/lifecycle handlers| PI
    SWS -->|derives identity from session manager via wiring| PI
    ATI -->|validated by smoke/self-check| H
    SWS -->|validated by store tests/self-check| H
    V -->|sub-capability of| H
    V -->|scans markdown + tool descriptions| ATI
    RL -->|registers /ralph command + tools + session_start| PI
    RL -->|validated by store tests/smoke/self-check| H
    AW -->|presents /minih commands/tools through| ATI
    AW -->|future command/tool/UI wiring consumes APIs| PI
    AW -->|stores only pointers/cursors/audit facade via| SWS
    AW -->|uses liveness/stop/watcher vocabulary only| RL
    AW -->|validated by fixture tests/smoke/self-check| H
    AW -->|reads Minih-owned artifacts through adapter| MH
    PIJ -->|future pi-runtime adapter consumes PiRuntimePort/lifecycle| PI
    PIJ -->|validated by generator/tests/smoke/self-check| H
    PIJ -->|aligns liveness vocabulary active/stale/dead only| AW
    PIJ -->|future pij command/CLI surface presented through| ATI
    FWN -->|index.ts + inject.ts import pi; session_start watcher + sendUserMessage/steer| PI
    FWN -->|validated by generator/tests/smoke/self-check| H
    FWN -->|file_watch_notify tool presented through| ATI
    FWN -.->|adapts inject seam pattern only, no code reuse| PIJ
```

## Health Summary

| Relationship | Status | Notes |
|--------------|--------|-------|
| `agent-tooling-interface` → `session-work-state` | healthy | UI/tool/strip/footer layer consumes `SessionSqlStore`, `TodoSqlStore.widgetSnapshot`, targeted cleanup operations, and Peacock append-only replay; stores remain pi-free. |
| `agent-tooling-interface` → `pi runtime` | healthy | Wiring owns pi APIs and presentation. |
| `session-work-state` → `pi runtime` | indirect | Store does not import pi; `index.ts` passes plain session/location data. |
| `session-work-state` / `agent-tooling-interface` → `extension-authoring-harness` | healthy | Harness provides generator, store tests, `/todo` + `/sql` smoke, self-check, ledgers, and retro loop. |
| `agentic-loops` → `pi runtime` | healthy | Wiring owns pi APIs (`appendEntry`, `setStatus`, `notify`, `registerCommand`, `registerTool`, `sessionManager.getEntries()`). Store remains pi-free (P2). |
| `agentic-loops` → pi-sdk `createAgentSession` | observed-only | External dependency (not a pij domain). Lifecycle ownership documented in workshop 002 § Resource ownership; F-02 risk class. |
| `agentic-loops` → `extension-authoring-harness` | healthy | Harness provides Driver SDK (`Scenario`/`Step`/`Session`), `compactAndAssert()` (AC-12 gift a), `FakeIterationRunner` test util. |
| AC-05 (`/compact` durability of `customType`) | **unverified** | Blocks D-005 closure. T024 smoke is the gate; if A1/A2 fails, escalate to pi-mono per workshop 004 § Upstream escalation. |
| `agent-workbench` → Minih artifacts | healthy | Phase 1 defines a read-only adapter boundary. Minih remains source of truth; Pi stores only projections/pointers/cursors/audit milestones. |
| `agent-workbench` → `agent-tooling-interface` | healthy | Workbench contracts feed Pi-visible `/minih status --json` and read-only tools; UI/modal work stays in later phases. |
| `agent-workbench` → `pi runtime` | indirect | Future command/tool/UI wiring consumes Pi extension APIs through `index.ts`/`ui.ts`; Minih lifecycle ownership remains external. |
| `agent-workbench` → `session-work-state` | contract-only | Persistence facade consumes session-scoped semantics for selected pointers, seen cursors, opt-ins, and audit/intent/outcome records; storage internals remain outside the domain. |
| `agent-workbench` → `agentic-loops` | vocabulary-only | Consumes liveness, explicit stop separation, watcher cleanup, and single `session_start` discipline without reusing Ralph Loop code or owning Minih lifecycle. |
| `pij-messaging` → `pi runtime` | indirect (future) | Phase-1 core is pi-free; only the Phase-3 `adapters/pi-runtime.ts` will import pi to implement `PiRuntimePort` (isIdle/inject/compact + input/turn lifecycle for receipts). |
| `pij-messaging` → `extension-authoring-harness` | healthy | `just new` generator, vitest (50 specs), Biome, self-check, retros, difficulty ledger. |
| `pij-messaging` → `agent-workbench` | vocabulary-only | Reuses `active/stale/dead` liveness + working-state names; no code reuse (pij owns its own peer registry, AW reads Minih runs). |
| `pij-messaging` → `agent-tooling-interface` | contract-only (future) | The future `pij` command/CLI surface + boot self-announce will present through Pi command/tool UX; no wiring in Phase 1. |
| `file-watch-notify` → `pi runtime` | healthy | `index.ts` + `inject.ts` are the only pi importers: `session_start` arms the watcher; delivery is `sendUserMessage` (immediate) / `sendUserMessage(...,{deliverAs:"steer"})` (busy). Core/watcher stay pi-free (P2). |
| `file-watch-notify` → `extension-authoring-harness` | healthy | `just new` generator, vitest (39 specs: TDD core + real-fs watcher + fake-pi inject/stale-ctx + runtime tool e2e), Biome, boot-only smoke, self-check. |
| `file-watch-notify` → `agent-tooling-interface` | contract-only | `file_watch_notify` LLM tool (status/list/watch/stop; recursive watch option) presents through Pi tool UX. |
| `file-watch-notify` ⇢ `pij-messaging` | pattern-only | Adapts pij's `pi-runtime` inject path (idle→send, busy→steer); **no import, no shared code, no changes to pij**. |

## History

| Date | Change |
|------|--------|
| 2026-05-15 | Added Plan 006 session SQL domains and their harness/pi relationships. |
| 2026-05-15 | Plan 009 — added vetter pipeline as a sub-capability of `extension-authoring-harness` with a consume edge to `agent-tooling-interface` (scans its surfaces). Pipeline contracts (`Verdict`, `Finding`, `Vetter`, `vetted:` schema) live in `harness/scripts/vetters/`. |
| 2026-05-15 | Plan 008 — added `agentic-loops` node (`RL`); two outbound edges (to `pi runtime` for wiring; to `extension-authoring-harness` for tests/smoke). No cross-domain edge to existing pij domains in v1. AC-05 `/compact` durability listed as unverified in Health Summary until T024 lands. |
| 2026-05-15 | Plan 010 — extended `session-work-state` with `TodoSqlStore` over the default `todos` / `todo_deps` schema and extended `agent-tooling-interface` with `todo` tool, `/todo`, overlay/status UX, docs, and smoke. |
| 2026-05-16 | Plan 010 ST-001 — added `TodoSqlStore.widgetSnapshot`, below-editor `todo-strip`, and `session-sql:changed` refresh edge for raw SQL mutations. |
| 2026-05-16 | Plan 010 follow-up — added targeted todo cleanup (`delete <id>`, `prune done`) to the store and tool/command UX. |
| 2026-05-16 | Plan 007 Phase 1 — added `agent-workbench` (`AW`) and Minih artifact source (`MH`) nodes with one-way consume edges to `pi runtime`, `agent-tooling-interface`, `session-work-state`, `agentic-loops`, `extension-authoring-harness`, and Minih-owned artifacts; expanded `agent-tooling-interface` node label for `/minih` read-only surfaces. |
| 2026-05-27 | Plan 013 — extended `agent-tooling-interface` with `/peacock` footer chrome and `session-work-state` with Peacock append-only color/surface replay semantics. |
| 2026-06-16 | Plan 014 Phase 1 — added `pij-messaging` (`PIJ`) node; four outbound edges (future pi-runtime adapter → `pi runtime`; validation → `extension-authoring-harness`; liveness vocabulary-only → `agent-workbench`; future CLI surface → `agent-tooling-interface`). Phase-1 core is pi-free; no inbound edges yet. |
| 2026-06-17 | Plan 015 — added `file-watch-notify` (`FWN`) node; three outbound edges (`pi runtime` wiring; `extension-authoring-harness` validation; `agent-tooling-interface` status command) plus a dashed pattern-only link to `pij-messaging` (adapts the inject seam, no code reuse). Standalone extension; snapshot-reconcile trap fix is the headline contract. |
| 2026-06-17 | Plan 015 (amend) — `FWN` gained a runtime control surface; it ultimately settled on the LLM-callable `file_watch_notify` tool (not a slash command) for arm/list/stop/status. |
| 2026-06-17 | Plan 015 (live crash fix) — `FWN` inject seam now treats stale/throwing Pi ctx as non-fatal after reload/session replacement. |
| 2026-06-17 | Plan 015 (tool surface fix) — `FWN` gained the missing LLM-callable `file_watch_notify` tool plus recursive watch option; obsolete slash-command parser/surface removed. |
