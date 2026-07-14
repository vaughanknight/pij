# Seven-Day npm Release-Age Quarantine
**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-07-13
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context
📚 Incorporates `research-dossier.md` and `reports/upstream-reconciliation.md`: npm 11.10.0 natively supports `min-release-age` in days; Pi-managed npm installs need inherited policy configuration, and audit remains an independent control.

### Summary
Apply a seven-day npm release-age quarantine (`7` days) to pij-controlled dependency resolution. Preserve locked installs, existing report-and-continue package vetting, and explicit audit evidence. The control reduces exposure to newly published malicious packages; it does not detect every CVE, zero-day, git-source compromise, or deliberate local override.

### Goals
- Resolve new npm versions only when they are at least seven days old on all pij-owned npm/Pi install paths.
- Preserve `npm ci`, current lockfile behavior, build/typecheck/test workflows, and Pi extension bootstrap/update flows.
- Keep `npm audit` enabled and separately observable.
- Prove both policy propagation and a controlled native-npm refusal without relying on a currently fresh package release.

### Non-Goals
- Blocking or changing the report-and-continue `pkg add`/`bootstrap`/`audit` policy.
- Replacing npm resolution with a custom lockfile-age parser or a registry proxy.
- Claiming protection for git/URL sources, pre-existing locked resolutions, all vulnerabilities, or all zero-days.
- Modifying pi-mono or the installed Pi binary.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|--------------|----------------------|
| extension-authoring-harness | existing capability | **modify** | Own the package/install recipes, policy propagation, deterministic proof, and security documentation. |

### Testing Strategy

| Field | Decision |
|-------|----------|
| Approach | Hybrid |
| Rationale | Use unit tests for the policy/environment boundary, plus isolated real npm probes for lock compatibility, native rejection, and audit output. |
| Focus Areas | `7`-day policy, child env propagation, `pi install` call sites, `npm ci`, controlled fresh-version refusal, audit JSON. |
| Excluded | Real registry mutation, modifying package/lockfiles during planning, and testing Pi internals by changing pi-mono. |
| Mock Usage | Targeted fake Pi/npm executables for deterministic child-process environment assertions; real npm probes remain required. |

### Documentation Strategy

| Location | Rationale |
|----------|-----------|
| `RUNBOOK.md` and `docs/how/build.md` | Give operators the policy, emergency override boundary, and the distinct audit/release-age guarantees without duplicating a broad security guide. |

### Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=2, D=0, N=1, F=1, T=2
- **Confidence**: 0.85
- **Assumptions**: npm 11.10.0 remains the minimum local/npm CI surface for this policy; its native `min-release-age` value is measured in days; environment config propagates from pij's Pi child process to its npm subprocess.
- **Dependencies**: native npm v11 release-age config; official Pi package-manager behavior; existing `just` and package-vetter workflows.
- **Risks**: Pi may later pass an explicit age override; emergency operators can deliberately override config; lockfile installs intentionally do not prove a fresh-resolution filter.
- **Phases**: one cohesive configuration-and-proof phase.

### Acceptance Criteria

1. **AC-01 Policy value** — Project-owned npm resolution has `min-release-age=7` days, and a deterministic test/probe proves that exact value reaches the Pi-managed npm install boundary.
2. **AC-02 Fresh resolution refusal** — An isolated, fixed-version fixture under a deliberately huge test-only age window fails native npm resolution for age, without depending on a newly published live version.
3. **AC-03 Locked/current install** — The committed lock installs through `npm ci` under the production policy and does not modify `package.json` or `package-lock.json`.
4. **AC-04 Pij package paths** — `pkg add`, `pkg bootstrap`, and the extension-update path use the same age policy; package-vetter report-and-continue semantics remain unchanged.
5. **AC-05 Audit evidence** — `npm audit --json` remains enabled and parseable as a separate command/proof; release-age configuration does not suppress it.
6. **AC-06 Operator clarity** — Documentation states the seven-day purpose, the fact that npm higher-priority configuration can override it only on an explicit human-directed command, and the controls it does not provide.
7. **AC-07 Regression proof** — Focused policy tests and the full required harness gate pass with only allowed files changed.

### Risks & Assumptions

