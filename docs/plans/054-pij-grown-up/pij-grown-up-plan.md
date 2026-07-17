# PIJ Grows Up — deterministic machine-wide platform
**Mode**: Full
**Plan Version**: 1.1.0 — folds validate-v2 findings V-01…V-05
**Created**: 2026-07-16
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context
📚 Incorporates findings from `research-dossier.md` (F-01…F-10, H-01…H-06) and the authoritative workshop `workshops/001-data-model.md` (WS-1…WS-6, human-ruled DO-NOT-RE-LITIGATE — spine Seq 403). Fleet survey (3 old primes) vendored under `reports/state-vocab-survey-replies/`.

### Summary
pij graduates from a heuristic, prose-governed peer fabric into a deterministic platform: first-class **Projects** and a **JSON governance spine** live machine-wide under `~/.pij` beside the node registry; every node sits in an **enforced parent tree** rooted at primes; node truth is a **two-axis state model** (pij-computed `system_state` + per-assignment semantic state) with rich metadata (task, model, effort, context gauges, tmux address); every write flows through pij as an **append-only attributed event** ("anyone can write, log who did it"); and every record is a **schema-versioned public contract** a future UI will read directly from disk.

### Goals
- Projects: create/list/link machine-wide; description, plan link (attachable after creation), prime assignment, task/assignment lists.
- JSON spine: single unified machine-wide event log, filterable per peer/project; markdown as a generated render.
- Enforced tree: every non-prime resolves a parent; parentless boots surface as `unadopted` and get adopted in; re-parenting is an event, never data loss.
- Two-axis states: honest mechanical truth (`unknown` over guessing) + fleet-validated semantic vocabulary scoped per assignment.
- Node metadata: currentTask/assignment, model, effort, harness, contextMax/current, tmux pane+window — enough for a UI to render a card and open a terminal.
- Derived safety: anomalies (axis-disagreement, unverified done, foreign hold-clear) are first-class queries, never write-time walls.

### Non-Goals
- The UI itself (data contracts only).
- Any ACL/permission enforcement on writes (WS-5/WS-6: attribution, not jail).
- A daemon HTTP/socket API (WS-4 rejected it).
- SQLite or any database (H-02).
- Rewriting/cutover of the prose `government/spine.md` — it stays authoritative until an explicit human cutover ruling (R4); this plan ships the consumer contract + dual-run only.
- Auto-reclaim/auto-kill on anomalies (survey: alert, never act).
- Cross-machine sync; copilot context telemetry beyond honest `unknown`.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| pij-orchestration | existing | **modify** | New machine-wide primitives: Project records, Assignment records, the unified spine event log, spine→md render |
| pij-messaging | existing | **modify** | Descriptor additive fields (assignment/task/state axes, windowId, context gauges); enforced-tree semantics over existing parentId/tree projections |
| pij-control-plane | existing | **modify** | CLI verbs (project/spine/node/task/state/anomalies), daemon runtime-axis verdicts (stopped/unknown), alert fan-out, windowId capture, context telemetry readers |
| pij-skill | existing | **modify** | New route guidance for task/state/project verbs (deploy ship-gated) |
| agent-tooling-interface | existing | **consume** | Follows existing CLI/tool UX conventions (`--json` envelopes, usage text) — no changes |
| extension-authoring-harness | existing | **consume** | TDD/fakes/self-check conventions govern the work — no changes |

### Testing Strategy
- **Approach**: Full TDD (house law: every module a `.test.ts` sibling; mutation-gated review).
- **Mock Usage**: targeted — in-memory fakes at system boundaries only (`adapters/fakes.ts`: registry/event-log/tmux/process/delivery + new FakeProjectStore/FakeSpineLog); fs adapters test against real fs in temp `PIJ_HOME` (fs-registry.test pattern).
- **Focus Areas**: schema guards + attribution envelope; state derivation (worst-first badge, axis verdicts, `unknown` honesty); tree enforcement + cycle/orphan; event append-only/replay-safety; legacy-descriptor load (additive law).
- **Excluded**: UI rendering; live multi-machine scenarios.

