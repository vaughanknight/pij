# Portable Pi Models Catalog
**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-07-12
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context

📚 Incorporates `research-dossier.md`. The existing fresh-machine bootstrap synchronizes global Pi policy, MCP configuration, extensions, and packages but leaves the model catalog machine-local; pij itself consumes that catalog for verified model discovery and effort metadata.

### Summary

Make the portable portion of Pi’s curated model registry a repository-owned configuration installed by pij’s canonical bootstrap and refresh commands. The repository owns three provider objects—`github-copilot`, `sakana`, and `openrouter`—while credentials and machine-local providers remain local. Synchronization replaces repo-managed provider objects exactly and preserves every unmanaged provider.

### Goals

- Reproduce the curated portable model catalog on a fresh machine through `just install`.
- Reapply the same catalog through `just update-pi` without deleting local providers.
- Keep `auth.json`, resolved credentials, skills, personal settings, and runtime state outside repository ownership.
- Make synchronization deterministic, atomic, idempotent, and fixture-tested.
- Redirect operational documentation from direct global edits to the repo-managed source.

### Non-Goals

- Managing `~/.pi/agent/auth.json` or any credential lifecycle.
- Versioning or installing the current `local` provider or its LAN endpoint.
- Managing general/shared skills.
- Synchronizing personal `settings.json` defaults, sessions, history, trust, caches, or databases.
- Broadening `just pi-doctor` or changing pij’s model parser/discovery behavior.
- Running `npm link` or performing live global installation from the s047 worktree.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|--------------|----------------------|
| `extension-authoring-harness` | existing capability | **modify** | Own the portable source, tested sync helper, canonical `just` recipes, and bootstrap documentation. |
| `pij-control-plane` | existing | consume | Continue consuming `~/.pi/agent/models.json` through the existing `loadModels()` contract; no product-code change. |

### Testing Strategy

- **Approach**: Lightweight.
- **Rationale**: The behavior is a small deterministic JSON transformation plus filesystem persistence; fixtures and temporary files prove the contract without a live provider or global install.
- **Focus Areas**: managed-provider replacement, unmanaged-provider preservation, absent target, malformed input/no-write, atomic persistence, byte-stable rerun, portable-source boundary.
- **Excluded**: provider inference, OAuth/API calls, live model availability, `npm link`, and destructive tests against the real global file.
- **Mock Usage**: Avoid mocks; use JSON fixtures, temporary directories, and real filesystem operations.

### Documentation Strategy

- **Location**: Operational docs—`AGENTS.md`, `RUNBOOK.md`, `docs/how/build.md`, `docs/how/update-pi.md`, and `docs/how/pij-models-discovery.md`; no root README expansion.
- **Rationale**: These are the existing sources for fresh-machine setup, Pi lifecycle, direct model editing, and agent policy.

### Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=1, D=1, N=1, F=1, T=1 (sum 7)
- **Confidence**: 0.90
- **Assumptions**: Pi continues to accept the documented `providers` schema; `~/.pi/agent/models.json` is the global registry path; Node rename is atomic within the target directory.
- **Dependencies**: Node standard library, existing TypeScript/vitest toolchain, `just install`/`update-pi` seams.
- **Risks**: destructive overwrite of local providers; stale entries inside managed providers; accidental secret capture; partial global writes; docs continuing to recommend direct global edits.
- **Phases**: One cohesive implementation phase.

### Acceptance Criteria

- **AC-01**: The committed portable source has exactly the provider keys `github-copilot`, `sakana`, and `openrouter`, contains the current curated payload, contains no `local` provider/LAN endpoint, and contains no resolved credential.
- **AC-02**: Synchronizing into a missing target (and missing parent directory) creates a valid Pi registry containing all three managed providers.
- **AC-03**: Synchronizing into an existing target replaces each managed provider object wholesale—including removal of stale managed entries—while preserving `local` and arbitrary unknown provider objects byte-equivalently at the parsed-data level.
- **AC-04**: A malformed source or target fails with an actionable non-zero result and leaves the existing target byte-identical.
- **AC-05**: A successful write is atomic and a second run against the same source/target is byte-stable.
- **AC-06**: `just sync-models` exposes the operation; both `just install` and `just update-pi` call it from the repository root before Pi/package use of the catalog.
- **AC-07**: Operational docs name `.pi/models.json` as the portable source, tell users to rerun the sync recipe, explain unmanaged-provider preservation, and keep auth/skills/local providers outside the boundary.
- **AC-08**: Targeted tests, typecheck, lint, and the repository’s completion gates pass without modifying the real global registry during tests.

