# State-Model v2
**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-07-20
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context

Source mapping in `reports/preamble-checkpoint.md` confirms `state set` and `state verify` are existing journal-first coupled writes under the platform write lock. The semantic vocabulary is closed and has no `working` state. The anomaly self-remedy already landed in `0ac2f2e`; it is a regression obligation, not implementation work.

### Summary

Add `pij state clear <node>` so an operator can remove the current assignment's declared semantic exception and return it to undeclared. Clear preserves assignment history and mechanical truth, emits an auditable state-clear event, and removes only the descriptor's semantic denormalization. It is a verb, never a new state.

### Goals

- Parse and execute `pij state clear <node> [--assignment <id>] [--actor <label>] [--json]`.
- Preserve the journal-first, write-lock, append-once, assignment-chain contract of state writes.
- Make the latest chain state undeclared after clear while retaining prior state events.
- Remove only `semanticState`; preserve current assignment/task and all mechanical fields.
- Keep anomaly output self-remediating and `working` absent from semantic vocabulary.

### Non-Goals

- Add a `working` semantic state or alter system-state vocabulary.
- Close, cancel, verify, or replace the assignment.
- Clear mechanical `systemState`, process activity, task text, or assignment history.
- Add close-out rituals or assignment lifecycle automation.
- Reimplement the already-landed anomaly remedy.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|----------------------|
| `pij-messaging` | existing | modify | CLI grammar/result, descriptor denormalization, and state-chain projection. |
| `pij-control-plane` | existing | modify | Platform spine event kind and journal-first coupled write composition. |
| `extension-authoring-harness` | existing capability | consume | Focused unit/integration/acceptance and full ship gates. |

### Testing Strategy

- **Approach**: Full TDD for parser, chain reducer, journal lifecycle, denormalization, and output.
- **Focus Areas**: explicit/current assignment resolution, repeated clear, clear→set, set→clear, journal recovery, descriptor field preservation, strict flags/help/JSON.
- **Excluded**: live daemon restart; this is CLI-side and uses existing stores.
- **Mock Usage**: targeted existing fake ports for failure injection; real temporary filesystem acceptance for CLI wiring.

### Documentation Strategy

Update the existing `docs/how/pij.md` state command section and existing `pij-messaging` / `pij-control-plane` domain docs. No new standalone guide.

### Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=1, D=2, N=1, F=1, T=1 (7)
- **Confidence**: 0.93
- **Assumptions**: clear is auditable and therefore appends a dedicated event even when already undeclared; it never materializes a missing general assignment.
- **Dependencies**: existing assignment store, op journal, spine log, platform write lock, descriptor denorm helper.
- **Risks**: a reducer that ignores clear, partial coupled writes, or accidental mechanical-state deletion.
- **Phases**: 1.

### Acceptance Criteria

- **AC-01 — Grammar**: exact `state clear` syntax parses with optional assignment/actor/JSON; unknown flags, missing node, or extra positionals fail `E-ARG` without writes.
- **AC-02 — Closed vocabulary**: `SEMANTIC_STATES` remains byte-identical and contains no `working`; clear is represented only as a command/event.
- **AC-03 — Target resolution**: explicit assignment must exist and belong to the node; otherwise current assignment is used; absent/missing target fails honestly and never materializes a general assignment.
- **AC-04 — Audit/history**: clear records a dedicated `state-cleared` event journal-first, appends its stamped seq to the assignment chain, and preserves all earlier state events.
- **AC-05 — Undeclared projection**: `chainStateOf`, `node show`, and JSON report no semantic state after the latest clear; a later `state set` becomes current normally.
- **AC-06 — Descriptor safety**: `semanticState` is removed after clear while `currentAssignment`, `currentTask`, `systemState`, runtime fields, parent, and ownership remain unchanged.
- **AC-07 — Failure honesty**: journal/store/append/chain/denorm failures preserve existing “WAS recorded” semantics and recover exactly once on the next platform write.
- **AC-08 — Output**: human output names node, assignment, and spine seq; JSON returns the stamped clear event.
- **AC-09 — Anomaly semantics**: an open cleared assignment is semantic-undeclared and may participate in the existing lost-dispatch predicate; parked-state exceptions stop suppressing after clear.
- **AC-10 — Self-serve remedy regression**: axis-disagreement output still names `pij state set <node> waiting|hold|blocked|question`.
- **AC-11 — Compatibility**: legacy `pij state <id>`, `state set`, and `state verify` behavior remains unchanged; focused and full gates pass.

### Risks & Assumptions

