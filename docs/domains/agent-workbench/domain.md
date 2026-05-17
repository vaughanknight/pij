# Domain: agent-workbench

## Purpose

Own the product contract for observing and safely coordinating Minih runs from inside Pi, without replacing Minih as the runner or artifact source of truth. Phase 1 established read-only run inventory, status/report projection, adapter results, and persistence placeholders. Phase 2 added named keybindings, pure list/modal focus and scroll helpers, read-only feed lifecycle contracts, and full modal viewer semantics. Phase 3 adds gated send, confirmed stop controls, compact pushed context, durable audit/cursor persistence, and duplicate suppression.

## Source Locations

| Path | Role |
|------|------|
| `.pi/extensions/minih-workbench/AGENTS.md` | Extension-local rules for Minih source-of-truth, gated interaction, fixture-first validation, list/modal/feed contracts, and permanent safety gates. |
| `.pi/extensions/minih-workbench/store.ts` | Pi-free product contracts, constants, pure projection helpers, bounded pane snapshots, keybinding defaults, list/modal focus/scroll helpers, and tagged adapter results. |
| `.pi/extensions/minih-workbench/feed.ts` | Pi-free lazy read-only feed manager with injected readers/timers, diagnostics, coalescing, bounded fallback polling, and explicit dispose. |
| `.pi/extensions/minih-workbench/minih-adapter.ts` | Internal Minih artifact/CLI/helper boundary; all Minih filesystem reads and send/stop write wrappers remain isolated here. |
| `.pi/extensions/minih-workbench/persistence.ts` | Injected session persistence facade for selected run pointers, seen cursors, push opt-ins, and audit/intent/outcome records. |
| `.pi/extensions/minih-workbench/ui.ts` | Pi-native run-list and full modal read-only UI components plus width-safe render helpers. |
| `.pi/extensions/minih-workbench/index.ts` | Pi command/tool/message wiring that consumes this domain's contracts through read-only pull surfaces plus gated send/stop/push paths. |
| `.pi/extensions/minih-workbench/fixtures/` | Deterministic Minih run artifact fixtures used by adapter/store tests and smoke. |
| `.pi/extensions/minih-workbench/store.test.ts` | Store/projection contract tests. |
| `.pi/extensions/minih-workbench/minih-adapter.test.ts` | Fixture-backed Minih adapter tests. |
| `.pi/extensions/minih-workbench/feed.test.ts` | Feed lifecycle tests for coalescing, diagnostics, fallback polling, and dispose safety. |
| `.pi/extensions/minih-workbench/ui.test.ts` | UI render/component tests for anchors, keybinding injection, modal focus/close, report paging, and width safety. |
| `.pi/extensions/minih-workbench/smoke.ts` | Deterministic Driver SDK smoke for list/modal/send-gating/report/reload flows. |
| `docs/how/agent-workbench.md` | Operator guide for list/modal/status/send/stop/report/push semantics and troubleshooting. |

## Concepts

