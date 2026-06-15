# Generic SQLite Session Tool

**Mode**: Simple

## Research Context

📚 This specification incorporates findings from `research-dossier.md`.

The research found that pi has the necessary extension, command, session lifecycle, and validation surfaces to support a current-session structured work store. It also identified the key planning risks: session identity must be derived from the active pi session, persisted data must stay outside project source files, validation should avoid depending on model behavior, and the implementation must make its runtime compatibility clear.

This specification also incorporates the authoritative workshop decisions in `workshops/001` through `workshops/007`. Those workshops define the detailed storage semantics, tool/command contract, default schema, validation strategy, implementation boundaries, and agent use-case patterns. This spec keeps the feature at the WHAT/WHY level and leaves implementation mechanics to the workshops and architecture plan.

No formal `docs/domains/registry.md` exists yet, so target domains below are identified as part of this spec.

## Summary

Build a generic SQLite workbench for the current pi session. The agent and human operator get one session-scoped SQL surface for structured scratch work such as todos, dependency graphs, review queues, test matrices, batches, and temporary state machines.

The feature exists to give the agent a durable, queryable working memory for the current session without turning that state into project source files, long-term memory, cloud recall, or a bespoke extension for every workflow.

## Goals

- Give the agent a private, structured SQL workspace scoped to the active pi session.
- Let the agent create arbitrary tables and run unrestricted trusted SQL for current-session work.
- Support native SQLite extension loading in v1 when the runtime exposes it, enabling future use cases such as vector search.
- Provide a small default work schema so a new session is useful immediately.
- Persist the current session’s SQL state across reloads, resumes, process exits, and later resumes of the same session.
- Ensure new and forked sessions start with independent empty stores plus the default schema.
- Give humans a deterministic `/sql` command surface for status, schema inspection, queries, reset, and smoke validation.
- Keep session SQL artifacts out of the repository and out of git-tracked project files.
- Protect the model and TUI from oversized returned output through result caps and truncation reporting.
- Validate the behavior with store-level tests, deterministic smoke, and manual resume proof.

## Non-Goals

- Do not build long-term user memory, cross-session recall, or historical session search.
- Do not build a cloud-synced or shared multi-user database.
- Do not copy parent-session rows into forked sessions in v1.
- Do not provide hard query cancellation, subprocess isolation, or a full SQL sandbox in v1.
- Do not restrict the agent to only the default schema; arbitrary agent-created schema is allowed.
- Do not create project-local database artifacts or files that should be committed.
- Do not split the model interface into many specialized SQL tools in v1.
- Do not broaden the harness or pi runtime beyond narrow validation/support changes needed for this feature.

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| session-work-state | **NEW** | **create** | Establish a session-local structured work store, including lifecycle, independence, persistence, reset, and default work schema expectations. |
| agent-tooling-interface | **NEW** | **create** | Expose the session store to the agent and human operator through a simple generic SQL UX with predictable status, schema, query, reset, result, and error behavior. |
| extension-authoring-harness | existing capability | **consume** | Use the existing project extension generation, testing, smoke, and self-check conventions to prove the feature; only narrow harness fixes are in scope if implementation friction reveals them. |

### New Domain Sketches

#### session-work-state [NEW]

- **Purpose**: Owns session-scoped structured state used by the agent while solving the current task. This domain defines what it means for state to belong to one pi session, survive resume, stay independent across new/forked sessions, and remain outside project source files.
- **Boundary Owns**: Session identity semantics, persistence expectations, reset semantics, default work-state concepts, fork/new independence, and protection against repository pollution.
- **Boundary Excludes**: Human-facing command formatting, model tool descriptions, historical memory/search, cross-session analytics, cloud sync, and implementation-specific driver mechanics.

#### agent-tooling-interface [NEW]

