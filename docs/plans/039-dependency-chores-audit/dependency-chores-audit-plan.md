# Dependency Chores Audit
**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-07-11
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context

📚 Incorporates findings from `research-dossier.md`.

The current 34 `npm audit` findings have three headline roots: Vitest (5), Pi (3), and minih (26), with overlap through `ws` and `esbuild`. A scratch lock probe verified the safe update sequence reaches 29 after the toolchain batch and 26 after the Pi batch; minih has no green released fix.

### Summary

Reduce the repository's actionable npm vulnerability baseline without broad dependency churn. Upgrade the Vitest/tsx toolchain and the Pi/ws runtime graph in separate, attributable batches, align CI with Pi's supported Node versions, and retain an exact residual inventory for minih's upstream-blocked findings.

### Goals

- Remove the only critical advisory and all Vitest-root findings.
- Remove all Pi-root high findings while preserving wildcard peer declarations.
- Move CI from Node 20/22 to Node 22/24, per Jordan's ruling.
- Prove a reproducible audit reduction from 34 findings to exactly 26 minih-root findings.
- Enter the package window only after work item 040 reverts its POC hunks and the o-prime verifies both files match HEAD.
- Drive every change through the existing deterministic gate and governed git/package seam.

### Non-Goals

- Enable Dependabot or add `.github/dependabot.yml`.
- Change repository vulnerability-alert, automated-fix, or other GitHub settings.
- Pin minih to PR 73, an unreleased commit, or any red upstream ref.
- Modify minih source or suppress its residual advisories.
- Upgrade non-vulnerable packages merely because `npm outdated` lists them.
- Add user-facing dependency-maintenance documentation.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|--------------|---------------------|
| `extension-authoring-harness` | existing | **modify** | Own dependency manifests, CI runtime matrix, clean-install proof, audit evidence, and the full gate. |
| `agent-runtime` | existing | **consume** | Preserve the exact minih contract and verify its contract tests while documenting the upstream-blocked residual. |

### Testing Strategy

- **Approach**: Lightweight.
- **Rationale**: This is dependency/configuration work; proof comes from real installs, real audit graphs, the existing suite, and CI rather than new unit logic.
- **Focus Areas**: per-batch audit deltas, clean `npm ci`, typecheck, lint, all Vitest tests, smoke, snapshots, minih contract tests, Node 22/24 CI.
- **Excluded**: new product tests unless an actual dependency compatibility failure exposes a missing regression sensor.
- **Mock Usage**: None; use the real npm graph and existing test suite.

### Documentation Strategy

- **Location**: plan, execution log, review, and ship reports only.
- **Rationale**: No user-facing behavior changes; the durable value is exact dependency and audit evidence.

### Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=1, D=0, N=1, F=2, T=1
- **Confidence**: 0.88
- **Assumptions**: npm advisory data and candidate versions remain materially unchanged during implementation; work item 040 reaches a sequenced package-manifest handoff.
- **Dependencies**: npm registry, GitHub Actions, o-prime package-manifest window, upstream minih status.
- **Risks**: Vitest 4 compatibility, Pi 0.80.6 runtime compatibility, shared package-file ownership, audit drift.
- **Phases**: one implementation phase with two isolated dependency batches.

### Acceptance Criteria

1. **AC-01 — Baseline**: Before updates, `npm audit --json` records exactly 34 findings: 1 critical, 9 high, 24 moderate; the grouped roots are Vitest 5, Pi 3, minih 26.
2. **AC-02 — Toolchain root cleared**: Vitest resolves to 4.1.10, `tsx` to 4.23.0, and root `esbuild` to 0.28.1; audit total is 29 and critical findings are zero.
3. **AC-03 — Pi root cleared**: all three Pi peer packages resolve to 0.80.6, root peer declarations remain `"*"`, root `ws` resolves to 8.21.0, and audit total is 26.
4. **AC-04 — Honest residual**: Final audit is exactly 26 with zero critical findings; every residual package traces to minih 0.2.4's OpenTelemetry/protobuf graph. High/moderate rollups are recorded but not fixed gates because lock regeneration reclassifies propagation severity.
5. **AC-05 — CI runtime alignment**: `.github/workflows/ci.yml` runs Node 22 and 24, retains report-only audit behavior, and corrects the stale residual comment to name minih's upstream-blocked graph.
6. **AC-06 — Shared seam integrity**: Before Plan 039 edits, work item 040 has reverted both package files to HEAD and the o-prime has verified them clean; no hunk-level staging is used.
7. **AC-07 — Deterministic gates**: A clean install succeeds and full `harness checks` passes after both batches.
8. **AC-08 — Remote proof**: Both Node 22 and Node 24 CI legs report green before ship completion.
9. **AC-09 — Scope boundary**: No Dependabot config/settings, minih ref, or unrelated outdated dependency changes appear in the final diff.