| Concept | Description | Contract |
|---------|-------------|----------|
| Minih run summary | Compact row-level representation of a Minih run as Pi should present it. | `MinihRunSummary` keeps slug, run id, source path, kind, liveness, terminal result, inside status, outside status, attention, diagnostics, material counts, and report state distinct. |
| Status axes | Independent status dimensions prevent a single vague label from hiding important differences. | Liveness, terminal result, inside state, outside state, peer/activity/attention, and UI focus are separate typed fields. |
| Bounded pane snapshot | Transcript/tool/coordination/report text is windowed before it reaches commands, tools, or UI. | Snapshot contracts include `maxEvents`, `maxBytes`, cursor/page inputs, returned bytes, and visible truncation markers. |
| Adapter result | Minih artifact reads are fallible and must normalize errors instead of throwing. | Adapter methods return tagged unions with `ok`, structured error codes, diagnostics, and optional partial data. |
| Read-only inventory pull surface | Humans, smoke tests, and agents can inspect runs without opening the future modal. | `/minih status --json`, `minih_runs_list`, `minih_run_status`, and `minih_read_report` return deterministic bounded envelopes. |
| Session workbench persistence | Pi may persist pointers/cursors/audit milestones, but never Minih artifacts as a second source of truth. | `persistence.ts` exposes selected-run pointers, seen cursors, push opt-ins, and audit/intent/outcome records for later phases. |
| Native list and modal viewer | Pi can observe Minih runs without taking control of them. | `/minih` opens a keyboard-selectable run list, Enter opens a full read-only modal, pane focus/scroll state stays in Pi UI state, and `Esc` closes without Minih control. |
| Lazy read-only feed | Open list/modal views refresh through injected readers while avoiding global polling. | Feed handles coalesce refreshes, emit diagnostics, fall back to bounded polling after watcher failure, and ignore callbacks after dispose. |
| Gated interaction and push | Phase 3 write/control/push paths cross a safety boundary. | Send/stop require fresh capability checks, explicit run ids, persist-before-side-effect audit, adapter-only writes, exact stop confirmation, scoped redacted pushed context, and per-event dedupe cursors. |

### Example: reading inventory without taking ownership

```ts
const result = await listMinihRuns({ rootDir });
if (!result.ok) return result;
const visible = projectInventory(result.value.runs, { activeLimit: 20, completedLimit: 5 });
```

The adapter reads Minih-owned artifacts, the store projects bounded Pi-facing state, and Pi wiring presents the result. None of those layers become the canonical Minih run store.

## Contracts

| Contract | Consumer | Shape / Guarantee |
|----------|----------|-------------------|
| `MinihRunSummary` | `agent-tooling-interface`, tests, future UI | Structural type for inventory rows; keeps status axes independent and includes diagnostics/report metadata. |
| `MinihViewSnapshot` | Future modal UI, read-only tools | Bounded transcript/tool/coordination/diagnostics/report panes with cursor/page/truncation metadata. |
| `MinihAdapterResult<T>` | Pi wiring and tests | Tagged success/failure result; malformed/missing/permission-like artifacts become diagnostics instead of thrown exceptions. |
| `MinihWorkbenchPersistence` | Phase 2/3 wiring | Injected facade for selected run pointer, seen cursors, push opt-ins, and audit/intent/outcome records; future write paths persist before side effects. |
| `DEFAULT_MINIH_WORKBENCH_KEYBINDINGS` / `MINIH_WORKBENCH_ACTIONS` | UI wiring | Named actions and default keybinding map; UI consumes injected maps and avoids hardcoded key checks. |
| `MinihReadOnlyFeed` | UI wiring and tests | Lazy read-only feed handle with explicit `start()`, `refresh()`, `dispose()`, diagnostics, coalescing, and bounded fallback polling. |
| Read-only command/tool envelope | Human/operator/model/smoke | Deterministic JSON with bounded payloads and truncation markers; pull surfaces do not write. |
| Gated send/stop contracts | `agent-tooling-interface`, tests | `minih_send_message` and `/minih send` deliver outside-inbox messages only for active coordinated writable runs after audit intent persistence; `minih_stop_run` requires exact `stop <slug>/<runId>` confirmation and writes a dedicated control message only after audit persistence. |
| Pushed context envelope | Pi runtime, model context, tests | Material Minih events become compact redacted `minih.materialEvent` custom messages after audit+cursor persistence; raw reports/tool output/secrets/paths are suppressed/redacted and duplicate events use per-event push cursor channels. |

## Composition

