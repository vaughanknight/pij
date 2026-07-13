# Copilot GPT-5.6 Effort Levels
**Mode**: Simple
**Plan Version**: 1.0.2
**Created**: 2026-07-12
**Status**: READY
**Spec source**: unified (this file)

📚 Incorporates findings from `research-dossier.md`

## Business Specification

### Research Context

Pi's live `github-copilot` registry exposes only `minimal,xhigh,max` for `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`. Pij derives levels from that map, advertises both the raw `github-copilot` rows and their `copilot` seed clones, and uses the first exact id match for validation. One exact-id level constant must be applied at two registry construction seams: provider-guarded Pi parsing for raw rows/clones, and `copilotEntry()` for snapshot aliases.

### Summary

Make pij advertise and validate the correct model-specific effort levels for Copilot's GPT-5.6 Sol, Terra, and Luna models. Each must support exactly `none, low, medium, high, xhigh, max`; `minimal` is unsupported. All other models remain source-derived, Codex keeps its separate curated table, and spawn/agent surfaces remain warn-don't-block.

### Goals

- `pij models` human and JSON output show the exact six ruled levels for every existing Copilot projection of the trio.
- The Pi client view (`pij models --harness pi`) and Pi spawn validation consume the same corrected raw `github-copilot` entries.
- The shared effort validator treats all six ruled levels as supported and `minimal` as unsupported for each id.
- The correction works with both Pi-derived verified entries and Copilot snapshot fallbacks.
- Mutation-resistant tests prove the override is exact-id, Copilot-only, and consumed consistently by discovery and validation.

### Non-Goals

- Do not remove, merge, reorder, or otherwise change duplicate `github-copilot` and `copilot` rows.
- Do not edit `~/.pi/agent/models.json`, the installed Pi binary, or Copilot CLI behavior.
- Do not hard-reject spawn or agent runs; unsupported effort remains a warning and the operation continues.
- Do not change Codex, Claude, the Pi transport/effort suffix translation, provider-prefix normalization in model matching, unrelated Copilot models, or harness flag translation.
- Do not create a new domain or ADR.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|--------------|---------------------|
| `pij-control-plane` | existing | **modify** | Correct the pure model-registry level contract consumed by `pij models`, peer spawn, and agent run/spawn validation |

### Testing Strategy

- **Approach**: Full TDD.
- **Rationale**: The behavior is a small pure-data correction with a high regression risk if the provider/id guard broadens; tests can prove both sides of the boundary cheaply.
- **Focus Areas**: raw Pi parse, Copilot seed clone, snapshot fallback, Copilot and Pi client rendering/JSON, validation for all seven relevant values, warning composition, non-Copilot and unrelated-model preservation.
- **Excluded**: live peer spawning and external network calls; Copilot's generic help is already observed and the shipped validator is pure.
- **Mock Usage**: Avoid mocks; use structural registry fixtures and existing fake CLI dependencies.

### Documentation Strategy

- **Location**: `docs/how/pij-models-discovery.md` and `docs/domains/pij-control-plane/domain.md`.
- **Rationale**: The operator guide currently states source-derived precedence, while the domain contract omits the model-registry capability; both should record the narrow model-specific correction without describing duplicate rows as a new feature.

### Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=1, D=0, N=0, F=0, T=2 (sum 4)
- **Confidence**: 0.93
- **Assumptions**: Jordan's exact six-level ruling is authoritative over Pi's incomplete model map; existing duplicate rows remain intentionally unchanged for this work.
- **Dependencies**: Existing `ModelEntry.levels`, `validateEffort()`, `buildEffortWarning()`, `dispatch(models)`, and `loadModels()` composition.
- **Risks**: An id-only override could leak to another provider; a seed-only fix could leave raw-row validation wrong; a snapshot-only omission could regress offline behavior.
- **Phases**: One Simple implementation phase.

### Acceptance Criteria

- **AC-01**: For each of `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`, `pij models --harness copilot` and `--json` render every existing matching row with exactly `none,low,medium,high,xhigh,max` in that order and never `minimal`.
- **AC-02**: For each trio id, `validateEffort()` returns `ok:true` for `none`, `low`, `medium`, `high`, `xhigh`, and `max`, and returns `{ok:false,unsupported:true}` for `minimal` with the exact supported-level list.
- **AC-03**: `buildEffortWarning("minimal", <trio-id>, known)` emits the existing warn-don't-block message with the exact six supported levels; a ruled level such as `none` emits no warning.
- **AC-04**: Raw `github-copilot` parse entries, `copilotSeedFromPi()` clones, and `copilotSnapshot()` aliases all carry the corrected trio levels; snapshot aliases remain `verified:false`.
- **AC-05**: A same-named id under a non-Copilot provider and unrelated `github-copilot` models preserve their source-derived maps unchanged; Codex curated levels are unchanged.
- **AC-06**: Existing duplicate provider-row count/order and spawn/agent continuation behavior remain unchanged.
- **AC-07**: Removing the curated branch, broadening it beyond `github-copilot`, or reintroducing `minimal` causes a targeted test to fail; `harness checks` passes after restoration.
- **AC-08**: `pij models --harness pi` exposes the corrected raw `github-copilot` trio levels; the shared effort validator consumed by spawn accepts the six ruled values and warns on `minimal` for the bare trio ids; the existing Pi `:<level>` command translation is unchanged. Provider-prefixed Pi model normalization is a pre-existing limitation outside this fence.

### Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Pi-source override applies to the same id under another provider | Low | High | Require provider=`github-copilot` on the parse path; apply the same exact-id constant separately inside Copilot-only snapshot construction |
| Only one projection is corrected | Medium | High | Test raw parse, seed clone, snapshot alias, and duplicate CLI rows |
| Snapshot alias appears verified because it has curated levels | Low | Medium | Assert `verified:false`; document curated capability does not equal live verification |
| Future Pi data becomes accurate and diverges from the override | Low | Low | Isolate exact ids and level constant so review/removal is obvious |

### Open Questions

_None for product behavior._

### Workshop Opportunities

_None — the authoritative level set and narrow registry seam are settled._

### Build Configuration Gate

**CONFIRMED (Spine Seq 102).** Separate Copilot `gpt-5.6-sol` xhigh coder and reviewer. The domain-contract path remains held until PR #9 merge + rebase; the current implementation fence is recorded in `rulings.md`.

### Clarifications

#### Session 2026-07-12

- **Workflow Mode**: Simple — one existing domain and one cohesive registry correction.
- **Testing Strategy**: Full TDD — required mutation-resistant pincer coverage.
- **Mock Usage**: Avoid mocks — pure fixtures and existing fakes.
- **Documentation Strategy**: Update the existing model-discovery guide and control-plane domain contract.
- **Scope ruling**: Do not broaden duplicate provider-row behavior without a separate ruling.
- **Lifecycle ruling**: Cold validate this plan, then stop at `WAITING_FOR_BUILD_CONFIG`.
- **Implementation ruling**: The Pi client in pij is also in scope for verification of the corrected effort levels. The granted proof is Pi-filter advertisement, shared bare-id validation, and unchanged Pi effort translation; provider-prefix normalization needs a separate production-file grant.
- **Coordination ruling**: Peer compaction is fire-and-forget — send compact immediately without `--wait`, continue orchestration, and only special-case a one-shot `E-DEAD`.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | fixes the correction at the provider/id-aware registry boundary and defines the preservation pincer |
| workshops/*.md | n | no unresolved design topic |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Exact ids, levels, invalid value, preservation scope, and stop condition are explicit |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md`; plan preserves pure core and existing domain direction |
| G4 | ADR Compliance | N/A | No accepted ADRs |
| G5 | Structure | PASS | Unified business/implementation halves, measurable ACs, manifest, tasks, coverage, and risks present |
| G6 | Testing Alignment | PASS | RED registry/consumer tests precede implementation; mutation pincer and full gate are explicit |
| G7 | Domain Completeness | PASS | Existing `pij-control-plane` domain covers every planned file; no new domain or edge |

### Summary

Add one exact Copilot GPT-5.6 trio level constant in the pure model registry and apply it at two explicit seams: provider-guarded Pi parsing and Copilot-only snapshot construction. Existing discovery and validation consumers then receive the corrected levels without branching. Tests pin the exact ids, parse-provider boundary, allowed/unsupported values, both existing provider projections, fallback verification status, and unchanged unrelated models.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/models/registry.ts` | `pij-control-plane` | internal | Owns source-derived and curated per-model level data |
| `.pi/extensions/pij/core/models/registry.test.ts` | `pij-control-plane` | internal | Pins raw parse, seed clone, snapshot fallback, and preservation boundary |
| `.pi/extensions/pij/core/models/validate.test.ts` | `pij-control-plane` | internal | Proves the shared validator consumes the corrected entries for all seven relevant values |
| `.pi/extensions/pij/core/spawn.test.ts` | `pij-control-plane` | internal | Proves warning text and warn-don't-block semantics from corrected entries |
| `.pi/extensions/pij/core/models/cli-models.test.ts` | `pij-control-plane` | internal | Proves human/JSON advertisement for both existing provider projections |
| `docs/how/pij-models-discovery.md` | `pij-control-plane` | internal | Documents source-derived default plus the exact model-specific correction |
| `docs/domains/pij-control-plane/domain.md` | `pij-control-plane` | contract | Records the model registry/effort validation capability and history |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Pi's live trio map is incomplete and `levelsFromThinkingMap()` faithfully exposes it | Use one exact-id level constant in provider=`github-copilot` parsing and in Copilot-only `copilotEntry()` snapshot construction |
| 02 | High | Validation takes the first exact id, which is the raw Pi row before the Copilot clone | Correct raw parse rather than only `copilotSeedFromPi()` |
| 03 | High | `pij models --harness copilot` intentionally includes raw and cloned rows | Test both rows; do not alter cardinality/order |
| 04 | High | Snapshot fallback currently has no level data | Give exact trio aliases curated levels while preserving `verified:false` |
| 05 | High | All peer/agent validation surfaces already share `ModelEntry.levels` and warn-don't-block | Change registry data only; add consumer tests, not validator branches |
| 06 | High | The Pi harness filter intentionally returns all provider rows, while canonical provider-prefixed Pi spawn ids do not exact-match bare registry ids | Add Pi-filter output, shared bare-id validation, and effort-suffix regression assertions; record prefix normalization as out of scope |

### Implementation

**Objective**: Correct the trio's registry contract once and prove every current consumer sees it without changing unrelated models or control-plane semantics.
**Testing Approach**: Full TDD with structural fixtures and explicit mutation checks.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | RED: add registry-boundary fixtures for all three ids under `github-copilot`, their seed clones, snapshot aliases, an unrelated Copilot model, and a same-id non-Copilot provider | `pij-control-plane` | `core/models/registry.test.ts` | Current code fails exact six-level expectations; preservation cases define the guard | Findings 01, 02, 04 |
| [ ] | T002 | RED: derive entries from the registry fixture and test all six allowed levels + unsupported `minimal`, warning composition, Copilot output for both existing provider projections, Pi-client output from the raw row, shared bare-id validation, and unchanged Pi effort suffix translation | `pij-control-plane` | `core/models/validate.test.ts`, `core/spawn.test.ts`, `core/models/cli-models.test.ts` | Current code fails `none/low/medium/high`, accepts `minimal`, and advertises the incomplete set through both client views | Findings 03, 05, 06 |
| [ ] | T003 | Implement one exact trio level constant; use a provider=`github-copilot` + id guard for Pi model/override parsing, and use the same id guard directly in Copilot-only `copilotEntry()` snapshot construction | `pij-control-plane` | `core/models/registry.ts` | T001/T002 green; constant order is `none,low,medium,high,xhigh,max`; snapshot aliases remain `verified:false`; no validator/CLI/spawn production branch changes | AC-01..06 |
| [ ] | T004 | Update the existing operator and domain contracts with the narrow override, fallback semantics, and unchanged duplicate-row behavior | `pij-control-plane` | `docs/how/pij-models-discovery.md`, `docs/domains/pij-control-plane/domain.md` | Docs match code and state `verified:false` remains distinct from curated capability knowledge | |
| [ ] | T005 | Prove the mutation pincer and final gates: remove curated branch → RED; remove provider guard → RED; add `minimal` → RED; restore, run targeted tests, Pi-free source assertion, `just typecheck`, `just lint`, `just test`, and `harness checks` | `pij-control-plane` | All mutations are caught and the restored tree passes every gate; live Copilot and Pi JSON views show exact levels for the trio | AC-07, AC-08 |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T001, T002, T003, T005 | Registry + CLI human/JSON tests and live read-only command |
| AC-02 | T002, T003 | `validate.test.ts` table over 3 ids × 7 levels |
| AC-03 | T002, T003 | `spawn.test.ts` warning/no-warning assertions |
| AC-04 | T001, T003 | Raw parse, seed clone, snapshot alias assertions |
| AC-05 | T001, T003, T005 | Non-Copilot same-id, unrelated Copilot, Codex regression + broadened-guard mutation |
| AC-06 | T002, T003 | CLI row-count/order assertion and unchanged warning continuation contract |
| AC-07 | T005 | Three mutation proofs + `harness checks` |
| AC-08 | T002, T003, T005 | Pi-filter CLI assertions, shared bare-id validation, existing Pi effort-command regression, and live Pi JSON view |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Curated constant becomes a second global taxonomy | Low | High | Keep the constant and exact id set private; default parse path remains `levelsFromThinkingMap()`, and only `copilotEntry()` reuses it outside parsing |
| Consumer tests duplicate registry tests without proving composition | Medium | Medium | Build consumer inputs through `parseModelsJson()`/`copilotSeedFromPi()`, not hand-authored corrected entries |
| Documentation implies curated aliases are live-verified | Low | Medium | Assert and document `verified:false` independently of `reasoning/levels` |
| Scope drifts into duplicate-row cleanup | Medium | Medium | AC-06 and task notes pin row count/order as preservation behavior |
| Pi provider-prefixed spawn id bypasses exact bare-id validation | Medium | Medium | Record as a pre-existing model-matching limitation; do not add an ungranted production-file change to this delegation |