| Risk / assumption | Mitigation |
|-------------------|------------|
| A lower-priority `.npmrc` alone may not configure Pi's cache-root npm subprocess. | Explicitly inject the native npm environment key into pij-owned `pi` child processes and test that boundary. |
| A future Pi explicit CLI flag can override inherited config. | Source-verify the current command composition and pin a regression assertion to emitted arguments/environment; report a future upstream change rather than silently claiming coverage. |
| Audit has pre-existing findings and non-zero exit behavior. | Parse/capture audit JSON independently; retain existing report-only CI posture unless the human explicitly changes policy. |
| Age filtering cannot assess git/URL sources or historical lock entries. | Document the boundary and preserve existing vetting/review controls. |

### Open Questions

None before implementation. Do not add a project bypass recipe: documentation must state that npm higher-priority configuration can override the policy only when a human explicitly directs that command.

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| none | — | The native npm seam and controlled test shape are already resolved by research. | — |

### Clarifications

#### Session 2026-07-13

| Question | Answer |
|----------|--------|
| Workflow mode | Simple |
| Testing strategy | Hybrid |
| Mock usage | Targeted mocks for external subprocesses |
| Documentation | Hybrid (`RUNBOOK.md` + `docs/how/`) |

### Upstream pi-mono Reconciliation