| Risk | Treatment |
|------|-----------|
| Repeated clear creates audit noise | Deliberate: write verbs record intent consistently; output remains explicit. |
| Clear event breaks old reducers | Teach the single shared `chainStateOf` reducer; tests cover set→clear→set. |
| Denorm removal clobbers daemon fields | Re-read latest descriptor under existing lock and omit only `semanticState`. |
| No target assignment exists | Fail `E-NOREG`; never create state merely to clear it. |

### Open Questions

None.

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| _None_ | Other | Existing state family and journal contract determine the design. | — |

### Clarifications

#### Session 2026-07-20

- **Workflow Mode**: Simple — one cohesive CLI/core phase.
- **Testing**: Full TDD with existing fake ports and temporary filesystem acceptance.
- **Mocks**: Targeted failure-injection fakes only.
- **Documentation**: Existing operator/domain docs.
- **Binding ruling**: clear-verb, not a `working` state; declare-only-exceptions.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — existing contracts determine the shape

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | no | Mandate, evidence brief, current source, and preamble checkpoint are sufficient. |
| workshops/*.md | no | Jordan's clear-verb ruling is already authoritative. |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Clear semantics and non-goals are explicit. |
| G2 | Constitution | N/A | No project constitution file. |
| G3 | Architecture | PASS | Extends existing journal-first state family; no new storage/domain. |
| G4 | ADR Compliance | N/A | No accepted ADR conflicts. |
| G5 | Structure | PASS | Unified Simple plan with complete task and coverage tables. |
| G6 | Testing Alignment | PASS | Tests precede implementation; acceptance criteria are measurable. |
| G7 | Domain Completeness | PASS | Every referenced file maps to an existing registered domain. |

### Summary

Add one command and one event kind to the existing state-family machinery. The write follows the exact journal-first/commit/append-chain/clear lifecycle already used by `state set` and `state verify`, then removes only the semantic descriptor denorm. Shared readers interpret a latest clear as undeclared, preserving history and the mechanical axis.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/platform/types.ts` | pij-control-plane | contract | Add exact `state-cleared` event kind constant. |
| `.pi/extensions/pij/core/platform/types.test.ts` | pij-control-plane | internal | Event vocabulary/guard proof. |
| `.pi/extensions/pij/core/platform/journal.ts` | pij-control-plane | internal | Single coupled-op recovery resolver recognizes state-clear. |
| `.pi/extensions/pij/core/platform/journal.test.ts` | pij-control-plane | internal | Intent/committed replay and chain reconciliation proof. |
| `.pi/extensions/pij/core/platform/render-spine-md.ts` | pij-control-plane | internal | Existing state-family spine renderer includes clear transitions. |
| `.pi/extensions/pij/core/platform/render-spine-md.test.ts` | pij-control-plane | internal | Clear rendering and field-level history proof. |
| `.pi/extensions/pij/core/platform/ports.ts` | pij-control-plane | contract | Assignment-store recovery contract comment, only if required. |
| `.pi/extensions/pij/core/anomalies.ts` | pij-control-plane | internal | Shared chain reducer interprets latest set/clear. |
| `.pi/extensions/pij/core/anomalies.test.ts` | pij-control-plane | internal | set→clear→set and anomaly regression proof. |
| `.pi/extensions/pij/core/cli.ts` | pij-messaging | contract | Parsed command, strict flags, dispatch, journal-first write, output. |
| `.pi/extensions/pij/core/cli.test.ts` | pij-messaging | internal | Parser/dispatch/failure/recovery/denorm TDD. |
| `.pi/extensions/pij/cli.ts` | pij-control-plane | contract | Help/usage surface only; stores already wired. |
| `.pi/extensions/pij/cli.integration.test.ts` | pij-control-plane | internal | Real CLI grammar and filesystem outcome. |
| `.pi/extensions/pij/acceptance-sweep.test.ts` | pij-control-plane | internal | Node/anomaly end-to-end projection. |
| `docs/how/pij.md` | pij-messaging | contract | State clear operator usage. |
| `docs/domains/pij-messaging/domain.md` | pij-messaging | contract | Command/projection contract. |
| `docs/domains/pij-control-plane/domain.md` | pij-control-plane | contract | State-clear event/write ownership. |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | High | `state` dual routing recognizes only exact `set|verify`; strict flag/arity tables centralize the extension point. | Add exact `clear` across the same discriminated union, tables, parser, dispatch containment, and help. |
| 02 | Critical | State writes are journal-first coupled operations under a machine-wide write lock; bypassing this would make clear unauditable or partially applied. | Clone the lifecycle shape, not ad-hoc registry deletion. |
| 03 | High | `chainStateOf` currently treats the latest `state-set` as current and knows no clear event. | Add one event kind and make the reducer choose the latest set-or-clear transition. |
| 04 | High | `denormDescriptor` already removes stale `semanticState` when passed undefined while preserving latest descriptor fields. | Reuse it after the clear event/chain lands; keep assignment/task unchanged. |
| 05 | High | Missing general assignments are materialized by `state set`; clear must not create a declaration target merely to remove it. | Resolve existing target only and fail honestly if none exists. |
| 06 | Critical | Journal recovery whitelists assignment state kinds in one shared resolver; omitting `state-cleared` would strand or mis-adjudicate a cut coupled write. | Extend `ASSIGNMENT_STATE_KINDS`/recovery tests; never add a parallel clear-only resolver. |
| 07 | High | The spine markdown renderer recognizes existing state-family kinds explicitly. | Extend the existing renderer/tests so audit output includes clear transitions. |
| 08 | High | Anomaly remedy text already landed and names the parked-state command. | Keep it as a regression assertion; do not rewrite. |

### Implementation

**Objective**: Add an auditable `state clear` verb that returns the chosen assignment to undeclared without touching mechanical truth.
**Testing Approach**: Full TDD using existing fake platform ports plus temporary-filesystem CLI integration.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Add parser/help tests for exact `state clear` grammar, strict flags/arity, optional assignment/actor/JSON, and unchanged positional `pij state <id>`. | pij-messaging | `core/cli.test.ts`, `cli.integration.test.ts` | Current source is RED only for the new command; all legacy grammar cases stay green. | Tests first. |
| [ ] | T002 | Add reducer/anomaly tests for set→clear, clear→set, repeated clear, parked-state suppression removal, and self-remedy regression. | pij-control-plane | `core/anomalies.test.ts`, `acceptance-sweep.test.ts` | Latest clear yields undefined semantic state/history retained; later set wins. | Tests first. |
| [ ] | T003 | Add failure-injection tests for journal record, assignment write, append-once, chain update, journal clear, denorm failure, and shared recovery. | pij-control-plane | `core/cli.test.ts`, `core/platform/journal.test.ts` | Every cut reports accurate WAS/not-WAS semantics and replays exactly once through the one resolver. | Mirror existing state-family matrix. |
| [ ] | T004 | Add `state-cleared` event constant; teach `chainStateOf`, journal recovery, and spine rendering the same transition. | pij-control-plane | `core/platform/types.ts`, `core/anomalies.ts`, `core/platform/journal.ts`, `core/platform/render-spine-md.ts` | T002/T003 green; event vocabulary and audit render guards green. | No semantic vocabulary change or parallel resolver. |
| [ ] | T005 | Add parsed `state-clear` command and journal-first dispatch using existing actor/target/write-lock/recovery/denorm seams. | pij-messaging | `core/cli.ts` | T001/T003 green; no missing general assignment is materialized; JSON/human output exact. | Preserve current assignment/task. |
| [ ] | T006 | Wire help/docs/domain text and real CLI acceptance. | pij-control-plane | `cli.ts`, `cli.integration.test.ts`, `docs/how/pij.md`, domain docs | Command is discoverable; temporary PIJ_HOME round-trip set→clear→show proves undeclared + mechanical field preservation. | CLI-side; no daemon restart. |
| [ ] | T007 | Run focused suites, typecheck, lint, reversible reducer/write mutations, `harness checks`, and cold review. | extension-authoring-harness | All gates green or exact failures reported; clear-removal and reducer-inversion mutations RED→restore→GREEN. | Stop before commit/ship unless separately granted. |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01–03 | T001, T003, T005 | parser/dispatch tests |
| AC-04–05 | T002, T004, T005 | event/reducer/chain tests |
| AC-06–07 | T003, T005 | descriptor preservation + failure/recovery tests |
| AC-08 | T001, T005, T006 | human/JSON/CLI integration |
| AC-09–10 | T002, T004, T006 | anomaly/acceptance tests |
| AC-11 | T001, T007 | legacy regressions + full gates |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Clear silently behaves like a new state word | Low | High | Dedicated event kind; semantic array mutation test. |
| Latest-state reducer ignores clear | Medium | High | Ordered transition tests + mutation inversion. |
| Partial write loses audit or denorm | Medium | Critical | Existing journal-first lifecycle and full cut-point matrix. |
| Registry write deletes mechanical fields | Medium | High | Latest-descriptor basis and exact field-preservation assertions. |
| Stream 1 Phase 1 overlaps CLI files | High | Medium | Same orchestrator/worktree serializes Stream 1 Phase 1 first and re-reads diff before Stream 2 implementation. |
