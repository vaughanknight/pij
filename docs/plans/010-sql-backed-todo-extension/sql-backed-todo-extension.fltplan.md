# Flight Plan: SQL-backed Todo Extension

**Spec**: [sql-backed-todo-extension-spec.md](./sql-backed-todo-extension-spec.md)  
**Plan**: [sql-backed-todo-extension-plan.md](./sql-backed-todo-extension-plan.md)  
**Dossier**: [research-dossier.md](./research-dossier.md)  
**Workshops**: [001 command/tool](./workshops/001-todo-command-and-model-action-contract.md), [002 dependencies](./workshops/002-dependency-aware-next-ready-semantics.md), [003 data](./workshops/003-sql-backed-todo-data-contract.md), [004 UX](./workshops/004-full-todo-ux-scope.md), [005 domains](./workshops/005-cross-domain-contract-review.md)  
**Generated**: 2026-05-15  
**Status**: Ready  
**Mode**: Simple  
**Complexity**: CS-3 (medium)

---

## The Mission

**What we're building**: A first-party todo experience for pi sessions that lets humans and agents manage current-session work items through a full v1 UX — slash command, model tool, interactive overlay, status signal, and configurable shortcut surface — while keeping the existing SQL-backed session work state as the source of truth.

**Why it matters**: It makes structured current-session memory visible, steerable, and inspectable. Agents can plan and track dependencies explicitly; humans can audit the same state through both `/todo` and `/sql`.

---

## Where We Are → Where We're Headed

```text
TODAY:                                      AFTER this plan:
Generic /sql workbench exists              /todo provides routine task UX
Default todos table exists                 Human-friendly todo list/actions
Default todo_deps table exists             Dependency-aware next-ready view
Agents can write raw SQL                   Agents can use purpose-built todo actions
Humans can inspect via /sql                Humans can steer via /todo + inspect via /sql
No todo overlay/status UX                  Interactive overlay + status signal + shortcuts
Session semantics already proven           Todo inherits reload/resume + new/fork independence
No todo-specific docs/smoke                README + docs/how + deterministic smoke prove agreement
```

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Current["Current State"]
        SQL[session-sql]:::existing
        SWS[session-work-state]:::existing
        ATI[agent-tooling-interface]:::existing
        H[extension harness]:::existing
    end

    subgraph Target["Target State"]
        TODO[todo extension]:::new
        TODOTOOL[todo tool]:::new
        TODOCMD[/todo command]:::new
        SQL2[/sql inspection]:::existing
        SWS2[session work state contract]:::changed
        DOCS[README + docs/how]:::new
        SMOKE[todo smoke]:::new

        TODO --> TODOTOOL
        TODO --> TODOCMD
        TODO --> SWS2
        SQL2 --> SWS2
        TODO --> DOCS
        TODO --> SMOKE
    end

    SQL --> SWS
    ATI --> SQL
    H --> SQL
```

**Legend**: existing (green) | changed (orange) | new (blue)

---

## Scope

**Goals**:
- Human-facing todo command for current-session work.
- Model-facing todo action surface for routine task operations.
- Interactive overlay, status signal, and configurable shortcut surface.
- Shared source of truth with SQL-visible session work state.
- Status lifecycle: pending, in progress, blocked, done.
- Dependency-aware next-ready behavior.
- Same-session persistence and new/fork independence inherited from session work state.
- Store tests, command/overlay smoke, README quick-start, docs/how guide, and domain updates.

**Non-Goals**:
- Separate project-local/global todo storage.
- Long-term personal task manager.
- Cloud/shared sync.
- Full project-management feature set.
- Assignees, tags, categories, and work-on autoprompt behavior.

---

## Journey Map

```mermaid
flowchart LR
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef ready fill:#9E9E9E,stroke:#757575,color:#fff

    R[Research]:::done --> S[Specify]:::done
    S --> C[Clarify]:::done
    C --> W[Workshop]:::done
    W --> P[Plan]:::done
    P --> I[Implement]:::active
    I --> V[Validate]:::ready
```

**Legend**: green = done | yellow = active | grey = not started

---

## Phases Overview

Simple mode selected; one implementation phase.

| Phase | Title | Tasks | CS | Status |
|-------|-------|-------|----|--------|
| 1 | Store, full UX, validation, docs, domains | 11 | CS-3 | In progress |

---

## Flight Status

```mermaid
flowchart LR
    classDef pending fill:#ECEFF1,stroke:#607D8B,color:#000
    classDef active fill:#FFF3E0,stroke:#FB8C00,color:#000
    classDef done fill:#E8F5E9,stroke:#43A047,color:#000
    classDef blocked fill:#FFEBEE,stroke:#E53935,color:#000

    S001[T001 Scaffold]:::done --> S002[T002 Bind params]:::done --> S003[T003 Todo store]:::done --> S004[T004 Store tests]:::done --> S005[T005 Command/tool]:::done --> S006[T006 Overlay/status]:::done --> S007[T007 Smoke]:::done --> S008[T008 Docs]:::done --> S009[T009 Domains]:::done --> S010[T010 Ledgers]:::done --> S011[T011 Validation]:::pending
