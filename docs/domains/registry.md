# Domain Registry

Lightweight registry for pij planning domains. This registry is intentionally small; it records boundaries that future plans can reuse without turning pij into a heavy domain-management project.

| Domain | Status | Primary Doc | Purpose |
|--------|--------|-------------|---------|
| `session-work-state` | active | [`session-work-state/domain.md`](./session-work-state/domain.md) | Session-scoped structured state for agent work, including persistence, reset, fork/new independence, and default work schema. |
| `agent-tooling-interface` | active | [`agent-tooling-interface/domain.md`](./agent-tooling-interface/domain.md) | Model-facing and operator-facing tool/command UX for pi extensions. |
| `extension-authoring-harness` | existing capability | [`../project-rules/harness.md`](../project-rules/harness.md) | Generator, tests, smoke, self-check, difficulty ledger, velocity log, and magic-wand feedback loop used by extension plans. |
| `agentic-loops` | active | [`agentic-loops/domain.md`](./agentic-loops/domain.md) | Long-running plan-driven autonomous loops over pi `createAgentSession()`. Owns `StopReason` taxonomy, `IterationRunner` lifecycle contract, markdown `PlanModel`, attribution/governance for community patterns (Ralph Loop), and "fresh context per iteration" discipline. First inhabitant: `.pi/extensions/ralph-loop/`. |
| `agent-workbench` | active | [`agent-workbench/domain.md`](./agent-workbench/domain.md) | Product contract for Pi-native Minih run visibility: read-only run summaries, view snapshots, adapter diagnostics, session pointer/cursor facade, and future gated interaction/push semantics without taking ownership of Minih artifacts. |

## History

| Date | Change |
|------|--------|
| 2026-05-15 | Created lightweight registry for Plan 006 `session-sql`. |
| 2026-05-15 | Plan 009 — supply-chain vetting added as a new capability inside `extension-authoring-harness` (vetter modules at `harness/scripts/vetters/`, agent pack at `agents/package-vetter/`, `pkg vet`/`audit` CLI surface). Consumes `agent-tooling-interface` surfaces (SKILL.md / AGENTS.md / tool descriptions) at scan time. No new domain formalised yet — future extraction of `extension-vetting` as a discrete domain is a natural next step if the surface grows. |
| 2026-05-15 | Plan 008 — `agentic-loops` domain formalised; first inhabitant is the `ralph-loop` pi extension. Headline contracts: `StopReason` tagged union (8 cases, pre/post evaluator), `IterationRunner` interface, `PlanModel` markdown-parser shape. No cross-domain edges in v1. **AC-05 (`/compact` durability of `customType` entries) remains unverified** until T024/T025 land; tracked in `docs/difficulties.md` D-005 and in `domain-map.md` Health Summary. |
| 2026-05-15 | Plan 010 — SQL-backed todo did not create a new domain. `session-work-state` now owns the `TodoSqlStore` contract over `todos` / `todo_deps`; `agent-tooling-interface` now owns `todo` tool, `/todo`, overlay/status UX, docs, and smoke. |
| 2026-05-16 | Plan 007 Phase 1 — created the `agent-workbench` domain for Pi-native Minih run summaries, read-only artifact adapter contracts, persistence facade placeholders, and future gated interaction/push semantics. |
