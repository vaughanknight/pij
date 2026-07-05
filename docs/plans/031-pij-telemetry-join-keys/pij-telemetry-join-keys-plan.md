# pij Telemetry Join-Keys

**Mode**: Simple
**Plan Version**: 1.1.0
**Created**: 2026-07-04
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context
📚 Incorporates the live codebase map + scoping write-up produced this session
(`docs/notes/telemetry-join-keys-scoping.md`) for peer orchestrator **pij-4s10mb**.
Key grounding, verified against source:
- The harness↔pij join key is **already persisted** per peer: `SessionDescriptor.harnessSessionId`
  (`core/types.ts:81`) holds the copilot session uuid / forked-claude session uuid / codex rollout
  trailing-uuid, written on bind (`core/daemon/loop.ts:303/336` via `applyBinding`), alongside
  `harness`, `boundModel`, `spawnedBy`, `lifecycle`, and — codex only — `transcriptPath` (the
  absolute rollout `.jsonl`). A daemon reverse index `byHarnessSession` already exists
  (`core/daemon/index-state.ts:32`).
- So fleet cost attribution is *already* a deterministic registry read (`~/.pij/<id>.json`); the
  telemetry team's env-archaeology is unnecessary. The gap is a **clean query surface**, not capture.
- `adopt` already persists the *adopting orchestrator's own* `harnessSessionId` (`cli.ts:756-766`),
  BUT its resolver is claude-shaped: `resolveAdoptSessionId(CLAUDE_CODE_SESSION_ID, claudeStems)`
  (`core/binding.ts:47-53`, AC-14) — so a **copilot/codex** orchestrator resolves the wrong id or
  `null`. That is the one genuine code bug blocking non-claude orchestrator self-identity.

### Summary
Surface the already-captured harness↔pij join keys through a first-class query verb, and fix
`adopt` so a non-claude orchestrator persists its own join key — turning fleet cost attribution
into a deterministic registry lookup instead of env archaeology. No registry schema change and no
daemon bind-flow change: Plan 019 already did the capture.

### Goals
- A stable `pij sessions --json` join-table verb emitting one row per session with the telemetry
  join tuple, so a consumer (fleet telemetry) reads a clean contract instead of globbing raw
  descriptor JSON. Works for read-only reviewer peers too (they bind and get a descriptor).
- `adopt`'s inner-session-id resolution is **harness-aware** (claude · copilot · codex), so an
  adopting orchestrator of any harness persists its own `harnessSessionId` (and codex `transcriptPath`).
- Optional ergonomic sugar: `pij adopt --export` (and/or `pij whoami --env`) prints an eval-able
  `export PIJ_SESSION_ID=…` line that repairs pij self-resolution in the adopted shell and tags
  future children — explicitly **not** the telemetry fix (it cannot retro-tag the running process).