- **Purpose**: Owns the observable model and operator experience for using session SQL. This domain makes the feature discoverable, debuggable, and testable without relying on nondeterministic model behavior.
- **Boundary Owns**: Generic SQL tool behavior, `/sql` command behavior, status/schema/query/reset flows, compact result summaries, truncation reporting, and human-readable errors.
- **Boundary Excludes**: Storage internals, low-level schema migration mechanics, runtime compatibility, and broader harness design.

#### extension-authoring-harness [existing capability]

- **Purpose**: Owns the project conventions and validation loop for pi extensions. This feature consumes the existing harness to scaffold, test, smoke, and self-check the extension.
- **Boundary Owns**: Extension scaffolding conventions, store-test expectations, smoke scenario execution, self-check workflow, and difficulty-ledger feedback when friction is discovered.
- **Boundary Excludes**: Product semantics of session SQL, the contents of the session database, and broad toolchain replacement.
- **Boundary Review**: Treated as an existing project capability rather than a new formal domain because `harness/` and the related project rules already exist even though no `docs/domains/registry.md` has been created.

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=1, D=2, N=0, F=1, T=2
  - **S=1 — Surface Area**: New extension plus tests/smoke; optional narrow harness touch only if friction appears.
  - **I=1 — Integration**: Integrates with pi session lifecycle, tool/command surfaces, and validation harness.
  - **D=2 — Data/State**: Persistent per-session store, default schema, version metadata, reset, and independence rules.
  - **N=0 — Novelty**: Core product semantics are well-specified by workshops.
  - **F=1 — Non-Functional**: Trusted unrestricted SQL and output caps require deliberate boundaries, but no strict sandbox/compliance target.
  - **T=2 — Testing/Rollout**: Requires store tests, deterministic smoke, full self-check, and manual resume proof.
- **Confidence**: 0.84

### Assumptions

- The existing pi extension APIs can expose both a model-facing tool and human-facing command.
- The active session can be identified consistently across reload and resume.
- The selected implementation runtime supports built-in local SQLite, native SQLite extension loading APIs, and the project engine will require Node `>=24` for this in-tree extension.
- The workshops’ core decisions remain accepted unless explicitly revised during clarification.
- The feature is trusted local-agent infrastructure, not a hostile-input security boundary.

### Dependencies

- Current pi session lifecycle and extension registration behavior.
- Node `>=24` with built-in local SQLite support and native SQLite extension loading APIs.
- A writable user pi state location outside project source files.
- The project’s extension generator, test runner, smoke harness, and self-check scripts.
- Manual operator validation for long-lived resume behavior.

### Risks

- Runtime compatibility requires a project-level engine bump to Node `>=24`, including verification that the chosen Node build exposes native SQLite extension loading APIs.
- Unrestricted SQL can create large, slow, or surprising local side effects if the agent misuses it.
- Poor output capping could flood the TUI or model context.
- Session identity mistakes could leak state across sessions or lose expected state on resume.
- Fork behavior could surprise users if it is not clearly documented as fresh/empty.
- Smoke could become flaky if it depends on model tool choice instead of deterministic commands.

### Phases

Simple workflow mode should collapse implementation into one primary phase with inline tasks/checkpoints:

- Confirm runtime/platform policy and scaffold the extension.
- Build the session store, default schema, reset, and result classification.
- Add session lifecycle integration plus model and human SQL surfaces.
- Validate with store tests, deterministic smoke, self-check, and manual resume proof.
- Encode any narrow harness friction discovered during implementation.

## Acceptance Criteria