### Documentation Strategy
- **Location**: Hybrid — `docs/how/pij-platform.md` (+ migration contract doc) with a README pointer.
- **Rationale**: on-disk formats become a public contract (WS-4); the contract must be documented where operators and the future UI author will look.

### Complexity
- **Score**: CS-5 (epic)
- **Breakdown**: S=2, I=2, D=2, N=1, F=1, T=2 → 10
- **Confidence**: 0.8
- **Assumptions**: s051 lands before ship (canonical identity + caller-verified ownership); s052 restores `npm ci` before PR; daemon-restart baton available at deploy time.
- **Dependencies**: `.pi/models.json` (contextMax join); tmux `display-message` (window derivation); harness transcript formats (claude/codex context reads).
- **Risks**: see § Risks & Assumptions and Implementation § Risks.
- **Phases**: 4.

### Acceptance Criteria
1. **AC-01** `pij project create "<desc>" --json` writes `~/.pij/projects/<slug>/project.json` (schema-versioned, attributed); `pij project list --json` enumerates machine-wide; `pij project set <slug> --plan <path> --prime <pij-id>` links after creation. *Recorded deviation from WS-2's literal `<slug>.json`: directory-per-project (to host per-project files) — consistent with the machine-wide ruling's substance; project id = kebab-slug of the description, `-2`/`-3` collision suffix.*
2. **AC-02** `pij spine append` writes an attributed event to the single unified machine-wide log; `pij spine events --peer <id> --json` (and `--project`) returns exactly the matching events.
3. **AC-03** Every platform write (project/task/state/link) lands as an append-only event carrying actor, timestamp, prev→next, refs; prior events are never mutated or deleted by later writes; replayed/duplicate appends are idempotent (dedupe precedent: `appendOnce`).
4. **AC-04** `system_state ∈ {starting, working, idle, stalled, stopped, dead, unknown}` is computed by pij only; `starting` is written at spawn/adopt and holds until the first bind/readiness verdict; a suspended-but-alive pane reads `stopped`; missing telemetry reads `unknown` — never inferred `idle`/`dead`.
5. **AC-05** `pij task set` creates/points to an Assignment; `pij state set --assignment <ref>` sets per-assignment semantic state (`blocked|question|hold|waiting|ready|failed|cancelled|done` + structured refs); a node with no assignment falls back to its implicit *general* assignment; the node badge derives worst-first.
6. **AC-06** A `done` event without `verifiedBy` renders as *unverified* in `node show`/queries; a subsequent verify write adds `verifiedBy` and flips it — done is a claim until verified (survey-unanimous).
7. **AC-07** `pij anomalies --json` surfaces: axis-disagreement (semantic-active + system idle > threshold), unverified `done`, and hold cleared by a non-issuer — each with evidence refs; daemon pushes an alert to the node's parent once per transition (existing latch pattern), never acts on it.
8. **AC-08** Spawn records the **invoking session** as `parentId` (never cwd); a parentless non-prime shows `unadopted` in tree/list projections; `pij link` re-parent emits a spine event carrying the previous parent; cycles remain rejected; `spawnedBy` provenance is immutable.
9. **AC-09** `pij node show <id> --json` returns both state axes, current assignment/task, model, effort, harness, `contextMax` (models.json join), `contextCurrent` (`{value, asOf, provenance}` — real for pi/claude/codex, `unknown` for copilot), and tmux `{paneId, windowId}` sufficient to open a terminal (`tmux select-window -t <windowId>` proof).
10. **AC-10** `pij spine render` generates markdown from the JSON log (pure module); the prose `government/spine.md` is untouched by all of this; the migration contract doc defines the dual-run posture and the explicit human cutover ruling required to switch (R4).
11. **AC-11** Every pre-existing descriptor (no new fields) still loads and round-trips; the full existing suite stays green (additive-schema law, `types.ts:106,143,155` comment class "all optional ⇒ migration-safe").
12. **AC-12** `docs/how/pij-platform.md` documents every on-disk record as a schema-versioned public contract (the UI reads files directly — WS-4); README points at it; the pij skill gains the node/task/state route (deploy ship-gated).