### Risks & Assumptions

| Risk / assumption | Evidence | Treatment |
|-------------------|----------|-----------|
| A plain copy erases local providers | Current global file includes `providers.local`; `just update-pi` is routinely rerun | Merge at provider-key boundary; fixture-test `local` and unknown preservation. |
| Shallow merge retains stale managed models | Managed providers contain nested arrays/maps | Replace each managed provider object wholesale. |
| Auth reference could be mistaken for a secret | Sakana uses a shell command reading `auth.json` | Commit the reference string only; sync helper never reads auth. |
| Runtime target may contain invalid JSON | Global file is user/runtime editable | Parse before mutation; return tagged error and preserve bytes. |
| Current Copilot entries may stop being served | Registry is curated, not live discovery | Preserve current payload; availability remains a canary/runtime concern outside sync. |

### Open Questions

None blocking. The human fixed the ownership boundary and selected Lightweight testing, fixture-only proof, and operational-doc updates.

### Workshop Opportunities

None. The repository already supplies the sync pattern and the only consequential design decision—managed-provider merge versus destructive copy—is resolved by the local-provider exclusion boundary.

### Clarifications

#### Session 2026-07-12

- **Workflow Mode**: Simple (recommended default; one cohesive phase).
- **Testing Strategy**: Lightweight.
- **Mock Usage**: Fixtures and real temporary filesystem operations only.
- **Documentation Strategy**: Operational docs; no README expansion.
- **Ownership ruling**: Models in; auth and general skills out; pij-owned skill allowance unchanged; exclude the `local` provider.

## Planning Seam
_Refinement opportunities still open—recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none—ownership and merge semantics are resolved.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| `research-dossier.md` | yes | Fixes the managed-provider merge, implementation surface, risks, and proof target. |
| `workshops/*.md` | no | No unresolved design decision requires a workshop. |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Boundary and Round 1 choices are explicit; no clarification markers remain. |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`. |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md`; work remains inside the existing harness capability. |
| G4 | ADR Compliance | N/A | No applicable accepted ADR found. |
| G5 | Structure | PASS | Both halves, required Simple sections, task criteria, and references are present. |
| G6 | Testing Alignment | PASS | Lightweight fixture validation is explicit and precedes/guards implementation. |
| G7 | Domain Completeness | PASS | Both target domains exist; every task path appears in the Domain Manifest. |

### Summary