| Upstream control | Classification | s048 disposition |
|------------------|----------------|------------------|
| `min-release-age=2` | adopted pattern, different value | npm 11.10.0 measures it in **days**. pij adopts `min-release-age=7`; the earlier incorrect-unit value is invalid and must never appear in implementation. |
| Exact direct dependency pins; `save-exact=true` | complementary | Keep this release-age change independent; pinning policy requires a separate manifest-wide review and no such scope is granted. |
| Lockfile ground truth and commit guard | already covered / complementary | `npm ci` and lockfile-preservation proof are in scope; a new commit hook is outside this plan. |
| Published CLI shrinkwrap; release smoke | explicitly outside current plan | These govern pi-mono publishing/release packaging, not pij's release-age control. |
| `--ignore-scripts` | already covered / complementary | Existing Pi global-install/update recipes use it; this plan must preserve it, not broaden lifecycle-script policy. |
| Scheduled audit signatures | complementary | Keep root `npm audit --json` proof separate; no scheduled workflow or audit-signature scope is granted. |
| Lifecycle-script allowlisting | explicitly outside current plan | Existing package vetting and `--ignore-scripts` remain the relevant pij protections; no new allowlist machinery is created. |

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | yes | fixes the native npm mechanism, Pi propagation gap, and security boundary |
| workshops/*.md | no | no authoritative workshop decision applies |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | All four front-loaded choices recorded; no critical clarification remains. |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`. |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md`. |
| G4 | ADR Compliance | N/A | No accepted ADR artifact present. |
| G5 | Structure | PASS | Unified business/specification, planning seam, implementation, tasks, AC map, and risks are present. |
| G6 | Testing Alignment | PASS | Every implementation task has a hybrid deterministic/probe proof aligned to the selected strategy. |
| G7 | Domain Completeness | PASS | Every planned repository file belongs to the existing `extension-authoring-harness` capability. |

### Summary
Use npm's native seven-day release-age filter rather than building a parallel resolver. A committed `.npmrc` covers root resolution; a small policy helper supplies the same environment to pij-owned Pi/global install commands that resolve outside the project root. The proof suite separates policy propagation, fresh-resolution rejection, frozen-lock install, and audit visibility so a green build cannot overstate the control.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.npmrc` | extension-authoring-harness | contract | Committed project npm resolution policy. |
| `harness/scripts/release-age-policy.ts` | extension-authoring-harness | internal | Single constant and child-environment constructor for the native npm setting. |
| `harness/scripts/release-age-policy.test.ts` | extension-authoring-harness | internal | Deterministic policy and override-boundary tests. |
| `harness/scripts/packages.ts` | extension-authoring-harness | internal | Applies policy to Pi subprocesses for package add/bootstrap. |
| `justfile` | extension-authoring-harness | contract | Applies the policy to global Pi install and extension update recipes. |
| `harness/scripts/release-age-probe.ts` | extension-authoring-harness | internal | Isolated npm/Pi propagation, lock, refusal, and audit probe. |
| `RUNBOOK.md` | extension-authoring-harness | contract | Operator policy and break-glass documentation. |
| `docs/how/build.md` | extension-authoring-harness | contract | Detailed build/install and audit boundary documentation. |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | npm 11.10.0 provides `min-release-age` in days and honors higher-priority overrides. | Set production value to `7`; do not add a normal bypass recipe. |
| 02 | Critical | Pi runs nested npm installs with `--prefix` but no release-age argument. | Pass the native config through the Pi child environment at every pij-owned invocation. |
| 03 | High | `npm ci` is frozen while root audit is a separate report-only signal. | Test each independently; do not reinterpret locked install success as fresh-resolution proof. |
| 04 | High | Pi self-update intentionally uses `--min-release-age=0`. | Scope the guarantee to pij-owned package/install recipes and document the upstream bypass boundary. |

### Implementation

**Objective**: Enforce and prove seven-day age filtering for pij-owned npm resolution without changing package-vetter verdict policy or weakening existing audit/build behavior.

**Testing Approach**: Hybrid — targeted fake child processes plus isolated real npm probes.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|----|------|--------|---------|-----------|-------|
| [ ] | T001 | Define one release-age policy constant (`7` days) and child environment builder; add committed `.npmrc` with native policy and audit enabled. | extension-authoring-harness | `.npmrc`, `harness/scripts/release-age-policy.ts`, `harness/scripts/release-age-policy.test.ts` | Tests prove the seven-day value and that a supplied caller override cannot silently lower the pij-owned default except through an explicit break-glass API. | Keep the helper side-effect-free and avoid custom registry/lock parsing. |
| [ ] | T002 | Route Pi package add/bootstrap calls and global Pi install/extension-update recipes through the policy environment/flag. | extension-authoring-harness | `harness/scripts/packages.ts`, `justfile`, policy tests | Fake `pi` executable records `npm_config_min_release_age=7`; all affected call sites share the helper; report-and-continue control flow is byte-for-byte behaviorally preserved. | Source-verify every `pi install`/`pi update --extensions` command; do not alter `pkg vet`/`audit` verdict levels. |
| [ ] | T003 | Build an isolated release-age probe with fixed package versions and no repository manifest/lock mutation. | extension-authoring-harness | `harness/scripts/release-age-probe.ts`, `.harness/temp/s048/**` | (a) existing lock succeeds with `npm ci`; (b) a fixed public package plus a deliberately huge test-only age in days is refused by native npm; (c) probe cleans its temp root; all subprocess output is captured as evidence. | Network-dependent probe must name its fixed package/version and fail loudly on registry/tool drift; it never relies on a package published "today." |
| [ ] | T004 | Preserve and demonstrate root audit behavior, then document operating and emergency boundaries. | extension-authoring-harness | `harness/scripts/release-age-probe.ts`, `RUNBOOK.md`, `docs/how/build.md` | `npm audit --json` remains parseable/observed independently of age filtering; docs name coverage, non-coverage, and that any higher-priority npm override requires an explicit human-directed command. | Preserve CI's current report-only audit posture unless a separate human ruling changes it. |
| [ ] | T005 | Run focused proofs and full deterministic gates; capture an implementation checkpoint with exact commands and changed-path inventory. | extension-authoring-harness | `docs/plans/048-min-release-age-7/reports/**` | Focused policy/probe tests, `npm ci`, root audit capture, and `harness checks` pass or have explicit environment failures; no out-of-fence changes remain. | Obtain any required package/CI code fence and git-index baton before implementation/commit. |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T001, T002 | policy unit test + fake Pi environment capture |
| AC-02 | T003 | isolated native npm refusal probe |
| AC-03 | T003 | clean worktree `npm ci` plus no manifest/lock diff |
| AC-04 | T002 | `pkg add`/`bootstrap` command-boundary tests and source review |
| AC-05 | T004 | root `npm audit --json` capture independent of release-age probe |
| AC-06 | T004 | RUNBOOK and build-guide review |
| AC-07 | T005 | focused proofs and `harness checks` |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Native npm/config behavior changes across tool versions | Medium | High | Assert supported config at probe startup and fail with a diagnosis. |
| An emergency override becomes routine bypass | Medium | High | Keep it absent from normal recipes, explicit in docs, and visible in command evidence. |
| Audit exit code is misread as policy failure | High | Medium | Capture JSON separately and preserve report-only handling. |
| Package/lock or CI surfaces need a shared-write fence | Medium | Medium | Stop after planning; request grant/baton before any implementation mutation. |