### Non-Goals
- No change to `SessionDescriptor` schema — every field the tuple needs already exists.
- No change to the daemon bind flow / discovery (`core/daemon/loop.ts`) — capture already works.
- Not building a telemetry pipeline or cost-attribution report — that lives in the consumer
  (pij-4s10mb's harness telemetry); this plan only exposes the keys it joins on.
- No attempt to retro-tag an already-running orchestrator's process env (impossible; out of scope).

### Target Domains
> pij has no `docs/domains/` registry, so domains are identified inline as code areas. The tables
> below are the whole domain context (per § Domain context loading — proceed without a registry).

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| pij-cli (`core/cli.ts`, `cli.ts`) | existing | **modify** | Add the `sessions` verb + `whoami --env` / `adopt --export` output; parse/arity/usage |
| pij-binding (`core/binding.ts`) | existing | **modify** | Make adopt's session-id resolution harness-aware |
| pij-registry (`core/types.ts`, `adapters/fs-registry.ts`) | existing | **consume** | Read `SessionDescriptor`s; no schema/field change |
| pij-harness (`core/harness/transcript.ts`, `claude.ts`/`codex.ts`) | existing | **consume** | Reuse `transcriptLayout(harness)` id-extractors for per-harness adopt resolution |

### Testing Strategy
- **Approach**: **Hybrid** — Full-TDD the pure logic (the join-tuple projection; the harness-aware
  resolver; the export-line builder), lightweight validation for the thin CLI wiring (verb parse +
  dispatch smoke).
- **Rationale**: pij's core is pure ports-and-adapters with strong existing coverage
  (`core/*.test.ts`); the load-bearing correctness is in the pure functions, so test them first.
- **Focus Areas**: join-tuple field correctness (incl. codex `transcriptPath`, absent fields);
  per-harness resolver selection + newest-active heuristic; export-line escaping.
- **Excluded**: real tmux / real harness processes (fakes + fixtures only).
- **Mock Usage**: **Avoid mocks** — use the existing fakes (`FakeTmux`) + temp `~/.pij` / temp
  transcript-dir fixtures (`PIJ_HOME` override), consistent with the current suite.

### Documentation Strategy
- **Location**: CLI `--help`/usage text only (in-scope for the tasks) + the existing
  `docs/notes/telemetry-join-keys-scoping.md`, which already captures the contract for the consumer.
- **Rationale**: internal dev tooling; the verb is self-describing via `--help` and the consuming
  fleet already has the scoping doc. No new doc file earns its keep for a quick flow.

### Complexity
- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=1, D=0, N=1, F=0, T=1
- **Confidence**: 0.8
- **Assumptions**: the newest-active session artifact is the adopting orchestrator's own — for
  claude/codex a cwd-scoped/recorded transcript (AC-14's existing assumption), for copilot the
  newest `~/.copilot/session-state/*` dir by mtime (**global, not cwd-scoped** — so concurrent
  copilot sessions are the residual ambiguity captured in § Risks; prefer an explicit copilot
  session-id env var if one is exposed).
- **Dependencies**: none beyond the existing `transcriptLayout` per-harness id-extractors.
- **Risks**: see § Risks & Assumptions.
- **Phases**: 1 (Simple).

### Acceptance Criteria
1. **AC-1** — `pij sessions --json` emits a JSON array with one object per registry descriptor,
   each carrying `{ pijId, harness, harnessSessionId, transcriptPath?, boundModel?, spawnedBy?,
   lifecycle? }`; a bound peer's row shows its `harnessSessionId`, a codex row shows its absolute
   `transcriptPath`, and unbound/absent fields are `null`/omitted (never invented).
2. **AC-2** — `pij sessions` (no `--json`) prints a readable aligned table of the same tuple.
3. **AC-3** — adopting a **copilot** pane resolves and persists the copilot session uuid into
   `harnessSessionId`; adopting a **codex** pane persists the rollout uuid **and** its absolute
   `transcriptPath`; adopting a **claude** pane behaves exactly as today (no regression).
4. **AC-4** — when a harness's session id cannot be resolved at adopt time, the descriptor is still
   written `pending` (no crash, no wrong-harness id) — the existing fallback is preserved.
5. **AC-5** — `pij adopt --export` (and/or `pij whoami --env`) prints `export PIJ_SESSION_ID=<id>`
   (plus `PIJ_PARENT_ID`/`PIJ_ROLE` when known) as the only stdout, safe to `eval`.
6. **AC-6** — `npx tsc --noEmit` is clean and the full existing test suite stays green.

### Risks & Assumptions
- **Newest-active heuristic**: for copilot/codex, adopt picks the newest existing session artifact
  for the cwd by mtime as the orchestrator's own — correct in the normal one-active-session case,
  potentially ambiguous with concurrent same-cwd sessions. Mitigation: prefer an explicit env id
  when the harness exposes one; document the heuristic in `--help`; it matches the claude rule's
  existing assumption, so it is not a new risk class.
- **`sessions` vs extending `list --json`**: a dedicated verb keeps a stable, telemetry-focused
  contract decoupled from `list`'s human/live-state view — chosen deliberately (see Open Questions).

### Open Questions
- Should `--export` live on `adopt`, `whoami`, or both? Recommendation: `adopt --export` (the moment
  identity is established) as primary; `whoami --env` as a re-emit convenience. Implement `adopt
  --export` first; `whoami --env` is a cheap add in the same task group.

### Workshop Opportunities
_None — the design is a projection verb + a resolver reusing existing per-harness code; no unsettled
design shape or feasibility unknown warrants a workshop._

### Clarifications
#### Session 2026-07-04
- **Workflow Mode**: Simple (`--simple`) — CS-2, single code area, no multi-phase dependency.
- **Testing Strategy**: Hybrid — TDD the pure logic, lightweight for CLI wiring.
- **Mock Usage**: Avoid mocks — existing fakes + temp fixtures.
- **Documentation**: CLI `--help` + the existing scoping doc; no new doc file.
- **Validation (2026-07-04, re-scope)**: `/validate-v2` proved that "reuse `transcriptLayout(harness)`"
  is false for **copilot** (its layout is the inert CLAUDE_LAYOUT; naive reuse mis-binds to a claude
  stem). Decision: **fix it in** — copilot adopt-resolution ships in this plan via a new
  `~/.copilot/session-state` scanner (finding 02b; T005/T006). codex/claude unchanged.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | n | superseded by `docs/notes/telemetry-join-keys-scoping.md` (functional dossier, with file:line) |
| docs/notes/telemetry-join-keys-scoping.md | y | informs Key Findings + the whole scope |
| workshops/*.md | n | none |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Round 1 answered; no critical [NEEDS CLARIFICATION] remain |
| G2 | Constitution | N/A | no `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | no `docs/project-rules/architecture.md` |
| G4 | ADR Compliance | N/A | no `docs/adr/` entries constrain this |
| G5 | Structure | PASS | all required sections present + populated |
| G6 | Testing Alignment | PASS | Hybrid: pure-logic test tasks precede their impl; wiring has smoke checks |
| G7 | Domain Completeness | PASS | no domain registry; inline code-area domains + Manifest cover every file |

### Summary
Add a pure join-tuple projection over `SessionDescriptor`s and expose it as `pij sessions [--json]`;
make `adopt`'s inner-session-id resolution harness-aware by reusing `transcriptLayout(harness)`'s
id-extractors so copilot/codex orchestrators persist their own `harnessSessionId`; and add an
eval-able `--export`/`--env` output line. All read/reuse existing capture — no schema or daemon change.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/session-join.ts` (NEW) | pij-cli | contract | Pure `buildSessionJoinRows(descriptors)` → the telemetry join tuple |
| `.pi/extensions/pij/core/session-join.test.ts` (NEW) | pij-cli | internal | TDD for the projection |
| `.pi/extensions/pij/core/cli.ts` | pij-cli | contract | Dispatch the `sessions` verb; `whoami --env`; accepted-flags/arity |
| `.pi/extensions/pij/core/binding.ts` | pij-binding | contract | Harness-aware adopt resolver (extend/replace `resolveAdoptSessionId`) |
| `.pi/extensions/pij/core/binding.test.ts` | pij-binding | internal | TDD for per-harness resolution |
| `.pi/extensions/pij/core/harness/copilot.ts` | pij-harness | contract | NEW `copilotSessionStateScan(home)` discovery helper (list session-state dirs → newest uuid) |
| `.pi/extensions/pij/core/harness/copilot.test.ts` | pij-harness | internal | TDD for the copilot session-state scanner |
| `.pi/extensions/pij/cli.ts` | pij-cli | internal | `runAdopt` wiring (harness-aware + `--export`); `sessions` usage line |
| `.pi/extensions/pij/core/harness/transcript.ts` | pij-harness | consume | Reuse `transcriptLayout('codex')` for codex only (copilot's is the inert CLAUDE_LAYOUT — not reused) |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Join key already captured: `harnessSessionId` (+ `harness`/`transcriptPath`/`boundModel`/`spawnedBy`) is persisted per peer on bind (`types.ts:81`, `loop.ts:303/336`). | Feature #1 is a **projection**, not new capture — build a pure tuple builder + verb; no daemon touch. |
| 02 | Critical | `adopt`'s resolver is claude-shaped: `resolveAdoptSessionId(CLAUDE_CODE_SESSION_ID, claudeStems)` (`binding.ts:47-53`). Copilot/codex orchestrators get the wrong id or null. | Make resolution **harness-aware, per harness** (NOT a blanket `transcriptLayout` reuse): **claude** → env id / newest stem (unchanged); **codex** → reuse `transcriptLayout('codex')` (CODEX_LAYOUT is real discovery); **copilot** → NEW `~/.copilot/session-state/*` scanner. Preserve the claude path byte-for-byte. |
| 02b | High | `transcriptLayout('copilot')` is the **inert CLAUDE_LAYOUT** (`transcript.ts:44,60` — "copilot/pi never actually discover"); the only copilot code is a path **builder** `copilotEventsPath(home, sid)` (`copilot.ts:27`), not a session-state *lister*. Naive reuse would resolve a copilot orchestrator to the newest **claude** stem in that cwd — a wrong-harness join key (validation HIGH). | copilot resolution is **new code**, not reuse: list `~/.copilot/session-state/*`, newest by mtime, dir-name = uuid; never fall through to the claude dir for a copilot adopt. |
| 03 | High | codex needs the **absolute** `transcriptPath` (uuid can't reconstruct the date-nested path); adopt persists it today only for claude-shaped resolves. | On a codex adopt, persist both the rollout uuid (`harnessSessionId`) and `transcriptPath`, mirroring `loop.ts:337`. |
| 04 | High | Env cannot retro-tag an already-running orchestrator; the registry read is the real self-identity fix. | Ship `--export` as **sugar** (pij self-resolution + child tagging) and say so in `--help`; do not frame it as the telemetry fix. |
| 05 | Medium | `whoami`/`list` already project descriptors via `deps.registry.list()` (`core/cli.ts:403-440`). | Model `sessions` as a sibling pure-dispatch verb (no daemon), same shape as `list`. |

### Implementation

**Objective**: Expose the persisted harness↔pij join keys through `pij sessions`, and make `adopt`
persist a correct `harnessSessionId` for any harness — plus eval-able `--export` sugar.
**Testing Approach**: Hybrid — pure-logic tasks are test-first (test task precedes its impl);
CLI-wiring tasks carry a lightweight dispatch/smoke check. No mocks; fakes + temp `PIJ_HOME`/transcript fixtures.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | **Test** the pure join-tuple projection: given descriptors (bound copilot, bound codex w/ transcriptPath, pending, no-spawnedBy), assert exact tuple + null/omitted absent fields | pij-cli | `core/session-join.test.ts` | Tests written and RED (function absent) | TDD; covers AC-1 edge cases |
| [ ] | T002 | Implement `buildSessionJoinRows(descriptors): JoinRow[]` — pure projection to `{ pijId, harness, harnessSessionId, transcriptPath?, boundModel?, spawnedBy?, lifecycle? }` | pij-cli | `core/session-join.ts` | T001 GREEN; no invented fields | Per finding 01/05 |
| [ ] | T003 | Wire the `sessions` verb into `dispatch`: `--json` → `JSON.stringify(rows)`, else aligned text table; add to accepted-flags (`json`,`here`) + arity + `parseArgs` | pij-cli | `core/cli.ts` | `pij sessions --json` and `pij sessions` both emit; `--here` filters by cwd | Covers AC-1/AC-2 |
| [ ] | T004 | **Smoke test** `sessions` dispatch over a temp `PIJ_HOME` registry fixture (json + text) | pij-cli | `core/cli.ts` test (or `core/session-join.test.ts`) | Test asserts rows for ≥2 descriptors | Lightweight wiring check |
| [ ] | T005 | **Test** the NEW copilot scanner + harness-aware resolution: claude→env/stem (unchanged), codex→`transcriptLayout('codex')` uuid + abs path, copilot→newest `~/.copilot/session-state/*` uuid, none→null | pij-harness, pij-binding | `core/harness/copilot.test.ts`, `core/binding.test.ts` | Tests written and RED | TDD; covers AC-3/AC-4 + finding 02b |
| [ ] | T006 | Implement (a) NEW `copilotSessionStateScan(home)` in `copilot.ts` — list `~/.copilot/session-state/*`, newest by mtime, dir-name = uuid; (b) harness-aware `resolveAdoptSessionIdForHarness(harness, env, …)` dispatching **claude**→env/stem, **codex**→`transcriptLayout('codex')`, **copilot**→(a). **Never** fall through to the claude dir for copilot; preserve the claude path byte-for-byte | pij-harness, pij-binding | `core/harness/copilot.ts`, `core/binding.ts` | T005 GREEN | Per finding 02/02b/03 |
| [ ] | T007 | Wire the harness-aware resolver into `runAdopt`; on codex also persist `transcriptPath` (mirror `loop.ts:337`) | pij-cli | `cli.ts` (`runAdopt` ~752-766) | Adopt persists correct `harnessSessionId` per harness; claude unchanged | Covers AC-3 |
| [ ] | T008 | **Test** + implement the eval-able export line: pure `buildExportLines(descriptor)` → `export PIJ_SESSION_ID=<id>` (+ PARENT/ROLE when known); add `adopt --export` and `whoami --env` (only-stdout) | pij-cli | `core/session-join.ts`(or new), `core/cli.ts`, `cli.ts` | `pij adopt <pane> --export` / `pij whoami --env` print an eval-safe line | Covers AC-5; finding 04 |
| [ ] | T009 | Update `--help`/usage for `sessions`, `adopt --export`, `whoami --env` (note export ≠ telemetry fix); run `npx tsc --noEmit` + full suite | pij-cli | `cli.ts`, `core/cli.ts` | typecheck clean; suite green | Covers AC-6; doc-in-help |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-1 | T001, T002, T003 | projection tests + `sessions --json` smoke |
| AC-2 | T003, T004 | text-table smoke |
| AC-3 | T005, T006, T007 | per-harness resolver tests + adopt wiring |
| AC-4 | T005, T006 | none-resolves→null test; pending descriptor preserved |
| AC-5 | T008 | export-line test + `--export`/`--env` output |
| AC-6 | T009 | `tsc --noEmit` + full suite |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Newest-active-transcript picks the wrong session under concurrent same-cwd harnesses | Low | Medium | Prefer explicit env id when present; document heuristic in `--help`; matches existing claude AC-14 rule |
| `sessions` contract drift vs consumer expectations | Low | Low | Freeze the tuple shape in T002 + tests; scoping doc already shared with pij-4s10mb |
| Regression in the claude adopt path while generalising the resolver | Low | High | T005 pins the claude path first; implement copilot/codex as added branches, not a rewrite |
| Copilot adopt mis-binds to a **claude** stem via the inert `transcriptLayout('copilot')` (validation HIGH) | Med (if reused naively) | High | Dedicated `copilotSessionStateScan` (T006a); resolver **never** reads the claude dir for a copilot adopt — proven by a T005 case asserting a claude transcript in-cwd is NOT picked for copilot |