1. In a pi session, the agent can execute a generic SQL request against a private current-session store and receive structured success, row, mutation, or error results.
2. A human can run `/sql status` and see that the session SQL store is ready, which session it belongs to, and which default tables are present.
3. A human can run `/sql schema` and inspect the default schema without relying on model behavior.
4. A human can run `/sql <query>` to insert and select data, and query results are rendered compactly with stable success/error phrases suitable for smoke tests.
5. A human can reset the current session store and get a fresh store containing the default schema and no prior user rows.
6. A newly created session store includes a versioned default schema with session metadata, todos, and todo dependency support.
7. Agent-created custom tables and rows survive close/reopen of the same session store and are not removed by default schema initialization.
8. Data written in a session remains available after `/reload`, after process exit, and after later resume of the same session, as long as the underlying user pi state remains present.
9. A new session or forked session starts with its own empty store and does not inherit rows from the parent/source session.
10. The store artifacts are written outside the repository so normal project git status is not polluted by SQL usage.
11. Large result sets are capped at a 200-row returned preview, marked as truncated when applicable, and do not flood the model context or TUI.
12. Expected SQL and store errors are returned as tagged/structured failures and shown to humans as readable error messages.
13. Validation passes through type-checking, store tests, lint, deterministic `session-sql` smoke, self-check, and a recorded manual resume proof.
14. Native SQLite extension loading is available in v1 when supported by the runtime, so advanced local use cases such as vector search are not blocked by the session SQL wrapper.

## Testing Strategy

- **Approach**: Lightweight
- **Rationale**: Simple workflow mode favors a single implementation path, but this feature still needs targeted evidence for persistent session state and SQL behavior.
- **Focus Areas**:
  - Store tests for schema bootstrap, custom tables, persistence, separation, reset, caps, and tagged errors.
  - Deterministic `/sql` smoke for status → insert → select → reload → select.
  - Required project checks: `npm run typecheck`, `npm test`, `npm run lint`, `npm run smoke -- session-sql`, and `npm run self-check`.
  - Manual resume proof before claiming long-lived resume support.
- **Mock Usage**: Targeted mocks only. Store tests should use real temporary SQLite databases and real filesystem fixtures; mocks/fakes are allowed only for pi UI/session wiring or other external harness boundaries when a real pi runtime would make tests brittle.
- **Excluded**:
  - Model-selection smoke tests that rely on nondeterministic tool choice.
  - Heavy sandbox/timeout testing for SQL execution isolation in v1.
  - Broad CI/platform matrix beyond the selected runtime policy.

## Documentation Strategy

- **Approach**: Hybrid — README quick-start plus a detailed `docs/how/` guide.
- **README Scope**: Briefly explain what `session-sql` is, when to use `/sql`, where state lives, and the validation/smoke command.
- **Detailed Guide Scope**: Document agent use cases, custom table recipes, default schema, slash commands, persistence/fork semantics, reset behavior, and troubleshooting.
- **Rationale**: Humans need a quick entry point, while agents/operators need durable examples for using SQL effectively beyond the built-in todo tables.

## Agent Harness Readiness

- **Current Maturity**: L2, per `docs/project-rules/harness.md`.
- **Decision**: L2 is sufficient for `session-sql`; use the existing Boot → Interact → Observe loop.
- **Validation Loop**: Use `npm run smoke -- session-sql` to drive real `pi` in tmux, plus `npm run self-check` for the integrated observe gate.
- **Harness Improvement Policy**: Do not build a broad Phase 0 harness upgrade. If `session-sql` exposes friction, make narrow fixes such as smoke-template drift, status-clearing defaults, or clearer driver output.
- **Feedback Capture**: Collect magic-wand wishes and retrospective difficulties during validator/smoke work using `docs/how/agent-feedback.md`; promote actionable friction to `docs/difficulties.md` or an encoded harness fix.

## Risks & Assumptions

- **Trusted SQL boundary**: v1 intentionally trusts the local agent to run unrestricted SQL. This increases power and simplicity but means the tool is not a security sandbox.
- **Native extension boundary**: v1 intentionally allows native SQLite extension loading when the runtime supports it. This enables powerful local features such as vector search, but it also means trusted SQL may load native code from local paths.
- **Persistence boundary**: The feature promises session persistence, not permanent backup. If the user deletes pi state files, the corresponding session store can be lost.
- **Runtime boundary**: The implementation requires Node `>=24`; the root engine policy should be bumped so SQLite and native extension loading do not fail unexpectedly on older Node.
- **Output boundary**: SQL execution is trusted, but returned output must be capped to preserve TUI and model usability. v1 caps returned previews at 200 rows, with byte/query-size guards to prevent accidental context floods.
- **Fork boundary**: Forks intentionally start empty in v1; this must be documented so users do not expect copied state.
- **Validation boundary**: Automated smoke proves deterministic command behavior and reload persistence; long-lived resume requires a recorded manual proof.

