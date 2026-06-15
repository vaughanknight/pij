# Flight Plan: Generic SQLite Session Tool

**Spec**: [generic-sqlite-session-tool-spec.md](./generic-sqlite-session-tool-spec.md)
**Plan**: [generic-sqlite-session-tool-plan.md](./generic-sqlite-session-tool-plan.md)
**Generated**: 2026-05-15
**Status**: Complete

---

## The Mission

**What we're building**: A `session-sql` pi extension that gives the current pi session a private SQLite workbench. The agent and human operator can use it to track structured scratch state such as todos, dependencies, review queues, test matrices, batches, and temporary state machines without creating project files.

**Why it matters**: It gives the agent durable, queryable current-session working memory without turning that state into long-term memory, cloud recall, or git-tracked artifacts.

---

## Where We Are → Where We're Headed

```text
TODAY:                                      AFTER this plan:
0 active in-tree state extensions           1 session-scoped SQL workbench
0 session SQL stores                        1 private store per pi session
0 deterministic SQL smoke path              /sql status/schema/query/reset
No default task schema                      Versioned todos + dependencies
Session data would need project files       Session data stays outside repo
No custom-table prompt guidance             Agent recipes for file/test/review/research tables
Node engine >=20                            Node engine >=24 for node:sqlite + extensions
```

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Current["Current State"]
        H1[Extension Harness]:::existing
        P1[Pi Session Runtime]:::existing
        E1[No Session SQL Extension]:::existing
        N1[Node >=20 Policy]:::existing
    end

    subgraph Target["After Implementation"]
        H2[Extension Harness]:::changed
        P2[Pi Session Runtime]:::existing
        N2[Node >=24 Policy]:::changed
        S2[Session Work State]:::new
        T2[Generic sql Tool]:::new
        C2[/sql Operator Command]:::new
        D2[Docs + Recipes]:::new
        V2[Smoke + Self-check Evidence]:::new
        P2 --> S2
        T2 --> S2
        C2 --> S2
        D2 --> T2
        H2 --> V2
        V2 --> C2
        N2 --> S2
    end
```

**Legend**: existing (green) | changed (orange) | new (blue)

---

## Scope

**Goals**:
- Create a private SQL workspace scoped to the active pi session.
- Persist same-session data across reload, process exit, and resume.
- Start new and forked sessions with independent empty stores plus defaults.
- Provide a useful versioned default schema for todos and dependencies.
- Expose deterministic human commands for status, schema, query, and reset.
- Support native SQLite extension loading when Node exposes it.
- Cap returned output so results stay usable in the TUI and model context.
- Prove behavior with tests, smoke, self-check, manual resume proof, and retro capture.

**Non-Goals**:
- Long-term user memory, historical recall, or cross-session search.
- Cloud sync, shared multi-user databases, or copied fork state.
- Hard SQL sandboxing, query cancellation, or subprocess isolation in v1.
- Project-local database artifacts or git-tracked session files.
- Multiple specialized SQL tools in v1.
- Broad harness rewrite before feature work.

---

## Journey Map

```mermaid
flowchart LR
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef ready fill:#9E9E9E,stroke:#757575,color:#fff

    S[Specify]:::done --> C[Clarify]:::done
    C --> P[Plan]:::done
    P --> I[Simple Implementation]:::done
    I --> V[Validate]:::done
    V --> D[Done]:::done
