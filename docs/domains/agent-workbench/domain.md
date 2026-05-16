# Domain: agent-workbench

## Purpose

Own the product contract for observing Minih runs from inside Pi, without replacing Minih as the runner or artifact source of truth. Phase 1 establishes read-only run inventory, status/report projection, adapter results, and future-safe persistence placeholders. Later phases consume these contracts to render the Pi-native full modal viewer and then add gated interaction/push behavior.

## Source Locations

| Path | Role |
|------|------|
| `.pi/extensions/minih-workbench/AGENTS.md` | Extension-local rules for Minih source-of-truth, read-only Phase 1, fixture-first validation, and future safety gates. |
| `.pi/extensions/minih-workbench/store.ts` | Pi-free product contracts, constants, pure projection helpers, bounded pane snapshots, and tagged adapter results. |
| `.pi/extensions/minih-workbench/minih-adapter.ts` | Internal Minih artifact/CLI/helper read boundary; all Minih filesystem reads and future write wrappers must remain isolated here. |
| `.pi/extensions/minih-workbench/persistence.ts` | Injected session persistence facade for selected run pointers, seen cursors, push opt-ins, and audit/intent/outcome records. |
| `.pi/extensions/minih-workbench/ui.ts` | Future Pi-native list/modal UI; Phase 1 exposes only placeholder/future-compatible boundaries. |
| `.pi/extensions/minih-workbench/index.ts` | Pi command/tool wiring that consumes this domain's contracts through read-only surfaces. |
| `.pi/extensions/minih-workbench/fixtures/` | Deterministic Minih run artifact fixtures used by adapter/store tests and smoke. |
| `.pi/extensions/minih-workbench/store.test.ts` | Store/projection contract tests. |
| `.pi/extensions/minih-workbench/minih-adapter.test.ts` | Fixture-backed Minih adapter tests. |
| `.pi/extensions/minih-workbench/smoke.ts` | Deterministic Driver SDK smoke for the Phase 1 pull surface. |
| `docs/how/agent-workbench.md` | Future operator guide for list/modal/status/controls/push semantics. |

## Concepts

| Concept | Description | Contract |
|---------|-------------|----------|
| Minih run summary | Compact row-level representation of a Minih run as Pi should present it. | `MinihRunSummary` keeps slug, run id, source path, kind, liveness, terminal result, inside status, outside status, attention, diagnostics, material counts, and report state distinct. |
| Status axes | Independent status dimensions prevent a single vague label from hiding important differences. | Liveness, terminal result, inside state, outside state, peer/activity/attention, and UI focus are separate typed fields. |
| Bounded pane snapshot | Transcript/tool/coordination/report text is windowed before it reaches commands, tools, or UI. | Snapshot contracts include `maxEvents`, `maxBytes`, cursor/page inputs, returned bytes, and visible truncation markers. |
| Adapter result | Minih artifact reads are fallible and must normalize errors instead of throwing. | Adapter methods return tagged unions with `ok`, structured error codes, diagnostics, and optional partial data. |
| Read-only inventory pull surface | Humans, smoke tests, and agents can inspect runs without opening the future modal. | `/minih status --json`, `minih_runs_list`, `minih_run_status`, and `minih_read_report` return deterministic bounded envelopes. |
| Session workbench persistence | Pi may persist pointers/cursors/audit milestones, but never Minih artifacts as a second source of truth. | `persistence.ts` exposes selected-run pointers, seen cursors, push opt-ins, and audit/intent/outcome records for later phases. |
| Phase 3 safety placeholders | Write/control/push work is required later but must not leak into Phase 1. | Contracts reserve capability, audit, cursor, and action identifiers while Phase 1 forbids send, stop, composer, and pushed-context side effects. |

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
| `MINIH_WORKBENCH_ACTIONS` | Future UI wiring | Placeholder named actions; no default keybinding map is part of Phase 1. |
| Read-only command/tool envelope | Human/operator/model/smoke | Deterministic JSON with bounded payloads and truncation markers; no write-capable fields. |

## Composition

| Component | Status | Notes |
|-----------|--------|-------|
| Domain document | implemented in Phase 1 | Creates the boundary and source-of-truth contract. |
| Store contracts | planned in Phase 1 | Pi-free types, constants, projections, tagged results, and no-write invariant. |
| Persistence facade | planned in Phase 1 | In-memory/no-op implementation is acceptable until later phases wire session storage. |
| Minih adapter | planned in Phase 1 | Reads artifacts/fixtures only; future write wrappers must stay here. |
| Read-only command/tool wiring | planned in Phase 1 | `/minih status --json` and three model-facing read-only tools. |
| Full modal viewer | future Phase 2 | Native Pi UI only; no nested Minih Ink/ANSI view. |
| Interaction/push controls | future Phase 3 | Capability-gated send/stop/report/push with confirmation, audit, redaction, and dedupe. |

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
- Phase 3 safety invariants for send/stop/report/push contracts.
- Session pointer/cursor/audit facade shape.
- Default bounded payload limits for workbench projections.

## Boundary Excludes

- Minih execution, scheduling, prompt loops, permission model, run lifecycle, artifact storage, and companion protocol internals.
- Generic provider orchestration for non-Minih subagent packages.
- Pi runtime command/tool/UI registration details; those belong to `agent-tooling-interface`.
- SQLite/session storage implementation internals; those belong to `session-work-state`.
- Extension generator, smoke driver, package vetters, and self-check orchestration; those belong to `extension-authoring-harness`.
- Right-hand monitor/dock UX in v1.
- Any Phase 1 write/send/stop/push side effect.

## History

| Plan | Change | Date |
|------|--------|------|
| 007-options-for-pi-extensions-that-do-subagents / Phase 1 | Created `agent-workbench` domain for Pi-native Minih run visibility, read-only adapter contracts, persistence facade, and future Phase 3 safety placeholders. | 2026-05-16 |