```

## Stages

| Status | Task | Stage | Evidence |
|--------|------|-------|----------|
| [x] | T001 | Pre-flight + scaffold | Harness healthy; `npm run new -- todo` created T2 layout; scaffold store test passed. |
| [x] | T002 | Parameter binding contract | `SessionSqlStore` supports typed positional/named bind params; scoped tests and typecheck passed. |
| [x] | T003 | Todo store/parser/formatters | SQL-backed store, parser, formatters, and keybinding constants implemented; scoped store tests passed. |
| [x] | T004 | Store tests | Real SQLite test matrix expanded; todo + session-sql store tests passed together. |
| [x] | T005 | Command/tool wiring | `/todo` and model `todo` action tool wired to the shared SQL-backed store; typecheck passed. |
| [x] | T006 | Overlay/status/key matching | Minimal `ctx.ui.custom` overlay, footer status clearing, and named key defaults implemented. |
| [x] | T007 | Smoke | `npm run smoke -- todo` passed across empty/add/list/SQL/overlay/reload path. |
| [x] | T008 | Docs | README quick-start, detailed `docs/how/todo.md`, and todo AGENTS guidance added; smoke still passes. |
| [x] | T009 | Domain records | Domain docs/map/registry identify todo as SQL-backed UX consumer and `TodoSqlStore` as session-work-state contract. |
| [x] | T010 | Ledgers | Execution log, D-027/D-028 difficulties, and velocity todo row updated. |
| [ ] | T011 | Full validation | Pending. |

## Checklist

- [x] T001 — Pre-flight + scaffold
- [x] T002 — Parameter binding contract
- [x] T003 — Todo store/parser/formatters
- [x] T004 — Store tests
- [x] T005 — Command/tool wiring
- [x] T006 — Overlay/status/key matching
- [x] T007 — Smoke
- [x] T008 — Docs
- [x] T009 — Domain records
- [x] T010 — Ledgers
- [ ] T011 — Full validation

---

## Implementation Task Summary

| Task | Domain | Done When |
|------|--------|-----------|
| T001 — Pre-flight + scaffold | extension-authoring-harness | [x] `todo` T2 layout exists from generator. |
| T002 — Parameter binding contract | session-work-state | [x] `SessionSqlStore` supports safe bound values with regressions. |
| T003 — Todo store/parser/formatters | session-work-state | [x] Pi-free store implements actions over `todos`/`todo_deps`. |
| T004 — Store tests | extension-authoring-harness | [x] Real temp SQLite tests cover data and dependency matrices. |
| T005 — Command/tool wiring | agent-tooling-interface | [x] `/todo` and `todo` tool share action semantics. |
| T006 — Overlay/status/key matching | agent-tooling-interface | [x] Minimal overlay, open-count status, configurable key defaults. |
| T007 — Smoke | extension-authoring-harness | [x] `/todo`, overlay, `/sql`, reload path passes. |
| T008 — Docs | agent-tooling-interface | [x] README quick-start and `docs/how/todo.md` exist. |
| T009 — Domain records | session-work-state / agent-tooling-interface | [x] Domain docs/map identify todo as SQL-backed UX consumer. |
| T010 — Ledgers | extension-authoring-harness | [x] Execution, difficulty, and velocity records updated. |
| T011 — Full validation | extension-authoring-harness | Typecheck, lint, tests, smoke, self-check pass. |

## Acceptance Criteria Snapshot

Full list lives in the spec. Top outcomes:

- [ ] `/todo` shows an empty or populated current-session list.
- [ ] Humans and agents can add, list, update, and complete todos.
- [ ] Interactive overlay renders the same todos as `/todo`.
- [ ] Footer/status signal summarizes open work without stale empty pills.
- [ ] Any shortcut/key matching is configurable rather than hardcoded.
- [ ] `/todo` and `/sql` agree on todo state.
- [ ] Todo state survives reload/resume and stays independent for new/forked sessions.
- [ ] Dependency-aware next-ready behavior works.
- [ ] Destructive clear requires confirmation.
- [ ] Store tests, command/overlay smoke, typecheck, lint, and self-check validate the feature.

---

## Key Risks

| Risk | Mitigation |
|------|------------|
| Todo UX drifts from SQL-visible state | Make SQL-backed state canonical; smoke `/todo` + `/sql` agreement. |
| Cross-extension store contract remains implicit | Update domain docs and add contract tests where needed. |
| Full UX scope grows too large | Keep overlay/status/shortcut surface minimal and deterministic; use workshop before architecture. |
| Metadata expands schema prematurely | Defer assignees/tags/categories in v1. |
| `workon` surprises user by triggering agent work | Exclude work-on autoprompt behavior in v1. |

---

## Flight Log

<!-- Updated by /plan-6 and /plan-6a after each phase completes -->

### 2026-05-15 — Specify started

Research dossier was incorporated into the initial spec. The plan currently targets existing `session-work-state`, `agent-tooling-interface`, and `extension-authoring-harness` domains, with no new domain proposed for v1.

### 2026-05-15 — Clarification complete

User selected Simple mode, Hybrid testing, Avoid mocks, Hybrid docs, confirmed existing domain boundaries, chose Full UX for v1, and limited advanced behavior to core status/priority/dependencies. Metadata and work-on autoprompt behavior are deferred.

### 2026-05-15 — Workshops complete

Created five workshop references covering command/tool contract, dependency-aware next-ready semantics, SQL-backed data contract, full UX scope, and cross-domain contract review. Plan is ready for architecture.

### 2026-05-15 — Architecture complete

Generated a Simple-mode implementation plan with 11 tasks. Key architecture decision: extend `SessionSqlStore` with safe bind-parameter support before building `TodoSqlStore`, so the todo UX reuses session SQL without unsafe interpolation or duplicate persistence.