```

**Legend**: green = done | yellow = active | grey = not started

---

## Phases Overview

| Phase | Title | Tasks | CS | Status |
|-------|-------|-------|----|--------|
| 1 | Simple Implementation | 18 | CS-3 | Complete |

---

## Implementation Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Domain setup" as S1
    state "2: Runtime spike" as S2
    state "3: Node engine" as S3
    state "4: Scaffold" as S4
    state "5: Store core" as S5
    state "6: Schema reset" as S6
    state "7: SQL execution" as S7
    state "8: Native loading" as S8
    state "9: Store tests" as S9
    state "10: Lifecycle" as S10
    state "11: Tool" as S11
    state "12: Command" as S12
    state "13: Formatting" as S13
    state "14: Smoke" as S14
    state "15: Templates" as S15
    state "16: Docs" as S16
    state "17: Retro" as S17
    state "18: Validation" as S18

    [*] --> S1 --> S2 --> S3 --> S4 --> S5 --> S6 --> S7 --> S8 --> S9 --> S10 --> S11 --> S12 --> S13 --> S14 --> S15 --> S16 --> S17 --> S18 --> [*]

    class S1,S2,S3,S4,S5,S6,S7,S8,S9,S10,S11,S12,S13,S14,S15,S16,S17,S18 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

<!-- Updated by /plan-6 during implementation: [ ] → [~] → [x] -->

- [x] **Stage 1: Domain setup** — create lightweight domain registry/map and domain docs.
- [x] **Stage 2: Runtime spike** — verify Node `>=24`, `node:sqlite`, and native extension APIs.
- [x] **Stage 3: Node engine** — bump root engine policy to Node `>=24`.
- [x] **Stage 4: Scaffold** — create `.pi/extensions/session-sql/` with the generator.
- [x] **Stage 5: Store core** — implement pi-free SQLite store basics.
- [x] **Stage 6: Schema reset** — implement default schema, version, reset, and preservation.
- [x] **Stage 7: SQL execution** — classify results and cap returned previews.
- [x] **Stage 8: Native loading** — support native SQLite extension loading availability.
- [x] **Stage 9: Store tests** — validate store behavior with temp SQLite fixtures.
- [x] **Stage 10: Lifecycle** — wire pi session start/shutdown and status.
- [x] **Stage 11: Tool** — register model-facing `sql` tool and guidance.
- [x] **Stage 12: Command** — implement `/sql` command flows.
- [x] **Stage 13: Formatting** — render status/schema/query summaries.
- [x] **Stage 14: Smoke** — replace smoke with current Driver SDK scenario.
- [x] **Stage 15: Templates** — apply narrow template fixes if confirmed.
- [x] **Stage 16: Docs** — add README quick-start and detailed how-to.
- [x] **Stage 17: Retro** — capture magic-wand/retro and ledgers.
- [x] **Stage 18: Validation** — run checks and record manual resume proof.

---

## Acceptance Criteria

- [x] The agent can execute generic SQL against a private current-session store.
- [x] `/sql status` shows readiness, session linkage, default tables, and native extension loading availability.
- [x] `/sql schema` shows the versioned default schema.
- [x] `/sql <query>` supports insert/select with compact stable output.
- [x] `/sql reset` recreates a fresh default store for the current session.
- [x] Same-session data survives reload, process exit, and later resume.
- [x] New and forked sessions start independent and empty except defaults.
- [x] Custom tables survive reopen and are visible through `/sql schema`.
- [x] Returned result previews cap at 200 rows and mark truncation.
- [x] Validation passes through tests, smoke, self-check, manual resume proof, and retro capture.

---

## Key Risks

| Risk | Mitigation |
|------|------------|
| Node `>=24` engine bump affects existing users | Make the policy explicit and verify runtime before implementation. |
| Native extension loading can load local native code | Document it as trusted local capability and report availability in status. |
| State leaks across sessions or forks | Derive identity from the active session and test session separation. |
| Query output floods the TUI/model context | Apply 200-row preview cap and byte/query-size guards. |
| Smoke becomes nondeterministic | Smoke through `/sql`, not model tool selection. |
| Harness friction repeats | Capture magic-wand/retro notes and encode narrow fixes when grounded. |

---

## Checklist

- [x] T001: Create lightweight domain registry and maps (CS-2)
- [x] T002: Run and record runtime spike (CS-2)
- [x] T003: Bump root Node engine policy (CS-1)
- [x] T004: Scaffold session-sql extension (CS-1)
- [x] T005: Implement store core (CS-3)
- [x] T006: Implement default schema and reset (CS-3)
- [x] T007: Implement SQL execution and caps (CS-3)
- [x] T008: Support native SQLite extension loading (CS-2)
- [x] T009: Write store tests (CS-3)
- [x] T010: Wire pi lifecycle and status (CS-3)
- [x] T011: Register sql tool (CS-3)
- [x] T012: Implement /sql command flow (CS-3)
- [x] T013: Implement result formatting (CS-2)
- [x] T014: Replace smoke scenario (CS-2)
- [x] T015: Apply narrow template fixes if needed (CS-2)
- [x] T016: Add docs (CS-2)
- [x] T017: Capture retro and ledgers (CS-2)
- [x] T018: Run validation and resume proof (CS-3)

---

## Flight Log

<!-- Updated by /plan-6 and /plan-6a after each phase completes -->

### 2026-05-15 — Implementation started

Pre-phase harness validation initially failed on unrelated Biome formatting drift in `harness/scripts/packages.ts`; user approved fixing and continuing. Retry of `npm run self-check` passed.

### 2026-05-15 — Simple implementation complete

Delivered `session-sql` with Node `>=24`, pi-free SQLite store, default schema, native extension loading support, `sql` tool, `/sql` command, current Driver SDK smoke, docs, retro capture, and validation evidence. `npm run self-check` passed; manual resume proof passed with a real `pi --session <file>` restart.