| Component | Status | Notes |
|-----------|--------|-------|
| Domain document | implemented in Phase 1 | Creates the boundary and source-of-truth contract. |
| Store contracts | implemented in Phase 1 | Pi-free types, constants, projections, tagged results, bounded panes, status axes, and no-write invariant. |
| Persistence facade | implemented in Phase 1 | Pi-free interface plus in-memory implementation for selected run pointers, seen cursors, push opt-ins, and audit records until later phases wire session storage. |
| Minih adapter | implemented in Phase 1 | Reads artifacts/fixtures only; returns tagged diagnostics/snapshots/reports; future write wrappers must stay here. |
| Read-only command/tool wiring | implemented in Phase 1 | `/minih status --json`, `/minih status <slug> <runId> --json`, `/minih report <slug> <runId> --json`, and three model-facing read-only tools. |
| Native run-list UI | implemented in Phase 2 | `/minih` and `/minih list` open a keyboard-selectable native Pi list with active/stale plus completed/report-ready sections. |
| Full modal viewer | implemented in Phase 2 | `/minih view`, list Enter, and `/minih report` open native Pi read-only modal panes; no nested Minih Ink/ANSI view. |
| Lazy feed lifecycle | implemented in Phase 2 | List/modal feeds refresh through injected readers, coalesce duplicate refreshes, expose diagnostics, and dispose on close/reload/shutdown. |
| Interaction/push controls | implemented in Phase 3 | Capability-gated send/stop/report/push with confirmation, audit, redaction, and dedupe. |

## Dependencies

### This Domain Depends On

| Domain / System | Type | Contract Used |
|-----------------|------|---------------|
| Minih artifacts/runtime | external source of truth | `agents/<slug>/runs/<runId>/` artifacts, inbox/state/history/report files, and helper/CLI contracts where vetted. |
| `agent-tooling-interface` | consume/use | Pi-visible command, tool, UI, custom message, and confirmation surfaces. |
| `session-work-state` | consume | Session-scoped persistence semantics for pointers, cursors, opt-ins, and audit records; storage internals remain outside this domain. |
| `agentic-loops` | consume vocabulary | Liveness, explicit stop separation, watcher lifecycle cleanup, and one-handler `session_start` discipline. |
| `extension-authoring-harness` | consume | Generator, fixtures, store/adapter tests, smoke, package vet/audit, self-check evidence, retros, and difficulty ledger. |

### Domains That Depend On This

| Domain | Contract Used |
|--------|---------------|
| `agent-tooling-interface` | Minih run summary, view snapshot, adapter result, persistence facade, action identifiers, and safety invariants for Pi wiring/UI. |
| `extension-authoring-harness` | Fixture/test/smoke expectations and execution evidence for Minih Workbench phases. |

## Boundary Owns

- Pi-facing Minih run summary vocabulary.
- Minih Workbench view snapshot semantics.
- Read-only inventory/status/report projection contracts.
- Adapter error/diagnostic taxonomy.
- Phase 3 safety invariants and implemented contracts for send/stop/report/push.
- Session pointer/cursor/audit facade shape.
- Default bounded payload limits for workbench projections.

## Boundary Excludes

- Minih execution, scheduling, prompt loops, permission model, run lifecycle, artifact storage, and companion protocol internals.
- Generic provider orchestration for non-Minih subagent packages.
- Pi runtime command/tool/UI registration details; those belong to `agent-tooling-interface`.
- SQLite/session storage implementation internals; those belong to `session-work-state`.
- Extension generator, smoke driver, package vetters, and self-check orchestration; those belong to `extension-authoring-harness`.
- Right-hand monitor/dock UX in v1.
- Ungated write/send/stop/push side effects outside the Phase 3 safety contract.

## History

| Plan | Change | Date |
|------|--------|------|
| 007-options-for-pi-extensions-that-do-subagents / Phase 1 | Created `agent-workbench` domain for Pi-native Minih run visibility, read-only adapter contracts, persistence facade, and future Phase 3 safety placeholders. | 2026-05-16 |
| 007-options-for-pi-extensions-that-do-subagents / Phase 2 | Added Pi-free keybinding/list/modal/feed contracts, native read-only run-list/modal semantics, safe close, and deterministic feed/UI/smoke evidence. | 2026-05-16 |
| 007-options-for-pi-extensions-that-do-subagents / Phase 3 | Added gated send/stop contracts, adapter write wrappers, session-backed audit/cursor persistence, compact pushed context, redaction/dedupe helpers, tests, smoke, and operator docs. | 2026-05-17 |