Add the portable provider catalog as `.pi/models.json` and synchronize it through one Node helper that atomically replaces repo-managed provider objects while preserving target-local providers. Wire the helper behind `just sync-models` and call it from both canonical Pi setup paths. Update the operational sources that currently omit models or recommend editing the generated global file.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/models.json` | extension-authoring-harness | internal | Repository source of truth for portable provider objects. |
| `harness/scripts/sync-models.ts` | extension-authoring-harness | internal | Pure merge plus filesystem adapter/CLI. |
| `harness/scripts/sync-models.test.ts` | extension-authoring-harness | internal | Fixture and real-filesystem proof. |
| `justfile` | extension-authoring-harness | contract | Canonical operator/agent command surface. |
| `AGENTS.md` | extension-authoring-harness | contract | Agent bootstrap and source-of-truth policy. |
| `RUNBOOK.md` | extension-authoring-harness | contract | Operational model-authoring instructions. |
| `docs/how/build.md` | extension-authoring-harness | contract | Fresh-machine bootstrap narrative. |
| `docs/how/update-pi.md` | extension-authoring-harness | contract | Global Pi lifecycle and sync semantics. |
| `docs/how/pij-models-discovery.md` | pij-control-plane | cross-domain | Documents how the unchanged registry consumer receives repo-managed data. |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Copying the portable file over the global target would delete host-specific providers. | Replace only the three managed provider keys; preserve all other provider keys. |
| 02 | High | A shallow nested merge would retain models removed from the repo source. | Replace each managed provider object wholesale. |
| 03 | High | Pij treats entries from global `models.json` as verified and uses them ahead of snapshots. | Keep registry code unchanged; prove the installed target shape. |
| 04 | High | Existing docs and policy name only APPEND_SYSTEM/MCP and direct users to global edits. | Update every operational source in the same phase. |
| 05 | High | Global configuration is runtime-consumed and may already contain user data. | Parse first, persist via same-directory temp+rename, and never mutate on error. |

### Implementation

**Objective**: Make the portable Pi model catalog reproducible through pij’s canonical setup paths without touching secrets or machine-local providers.
**Testing Approach**: Lightweight fixtures and real temporary filesystem operations; no mocks or live global writes.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Add fixture tests for managed-provider replacement, unmanaged-provider preservation, absent target, stale managed entry removal, malformed-input no-write, atomic/idempotent output, and source boundary. | extension-authoring-harness | `harness/scripts/sync-models.test.ts` | Tests fail before the helper exists and enumerate AC-01–AC-05 without reading/writing the real home directory. | Lightweight proof first. |
| [ ] | T002 | Commit the portable catalog and implement pure merge + atomic filesystem synchronization with tagged results and explicit `--source`/`--target` overrides. | extension-authoring-harness | `.pi/models.json`, `harness/scripts/sync-models.ts` | Defaults are repo `.pi/models.json` → `~/.pi/agent/models.json`; test/diagnostic flags can target fixtures; parent creation is safe; exactly three managed provider keys are sourced; unknown/local providers survive; managed providers are exact replacements; operational errors are actionable and non-destructive. | Findings 01, 02, 05. |
| [ ] | T003 | Add `just sync-models` with forwarded arguments and invoke its default form from `install` and `update-pi`; keep recipe comments/step labels accurate. | extension-authoring-harness | `justfile` | `just sync-models --target <temp>` proves the recipe/helper path without touching home; both canonical setup paths visibly include models; no `npm link` is run from this worktree. | AC-06. |
| [ ] | T004 | Update agent and operator documentation to make `.pi/models.json` authoritative and describe preservation/exclusions. | extension-authoring-harness | `AGENTS.md`, `RUNBOOK.md`, `docs/how/build.md`, `docs/how/update-pi.md` | All bootstrap lists include models; direct-global-edit guidance is removed; auth/skills/local exclusions remain explicit. | Human selected operational docs. |
| [ ] | T005 | Update model-discovery documentation for the repo-source→global-target contract while preserving runtime canary guidance. | pij-control-plane | `docs/how/pij-models-discovery.md` | New model authoring points to `.pi/models.json` + `just sync-models`; `loadModels()` behavior remains accurately described. | No registry code change. |
| [ ] | T006 | Run targeted and repository gates and inspect the exact diff for boundary violations. | extension-authoring-harness | all above | Targeted tests, `just typecheck`, `just lint`, `harness checks`, source-provider assertion, and no-real-global-write proof are recorded green; diff contains no auth/local endpoint/skills changes. | AC-08. |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T001, T002, T006 | Source-boundary fixture/assertion and diff review. |
| AC-02 | T001, T002 | Missing-target temporary-directory test. |
| AC-03 | T001, T002 | Existing-target fixture with stale managed + local/unknown providers. |
| AC-04 | T001, T002 | Malformed source/target tests with byte-identical target assertion. |
| AC-05 | T001, T002 | Atomic temp-path test and repeat-run byte comparison. |
| AC-06 | T003, T006 | Justfile structural assertion and temp-target helper invocation. |
| AC-07 | T004, T005, T006 | Documentation search for authoritative path and exclusions. |
| AC-08 | T006 | Targeted suite plus canonical repository gates. |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Synchronization deletes a local provider | Medium | Critical | Provider-key boundary merge and fixture regression. |
| Source removal leaves stale managed entries | Medium | High | Whole-object replacement for managed provider keys. |
| Interrupted write corrupts global registry | Low | High | Same-directory temp write + rename; cleanup on failure. |
| Secret or LAN endpoint enters Git | Low | Critical | Exact source-key/content assertions and final diff scan. |
| Install recipe and docs diverge | Medium | Medium | One `sync-models` recipe/helper and same-phase operational docs. |
| Live provider availability changes independently | Medium | Low | Runtime canary remains required; sync guarantees catalog shape, not entitlement. |