## Clarifications

### Session 2026-05-15

- **Q1 — Workflow Mode**: Simple. Planning should prefer a single-phase, lightweight path with inline tasks/checkpoints while preserving the required validation evidence for this persistence-oriented extension.
- **Q2 — Mock Usage**: Targeted mocks only. Use real temp SQLite/filesystem behavior for store tests; allow small fakes for pi UI/session wiring where a real runtime would make tests brittle.
- **Q3 — Documentation Strategy**: Hybrid. Add a README quick-start and a detailed `docs/how/` guide covering use cases, custom table recipes, persistence/fork semantics, reset, and troubleshooting.
- **Q4 — Domain Review**: Keep `session-work-state` and `agent-tooling-interface` as new conceptual domains, but treat `extension-authoring-harness` as an existing project capability consumed by this feature.
- **Q5 — Agent Harness Readiness**: L2 is sufficient. Use the existing real-`pi` smoke harness, but collect magic-wand wishes and retrospectives as we go; make narrow harness/template fixes if implementation friction appears.
- **Q6 — Runtime Policy**: Require Node `>=24` for `session-sql` and bump the root engine policy accordingly. This matches the local development/runtime environment and keeps the v1 driver path simple.
- **Q7 — Output Caps**: Cap returned result previews at 200 rows in v1. The cap is for TUI/model output safety, not SQL execution; byte/query-size guards remain implementation safety rails for accidental floods.
- **Q8 — Native Extension Loading and DB Root**: Native SQLite extension loading is in scope for v1 when Node exposes it, because vector-search-style extensions could be useful. Keep the DB root fixed at `~/.pi/db/session-sql/` for v1.

## Open Questions

No critical open questions remain after clarification.

Resolved during clarification:

- Runtime policy: require Node `>=24` for this in-tree extension and bump the root engine policy accordingly.
- Output caps: return up to 200 rows by default/hard cap in v1; keep byte/query-size guards as implementation safety rails for accidental context floods.
- Native extension loading: support native SQLite extension loading in v1 when Node exposes it, enabling future vector-search-style use cases.
- Storage root: keep the session store root fixed at `~/.pi/db/session-sql/` in v1; defer configurability until real usage needs it.

## Workshop Opportunities

The main workshop opportunities have already been completed for this plan. No additional pre-architecture workshop is currently required unless clarification changes one of the settled decisions.

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Session semantics and safety boundary | Storage Design | Completed in `workshops/001`; defines product semantics and risk posture. | What persists, what forks inherit, how trusted SQL behaves, and what is capped? |
| Runtime/platform compatibility | Integration Pattern | Completed in `workshops/002`; implementation still needs final policy confirmation. | What runtime support is required, and how should unsupported environments fail? |
| Tool, command, and result contract | API Contract | Completed in `workshops/003`; defines the observable agent/human UX. | What does the generic SQL surface expose, and how are results/errors rendered? |
| Default schema and migrations | Data Model | Completed in `workshops/004`; defines the useful initial schema and migration posture. | Which default tables exist, how is schema versioned, and how are custom tables preserved? |
| Validation and smoke harness | Integration Pattern | Completed in `workshops/005`; defines proof obligations. | Which behavior is proven by tests, smoke, self-check, and manual resume proof? |
| Implementation slices and extension boundaries | Integration Pattern | Completed in `workshops/006`; ready for architecture planning. | What belongs in the store, wiring, smoke, tests, and optional harness fixes? |
| Agent SQL use cases and working patterns | Other | Completed in `workshops/007`; teaches agents how to use SQL beyond default todos. | When should agents use SQL, what custom tables should they create, and what anti-patterns should they avoid? |