### Risks & Assumptions

| Risk / Assumption | Impact | Treatment |
|-------------------|--------|-----------|
| Vitest 4 exposes a real config/API break. | High | Fix only the demonstrated break; any new file surface requires o-prime escalation before edit. |
| Pi 0.80.6 fails on Node 22 or 24. | High | Stop and escalate; do not weaken CI, peer ranges, or package engines. |
| minih publishes a safe tag mid-flight. | Medium | Report it to the o-prime; do not expand scope or alter the pin without a new ruling. |
| npm advisory counts drift between batches. | High | Record package identities and ancestry, not counts alone; explain any externally introduced advisory before proceeding. |
| Work item 040 still owns unstaged package hunks. | High | Do not edit or stage package files until work item 040 reverts and the o-prime verifies both files clean under SW-5. |

### Open Questions

None. Runtime failures become stop-and-escalate events rather than implicit plan changes.

### Workshop Opportunities

None. The two update paths, residual boundary, and CI decision are resolved.

### Clarifications

#### Session 2026-07-11

- **Scope**: triage the 34 npm-audit findings; Dependabot enablement and GitHub settings are deferred — Jordan: **"we will later"**.
- **Pi / CI decision**: take Pi 0.80.6 and replace the Node 20 CI leg with Node 24, producing a Node 22/24 matrix.
- **Workflow mode**: Simple (stream decision under the brief's delegated mode choice).
- **Testing**: lightweight real audit deltas plus existing full gates.
- **Mocks**: none.
- **Documentation**: no new user documentation.
- **minih**: monitor the upstream fix; keep the 26 findings as an honest residual unless a new ruling authorizes a safe released pin.
- **SW-5**: work item 040 reverts its package POC to HEAD; hunk-level index mechanisms are refused; Plan 039 starts only after o-prime clean-diff verification.
- **SW-5 status**: the o-prime verified both package files byte-clean; implementation remains queued for the git-index baton and must stage nothing before its grant.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | yes | Supplies the three-root decomposition, advisory inventory, candidate versions, and proof gaps. |
| workshops/*.md | no | No authoritative workshop decisions. |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Scope, CI decision, testing, mocks, docs, and residual policy are resolved. |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`. |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md`; harness and domain contracts are respected. |
| G4 | ADR Compliance | N/A | No accepted ADR files. |
| G5 | Structure | PASS | Both halves, task table, domain manifest, coverage map, and risks are complete. |
| G6 | Testing Alignment | PASS | Every update batch has real audit and existing-gate validation. |
| G7 | Domain Completeness | PASS | Both existing domains and every planned file are mapped. |

### Summary

Implement two reversible dependency batches after the o-prime grants the git-index baton. First upgrade Vitest plus `tsx` and prove the 34→29 delta; then update the Pi family plus root `ws` and CI matrix and prove 29→26. Finish with a clean install, full harness gate, exact residual ancestry, governed commits, review, and remote Node 22/24 CI.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `package.json` | `extension-authoring-harness` | contract | Declares the Vitest toolchain and wildcard Pi peer contracts. |
| `package-lock.json` | `extension-authoring-harness` | internal | Reproducible dependency graph and exact safe resolutions. |
| `.github/workflows/ci.yml` | `extension-authoring-harness` | contract | Defines supported CI runtime proof and report-only audit visibility. |
| `docs/plans/039-dependency-chores-audit/research-dossier.md` | `extension-authoring-harness` | internal | Supplies the verified lock-probe sequence and acceptance arithmetic. |
| `docs/plans/039-dependency-chores-audit/tasks/phase-1-dependency-audit/execution.log.md` | `extension-authoring-harness` | internal | Durable per-batch audit, gate, and escalation evidence. |
| `docs/plans/039-dependency-chores-audit/reports/phase-1-checkpoint.md` | `extension-authoring-harness` | internal | Governed phase completion claim and residual inventory. |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Vitest 2.1.9 contributes the only critical advisory; `tsx` keeps a separate `esbuild` advisory after Vitest alone. | Upgrade Vitest to 4.1.10 and refresh `tsx` to 4.23.0 in one toolchain batch; require audit total 29 and zero critical. |
| 02 | High | The normal `harness checks` inventory does not run root `npm audit`. | Make exact audit snapshots explicit task gates; never treat harness green as security proof alone. |
| 03 | High | Pi 0.80.6 fixes the Pi root but wildcard peer resolution needs a proven temporary exact-pin sequence; shared root `ws` also needs 8.21.0. | Recheck registry latest, temporarily constrain all three peers to 0.80.6, regenerate, restore `"*"`, regenerate, refresh `ws`, and move CI to Node 22/24. |
| 04 | High | minih has 26 findings and no green released fix; upstream PR 73 is red. | Keep minih-v0.2.4, record the exact residual, and never pin the red PR head. |
| 05 | High | Package files contain work item 040's `unique-names-generator` artifact, which file-level pathspec cannot exclude. | Require work item 040's revert plus o-prime clean-diff verification before editing; hunk-level index mechanisms are forbidden. |
| 06 | High | Broad npm remediation can mix unrelated updates and cannot prove attributable deltas. | Forbid `npm audit fix --force` and broad `npm outdated` upgrades; inspect each manifest/lock diff. |
| 07 | High | `npm audit` severity propagation changes after lock regeneration even when the residual package set is unchanged. | Gate on total, critical count, identities, and ancestry; record but do not hard-code the high/moderate split. |

### Implementation

**Objective**: Remove every safely actionable audit finding while preserving upstream-blocked and cross-stream boundaries.
**Testing Approach**: Lightweight — real audit graph assertions, clean install, full existing gates, and Node 22/24 CI.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|----|------|--------|---------|-----------|-------|
| [ ] | T001 | Acquire the queued git-index baton and freeze the evidence baseline. | `extension-authoring-harness` | `package.json`, `package-lock.json`, `research-dossier.md` | SW-5 clean verification still holds; `pij orchestration baton request git-index --purpose "s039 package window"` receives a pushed grant; audit is 34; registry latest for each Pi peer is still 0.80.6; minih tags/PR 73 are rechecked. | Stage nothing before the grant; stop if either package file is dirty, Pi latest differs, or a safe minih release appeared. |
| [ ] | T002 | Upgrade the vulnerable test toolchain in an isolated manifest/lock batch. | `extension-authoring-harness` | `package.json`, `package-lock.json` | Vitest is 4.1.10, `tsx` is 4.23.0, root `esbuild` is 0.28.1; `npm audit` is 29 with 0 critical; typecheck, lint, and full tests pass. | Do not edit `vitest.config.ts` unless a real failure is escalated and granted. |
| [ ] | T003 | Update the Pi peer family, root `ws`, and CI runtime matrix. | `extension-authoring-harness` | `package.json`, `package-lock.json`, `.github/workflows/ci.yml` | Proven sequence temporarily constrains all three Pi peers to 0.80.6, regenerates the lock, restores `"*"`, regenerates again, and refreshes root `ws` to 8.21.0; final manifest keeps wildcards; CI is `[22, 24]`; report-only audit behavior remains and its comment names the minih residual; audit is 26 with 0 critical. | No broad dependency refresh; stop on Node compatibility failure. |
| [ ] | T004 | Prove the residual graph and clean-install reproducibility. | `agent-runtime` | `package-lock.json`, execution log | Fresh `npm ci` succeeds; all 26 findings trace only to minih 0.2.4; minih contract tests pass; no Vitest/Pi/tsx/ws actionable package remains. | Total, critical count, identities, and ancestry are required; severity rollup is informational. |
| [ ] | T005 | Run the deterministic completion gate and verify scope integrity. | `extension-authoring-harness` | all planned files, phase checkpoint | Full `harness checks` passes; final diff has only approved surfaces and no work item 040, Dependabot, minih-ref, or unrelated dependency edit. | A green gate without the audit assertions is insufficient. |
| [ ] | T006 | Commit the two update batches with governed pathspec discipline and report the phase. | `extension-authoring-harness` | planned files, `reports/phase-1-checkpoint.md` | Vitest and Pi/CI commits are attributable; no foreign hunk is swept; checkpoint records SHAs, gates, audit deltas, residual advisories, observations, and opens. | Request/return `git-index`; never `git add -A` or `git add .`. |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T001 | Baseline command output and execution log. |
| AC-02 | T002 | Post-Vitest audit plus typecheck/lint/test. |
| AC-03 | T003 | Lock inspection and post-Pi audit. |
| AC-04 | T003, T004 | Final counts and `npm explain` ancestry. |
| AC-05 | T003 | Workflow diff. |
| AC-06 | T001, T002, T003, T005, T006 | Seam checks and staged-diff verification. |
| AC-07 | T004, T005 | Clean install and `harness checks`. |
| AC-08 | T006, ship gate | GitHub Actions Node 22/24 results. |
| AC-09 | T005, T006 | Final diff and checkpoint report. |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Vitest 4 or `tsx` 4.23 breaks an existing config or assertion contract. | Medium | High | Isolated batch, full suite, no speculative config edits, escalate any new surface. |
| Pi 0.80.6 fails under Node 22/24. | Low | High | Existing CI matrix proof; stop rather than weakening runtime constraints. |
| npm adds a new advisory during implementation. | Medium | Medium | Compare identities/ancestry and report external drift separately from the expected delta. |
| minih PR 73 is merged but not safely released. | Medium | High | Pin only by explicit new ruling after green release evidence. |
| Cross-stream package hunk remains when the window opens. | Low | High | Work item 040 revert, o-prime clean-diff verification, then git-index baton and file-level pathspec staging only. |