### Risks & Assumptions
- s051 rewrites identity/ownership surfaces this plan builds on → convergence re-read of main before merge; parent-enforcement tests double as #20 regression guards.
- Unbounded spine growth → out of scope to solve now; render + queries stream; archival noted as follow-up.
- Free-writes abuse is accepted by ruling (WS-5/WS-6) — mitigated by attribution + anomaly queries, not prevention.
- Event replay/duplicate delivery (1ca01u5's 24h replay incident) → append idempotence + consumed-marker pattern (inbox read-marker precedent).

### Open Questions
- Cutover timing for the JSON spine (human ruling by design — R4; not a plan blocker).
- Axis-disagreement threshold default (ship with 30m, tunable) — settled at implementation unless Jordan objects.

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Data model: store/location/lookup/DAG | Data Model / Storage Design | RESOLVED — `workshops/001-data-model.md` (WS-1…WS-6, authoritative) | — |

### Clarifications
#### Session 2026-07-16
- Q: Workflow Mode? → **Full** (Jordan).
- Q: Testing Strategy? → **Full TDD** (Jordan).
- Q: Mock Usage? → **Targeted** — fakes at boundaries (Jordan).
- Q: Documentation Strategy? → **Hybrid** — "probably all of em" (Jordan).
- Q: Semantic state node-wide vs per-assignment? → **B: per-assignment** ("B... is that silly?" → affirmed; implicit *general* assignment as ambient fallback).

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved (001-data-model).

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | informs Key Findings, phases, risks |
| workshops/001-data-model.md | y | authoritative — WS-1…WS-6 bind every design choice below |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Rounds 1+2 resolved; no critical markers remain |
| G2 | Constitution | N/A | no `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | no `docs/project-rules/architecture.md` (house rules in harness.md honored via conventions) |
| G4 | ADR Compliance | N/A | `docs/adr/` empty |
| G5 | Structure | PASS | all required sections present |
| G6 | Testing Alignment | PASS | Full TDD — test tasks precede impl in every phase table |
| G7 | Domain Completeness | PASS | all domains existing/registered; manifest covers all files |

### Summary
Build the platform bottom-up in four phases: (1) the machine-wide store — Project/Assignment/Spine records, attribution envelope, CLI verbs; (2) node truth — two-axis states, assignments on nodes, context/window metadata, anomaly queries; (3) enforced tree + adoption semantics; (4) the governance consumer contract — spine render, migration posture, skill route, public-contract docs. Everything is worktree-confined until the PR gate (R3); s051/s052 convergence is re-checked at merge time.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/platform/types.ts` (NEW) | pij-orchestration | contract | Project/Assignment/SpineEvent schemas, guards, attribution envelope |
| `.pi/extensions/pij/core/platform/project.ts` / `spine.ts` / `assignment.ts` (NEW) | pij-orchestration | internal | pure core logic (create/link/derive/filter) |
| `.pi/extensions/pij/core/platform/render-spine-md.ts` (NEW) | pij-orchestration | internal | pure JSON→markdown render (peer-packet.ts style) |
| `.pi/extensions/pij/adapters/project-store.ts` / `assignment-store.ts` / `spine-store.ts` (NEW) | pij-orchestration | internal | fs adapters under `~/.pij/projects/`, `~/.pij/assignments/`, `~/.pij/spine/` (subdir law, focus-store precedent) |
| `.pi/extensions/pij/adapters/fakes.ts` | pij-messaging | internal | + FakeProjectStore, FakeSpineLog |
| `.pi/extensions/pij/core/types.ts` | pij-messaging | contract | additive descriptor fields (assignment/task/axes/windowId/context) |
| `.pi/extensions/pij/core/tree.ts` | pij-messaging | internal | adoption axis (`unadopted`) in projections |
| `.pi/extensions/pij/core/state.ts` | pij-control-plane | internal | runtime-axis vocabulary + worst-first badge derivation |
| `.pi/extensions/pij/core/daemon/loop.ts` | pij-control-plane | internal | stopped/unknown verdicts, writeMerged externally-owned additions, alert latch |
| `.pi/extensions/pij/daemon.ts` | pij-control-plane | internal | anomaly alert fan-out wiring |
| `.pi/extensions/pij/core/cli.ts` + `.pi/extensions/pij/cli.ts` | pij-control-plane | internal | new pure verbs: project/spine/node show/task/state/anomalies (+USAGE, CliDeps ports) |
| `.pi/extensions/pij/core/spawn.ts` | pij-control-plane | internal | windowId capture at spawn/adopt; caller-parent recording |
| `.pi/extensions/pij/core/context/` (NEW) | pij-control-plane | internal | contextMax join + per-harness contextCurrent readers (pi/claude/codex; copilot→unknown) |
| `skills/pij/SKILL.md` + `skills/pij/references/routes/node.md` (NEW) | pij-skill | contract | route registry row + task/state/project route (deploy ship-gated) |
| `docs/how/pij-platform.md` (NEW), `docs/how/pij-governance-migration.md` (NEW), `README.md` | — (docs) | contract | public on-disk contract + dual-run/cutover posture |
| `.pi/models.json` | — | consumed | read-only contextWindow join |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Top-level `~/.pij/*.json` is owned by `FsRegistry.list()` — any new top-level file mints a phantom peer (focus-store.ts:59) | All new records live in subdirs: `~/.pij/projects/`, `~/.pij/spine/` |
| 02 | Critical | Daemon runs tsx off source, no hot-reload; restarts are a governed machine-wide baton | Worktree tests use isolated fakes/temp homes; live deploy sequenced at ship, never mid-plan |
| 03 | High | `PijEvent` has no actor field; no purge/ack exists — a 24h verbatim replay incident is on record | Attribution is an additive envelope on new spine events; append idempotence via `appendOnce` hard-link dedupe + consumed markers (inbox read-marker precedent) |
| 04 | High | No persisted `system_state` today — activity/liveness computed at read time; daemon persists via `writeMerged` with `MUTABLE_EXTERNALLY_OWNED_FIELDS` protection (loop.ts:149) | New runtime-axis verdicts persist through writeMerged; `currentTask`/assignment/semantic fields join the externally-owned list so the daemon never clobbers them |
| 05 | High | `windowId` exists nowhere; derivation precedent: daemon lock resolves `#{window_id}` via `display-message` (daemon.ts:451-459); spawn already captures `%N` from `split-window -P` | Capture windowId at spawn (extend format) + adopt (display-message) + daemon backfill for legacy nodes |
| 06 | High | CLI is two-tier: pure verbs in core/cli.ts (ParsedCommand:72, ALLOWED_FLAGS:308, dispatch:748) + bin intercepts (cli.ts:2693) | All new verbs go pure-core with CliDeps ports; family verbs follow the `runFocus` subcommand precedent |
| 07 | High | s051 rewrites identity/ownership (issue #20: spawn parent from cwd not caller — live-reproduced corruption) | Phase 3 parent-enforcement tests double as #20 regression guards; convergence re-read at merge |
| 08 | High | contextCurrent sources verified: claude transcript `message.usage` sums, codex rollout `total_token_usage`; copilot exposes only compaction `tokensRemoved` | Ship `{value, asOf, provenance}` with honest `unknown`; pi reads in-process |
| 09 | Medium | No JSON→md renderer exists in pij (peer-packet.ts is the pure-render style precedent); prose spine stays authoritative until human cutover (R4) | New pure `render-spine-md.ts`; dual-run posture documented, cutover is a ruling artifact |
| 10 | Medium | Test conventions to copy: fs adapters against real fs in `mkdtempSync` temp PIJ_HOME (fs-registry.test.ts:114); env save/restore (focus.test.ts:53-61); daemon `tick()` single-step with fakes | Copy these patterns; no new test infrastructure |

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | Platform store: projects, assignments, spine | pij-orchestration | Machine-wide schema-versioned records + attributed event log + CLI verbs | None |
| 2 | Node truth: two-axis states, metadata, anomalies | pij-control-plane | Descriptor/daemon/CLI carry honest mechanical + per-assignment semantic truth | Phase 1 |
| 3 | Enforced tree + adoption | pij-messaging | Caller-verified parentage, unadopted surfacing, re-parent events | Phase 1 (events); converges with s051 |
| 4 | Governance contract: render, migration, skill, docs | pij-orchestration | Spine render + dual-run migration posture + skill route + public-contract docs | Phases 1–3 |

#### Phase 1: Platform store — projects, assignments, spine

**Objective**: Stand up the machine-wide store: Project/Assignment/SpineEvent records with attribution, fs adapters, and the CLI verbs over them.
**Domain**: pij-orchestration (+ pij-control-plane verb wiring)
**Delivers**: `~/.pij/projects/<slug>/project.json`, `~/.pij/assignments/<assignmentId>.json`, `~/.pij/spine/events.ndjson` (single unified log), schema guards, `pij project`/`pij spine` verbs, fakes.
**Depends on**: None
**Key risks**: getting the attribution envelope right first — every later phase writes through it.

**Assignment entity (binding spec — V-01)**: one JSON file per assignment at `~/.pij/assignments/<assignmentId>.json` (registry file-per-record pattern; subdir law). Id scheme `asg-<adjective-noun>` (memorable-id generator reuse), implicit general assignment fixed id `asg-general-<nodeId>`, **materialized on first task/state write** for a node with none. Fields: `{version, id, nodeId, projectSlug?, task, states[] (event refs), opened{actor,ts}, closed?{actor,ts,reason: done|cancelled|failed|superseded}}`. Lifecycle `open → closed(reason)`. A project's task list = the assignments carrying its `projectSlug` (join by query, no duplicated list); the node descriptor carries `currentAssignment: <id>`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Contract tests: Project/Assignment/SpineEvent shapes, version guards, attribution envelope `{actor, ts, prev?, next?, refs[], verifiedBy?}` | pij-orchestration | failing tests enumerate every record field + guard rejection cases | TDD; FocusManifest version-guard precedent |
| 1.2 | Implement `core/platform/types.ts` + pure logic modules (create/link/filter) | pij-orchestration | 1.1 green; guards reject unversioned/foreign records | |
| 1.3 | Adapter tests: FsProjectStore + FsSpineStore in temp PIJ_HOME — subdir layout, atomic writes, append idempotence, `lastSeq` recovery | pij-orchestration | failing tests cover crash/replay/duplicate-append; phantom-peer regression (no top-level files) | Finding 01, 03, 10 |
| 1.4 | Implement fs adapters reusing `writeJsonAtomic`, `publishNoReplace`, FsEventLog append/lastSeq/appendOnce | pij-orchestration | 1.3 green | |
| 1.5 | CLI verb tests: `project create/list/show/set`, `spine append/events --peer/--project/--json` | pij-control-plane | failing tests cover parse, dispatch, JSON envelopes, filter exactness (AC-01/02) | |
| 1.6 | Implement verbs: ParsedCommand + ALLOWED_FLAGS + MAX_POS + parseArgs + dispatch + USAGE + CliDeps ports wired in bin | pij-control-plane | 1.5 green; `--json` output stable | Finding 06 |
| 1.7 | FakeProjectStore/FakeSpineLog in `adapters/fakes.ts` | pij-messaging | downstream phases test against fakes only | |

#### Phase 2: Node truth — two-axis states, assignments, metadata, anomalies

**Objective**: Nodes carry honest mechanical state, per-assignment semantic state, context gauges, and terminal addressability; anomalies become queries + parent alerts.
**Domain**: pij-control-plane (+ pij-messaging types)
**Delivers**: additive descriptor fields, `task set`/`state set`/`node show`/`anomalies` verbs, daemon stopped/unknown verdicts, context readers, windowId capture.
**Depends on**: Phase 1
**Key risks**: daemon writeMerged clobbering externally-owned fields; heuristic creep (must stay honest-`unknown`).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Tests: additive descriptor fields (`currentAssignment`, denormalized `semanticState`, `systemState`, `windowId`, `contextMax`, `contextCurrent{value,asOf,provenance}`) + legacy-descriptor load regression | pij-messaging | failing tests incl. AC-11 legacy round-trip | Additive law, types.ts:106 comment class |
| 2.2 | Implement types.ts fields + add externally-owned fields to `MUTABLE_EXTERNALLY_OWNED_FIELDS` | pij-messaging | 2.1 green; daemon merge test proves no clobber | Finding 04 |
| 2.3 | Tests+impl: `pij task set <node> "<task>" [--project]` and `pij state set <node> <state> [--assignment] [--refs…]` → Assignment record + attributed spine event + descriptor denorm; implicit *general* assignment fallback; worst-first badge derivation in `core/state.ts` | pij-control-plane | AC-05 scenarios green incl. multi-assignment node showing derived badge | WS-6 vocabulary + structured refs |
| 2.4 | Tests+impl: windowId capture — spawn format extension (`split-window -P`), adopt (`display-message #{window_id}`), daemon backfill for legacy live nodes | pij-control-plane | AC-09 tmux address proof: `select-window -t <windowId>` targets the node's window | Finding 05 |
| 2.5 | Tests+impl: `core/context/` — contextMax via boundModel→models.json join; contextCurrent readers (pi in-process, claude usage-sum, codex total_token_usage tail; copilot → `unknown`) | pij-control-plane | AC-09 gauge fields green; absent source yields `unknown`, never a guess | Finding 08 |
| 2.6 | Tests+impl: daemon runtime axis — `starting` written at spawn/adopt (holds until first bind/readiness verdict), `stopped` (suspended pane) + `unknown` (missing telemetry) beside dead/stalled; persist via writeMerged; **mechanical-axis transitions append to the spine with `actor: daemon` provenance (V-05 ruling)** — anomaly evidence refs point at those events; legacy per-peer `events.ndjson` stays a delivery-transport internal, excluded from the public contract | pij-control-plane | AC-04 green incl. just-spawned-unbound node reads `starting`; readiness-regex failure path lands `unknown` with provenance | V-02, V-05 |
| 2.7 | Tests+impl: `pij node show <id> --json` full card + list-projection additions | pij-control-plane | AC-09 full card asserted field-by-field; tree JSON carries new fields free (additive) | Scout finding 2 |
| 2.8 | Tests+impl: `pij anomalies --json` (axis-disagreement w/ threshold, unverified done, foreign hold-clear) + daemon parent-alert via existing deliver+latch | pij-control-plane | AC-06/AC-07 green; alert fires once per transition; no auto-action | 1ca01u5 44h incident |

#### Phase 3: Enforced tree + adoption

**Objective**: Every non-prime resolves a caller-verified parent; orphans surface as `unadopted`; re-parenting is evented history.
**Domain**: pij-messaging
**Delivers**: spawn/adopt parent capture, adoption projection, evented `pij link`, provenance separation.
**Depends on**: Phase 1 (spine events); converges with s051 at merge
**Key risks**: overlap with s051's ownership rewrite — tests written as behavior contracts so they survive the converged implementation.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Tests: spawn records the invoking session as `parentId` — cwd never consulted; adopt honors `--parent`; prime spawns root | pij-messaging | failing tests reproduce issue #20 shape and assert caller-truth (AC-08) | Finding 07 — doubles as s051 regression guard |
| 3.2 | Implement parent capture at spawn/adopt; `unadopted` adoption-axis projection in tree/list (separate from runtime state — carp's split) | pij-messaging | AC-08 projections green; boot of parentless non-prime stays legal | WS-1 |
| 3.3 | Tests+impl: `pij link` re-parent emits spine event `{prevParent, newParent, actor}`; `spawnedBy` immutable provenance; cycle rejection retained | pij-messaging | event visible via `spine events --peer`; history reconstructable | |
| 3.4 | Tests+impl: adoption guidance surface — `pij tree --json` unadopted flagging + skill-facing hint text (route content lands in Phase 4) | pij-messaging | unadopted nodes enumerable machine-wide (UI query shape) | |

#### Phase 4: Governance contract — render, migration, skill, docs

**Objective**: Ship the consumer contract: spine markdown render, dual-run migration posture with explicit human cutover, the skill route, and the public on-disk contract docs.
**Domain**: pij-orchestration + pij-skill
**Delivers**: `render-spine-md.ts` + `pij spine render`, migration doc, skill route (ship-gated deploy), `docs/how/pij-platform.md`, README pointer, acceptance sweep.
**Depends on**: Phases 1–3
**Key risks**: none technical; cutover is deliberately NOT executed (R4).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Tests+impl: pure `render-spine-md.ts` (events → markdown) + `pij spine render` writing `~/.pij/spine/spine.md` | pij-orchestration | AC-10 render green; byte-stable for identical input | peer-packet.ts style; Finding 09 |
| 4.2 | `docs/how/pij-governance-migration.md`: dual-run posture, prose spine authoritative, cutover = explicit human ruling artifact; prime-flow.json (E309) freeze/supersede note | — | reviewed doc states the contract unambiguously (AC-10) | R4 constraint |
| 4.3 | Skill route: SKILL.md registry row + `references/routes/node.md` (task/state/project usage, adoption nudge) — worktree edit only, deploy ship-gated | pij-skill | `just pij-skill-check` green in worktree; deploy step listed in ship checklist, not executed | R3 hard stop |
| 4.4 | `docs/how/pij-platform.md` (every record schema as public contract, anomaly queries, UI file-reading guide incl. derivation rules for anything not materialized) + README pointer | — | AC-12; a UI author can implement list/tree/card from this doc alone | WS-4 binding implication |
| 4.5 | Acceptance sweep: isolated harness run — temp `PIJ_HOME`, fake tmux/process, daemon driven via single-step `tick()` (Finding 10 pattern) exercising project→assign→state→verify→anomaly→render roundtrip + full `harness checks` | — | all 12 ACs demonstrated within the R3 fence (no live daemon/global state); suite green | V-04 |
| 4.6 | Ship checklist doc (executed at ship, not now): daemon-restart baton → live two-peer demo incl. AC-07 parent alert → `just pij-skill-install` deploy (4.3) → convergence re-read of main (s051/s052) | — | checklist exists with explicit R3-gated steps; nothing executed pre-ship | V-04 |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | 1.1–1.6 | 1.5 verb tests + 4.5 sweep |
| AC-02 | 1.3–1.6 | 1.5 filter-exactness tests |
| AC-03 | 1.1–1.4, 2.3 | 1.3 replay/idempotence tests |
| AC-04 | 2.6 (incl. `starting` at spawn/adopt) | 2.6 verdict + just-spawned tests |
| AC-05 | 2.3, 2.7 | 2.3 multi-assignment scenarios |
| AC-06 | 2.3, 2.8 | 2.8 unverified-done query test |
| AC-07 | 2.8 | 2.8 anomaly + latch tests |
| AC-08 | 3.1–3.4 | 3.1 caller-truth + 3.3 event tests |
| AC-09 | 2.4, 2.5, 2.7 | 2.7 full-card assertion + 2.4 tmux proof |
| AC-10 | 4.1, 4.2 | 4.1 render tests + 4.2 doc review |
| AC-11 | 2.1, 2.2 | 2.1 legacy round-trip + full suite |
| AC-12 | 4.3, 4.4 | 4.4 doc review + skill check |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| s051 merge conflicts on identity/descriptor surfaces | High | Medium | Behavior-contract tests (3.1); convergence re-read of main before merge; s051 PR lands first (R3) |
| Daemon deploy needs machine-wide restart baton | Certain | Low | All dev against fakes/temp homes; restart sequenced at ship only |
| Spine log growth unbounded | Medium | Low | Streaming queries; archival follow-up noted, out of scope |
| Free-writes produce garbage states | Medium | Low | Ruled acceptable (WS-5/6); attribution + anomalies make it visible; vocabulary guards reject unknown enum values at the channel |
| copilot context stays unknowable | High | Low | Honest `unknown` is the contract (AC-09) |
| Event replay resurrects state | Low | Medium | Append idempotence + consumed markers (Finding 03) |
