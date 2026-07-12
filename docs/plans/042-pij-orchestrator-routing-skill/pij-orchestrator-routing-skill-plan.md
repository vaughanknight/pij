# Pij Orchestrator-Routing Skill
**Mode**: Simple
**Plan Version**: 1.0.1
**Created**: 2026-07-12
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context

📚 Incorporates `research-dossier.md`, the approved workshop `workshops/001-orchestrator-landing-and-thesis-proof.md`, and SHA-verified lived evidence under `research/vendored/`.

The evidence set covers four stream orchestrators and one complete orchestrator/reviewer/coder vertical slice. It shows that orchestrator drift begins before orient, packaging claims are the highest-risk authored surface, separate-session review is valuable only when aimed, and shared-tree staging machinery created a defect class that worktree-per-stream construction can remove.

### Summary

Add a thin stream-orchestrator role module inside the existing `/pij prime` route. The module must land before orient, require a real `/thesis` invocation, guide the human preamble and Builder planning journey, run cold validation, stop for the user's fleet configuration, delegate implementation and separate review inside a stream worktree, report continuously to the o-prime, and land through `/builder 8 ship` and a PR.

### Goals

- Route a briefed stream deterministically to one role-stating module before worker posture can form.
- Invoke `/thesis` through the host skill mechanism before preamble and Builder planning.
- Encode the lived journey: preamble → explore/workshop → plan → cold validation → wait-for-build-config → `/pij pair`.
- Make worktree/branch-per-stream construction the default; keep staging/apply-window choreography as fallback.
- Keep coder and reviewer in separate panes inside the orchestrator's window and stream worktree.
- Treat source seams, packet composition, review scope, acceptance criteria, and reports as the orchestrator's proof duties.
- Land through `/builder 8 ship`: branch push, PR, watched CI, and confirmed merge.
- Extend structural backpressure without falsely claiming it proves runtime `/thesis` invocation.
- Dogfood the workflow in s042 and preserve its evidence for the cold acceptance review.

### Non-Goals

- Add a second top-level `/pij orchestrator` registry row.
- Build new spawn, tmux, worktree, baton, pair, Builder, ship, or merge engines.
- Change `flow-pair` ledger/review implementation in this plan.
- Add universal cross-harness tool-call telemetry.
- Turn prime governance into an ACL or compliance gate.
- Remove shared-tree fallback rules; they remain necessary when worktrees are unavailable.
- Change product code under `.pi/extensions/pij/**`.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|----------------------|
| `pij-skill` | existing | **modify** | Own the new role module, prime triage pointer, portable journey, templates, rituals, and operator guide. |
| `extension-authoring-harness` | existing capability | **modify** | Extend `pij-skill-check` with module/pointer/order/anti-fake/worktree/ship assertions. |
| `pij-control-plane` | existing | **consume** | Reuse spawn, cwd inheritance, tmux placement, canary, and session identity contracts; no code changes. |
| `pij-orchestration` | existing | **consume** | Reuse prime designation and timing/shared-trunk fallback batons; no code changes. |
| `flow-pair` | existing | **consume** | Reuse `/pij pair`, packets, separate reviewer, and fix-loop contracts; no engine changes. |

### Testing Strategy

- **Approach**: Hybrid.
- **Rationale**: structural Markdown contracts need deterministic shell assertions; the role journey also needs a cold acceptance run because prose presence alone cannot prove a fresh agent follows it.
- **Focus Areas**:
  - module existence, pointer integrity, line budget, and marker ordering;
  - no second registry row;
  - actual anti-fake `/thesis` wording;
  - worktree/branch and `/builder 8 ship` presence;
  - cold stream-role routing and wait-for-build-config behavior;
  - current `pij-skill-check` regression surface.
- **Excluded**: product-code unit tests, flow-pair engine tests, and universal runtime tool-call proof.
- **Mock Usage**: avoid mocks; use real temporary skill fixtures and live/captured traces.

### Documentation Strategy

- **Location**: `docs/how/` plus the runtime skill payload itself.
- **Rationale**: `docs/how/pij-prime.md` is the operator index; the route/module/ritual/template files are the executable agent documentation.

### Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=1, D=0, N=1, F=1, T=1
- **Confidence**: 0.88
- **Assumptions**:
  - the o-prime can create a git worktree/branch with standard git before spawn;
  - `pij spawn` inherits the caller's cwd when invoked from the stream worktree;
  - `/builder 8 ship` remains the canonical branch/PR/CI landing surface;
  - L1–L3 thesis proof are shippable even where L4 host telemetry is unavailable.
- **Dependencies**:
  - existing `/pij prime`, `/pij pair`, `/builder`, `/validate-v2`, `/builder 8 ship`;
  - git worktrees, tmux, current prime government and report contracts.
- **Risks**:
  - live-deployed skill Markdown changes affect every local agent immediately;
  - portable prime files can drift if worktree/fallback language is updated unevenly;
  - structural checks can overclaim runtime behavior unless wording is exact.
- **Phases**: one cohesive implementation phase; the user explicitly selected Simple mode.

### Acceptance Criteria

- **AC-01**: Given a session deterministically identified as a stream, `/pij prime` loads `prime/orchestrator.md` before any orient file and no new top-level route row exists.
- **AC-02**: The role module requires an actual `/thesis` host-skill invocation after the ordered orient stack and before preamble/Builder; it explicitly rejects a thesis-shaped answer written from memory.
- **AC-03**: Spawn, adoption, and resume instructions all enter through `/pij prime`; the stream brief records worktree path, branch, base, window, role, and ordered orient stack.
- **AC-04**: The module records the user's peer profile or reads back the exact default—separate Copilot `gpt-5.6-sol` coder and reviewer peers at `xhigh`—verbatim, completes a preamble checkpoint, runs guided Builder and cold `/validate-v2`, then stops at `WAITING_FOR_BUILD_CONFIG`.
- **AC-05**: Implementation guidance invokes `/pij pair` with a named coder and separate reviewer as splits inside the orchestrator window, using the stream worktree cwd.
- **AC-06**: The module requires source-verified dependency seams, immutable coder/reviewer packets, reviewer-formed findings, stop-and-rebrief on scope changes, runtime proof for new behavior, and event-driven o-prime reports.
- **AC-07**: Worktree/branch-per-stream construction is the primary posture; shared-tree staging, apply windows, pathspec commits, staged-set verification, and commit slots are explicitly fallback-only.
- **AC-08**: The default landing journey invokes `/builder 8 ship` for branch push, PR, watched CI, and confirmed merge; direct shared-trunk landing is not the default.
- **AC-09**: `just pij-skill-check` passes on the shipped payload and fails against targeted temporary mutations that remove the module pointer, reorder `/thesis`, add a second route row, or remove worktree/ship markers.
- **AC-10**: A cold dogfood run can read only the route/brief stack and produce evidence of the correct role, thesis outcome, preamble checkpoint, Builder position, and build-config wait without implementation in the orchestrator seat.
- **AC-11**: `docs/how/pij-prime.md` and `docs/domains/pij-skill/domain.md` describe the new role landing and worktree/PR lifecycle without duplicating full ritual prose.

### Risks & Assumptions

| Risk / Assumption | Impact | Treatment |
|-------------------|--------|-----------|
| Copilot control-plane sessions expose no pij tool-call event file. | L4 runtime thesis proof cannot be universal. | Ship honest L1–L3 proof; use best-available host trace in cold acceptance; never claim more. |
| Worktree creation has no dedicated pij CLI verb. | Kickoff could become vague or non-portable. | Use standard git in the ritual, derive naming/root in local orient, record path/branch in spine+brief, and avoid new product code. |
| Prime payload is live-deployed by symlink. | A malformed pointer can break every local prime session immediately. | Structural gate first, o-prime review before commit, path-limited changes, cold acceptance. |
| `flow-pair fix` cannot ingest arbitrary reviewer findings reliably. | A generated fix packet could be empty. | Module requires persisted findings and a manual narrowed packet fallback; engine repair remains out of scope. |
| Simple mode over a broad Markdown surface. | One task packet could become vague. | Use one phase but explicit ordered tasks and per-task Done-When evidence. |

### Open Questions

No blocking product questions remain. The following are accepted follow-ups, not plan gaps:

- a future cross-harness tool-call trace affordance for L4 thesis proof;
- a future flow-pair reviewer-findings ingestion repair;
- a future pij worktree lifecycle convenience verb if repeated standard-git ritual proves costly.

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Orchestrator landing and thesis proof | Integration Pattern | Route/module placement and proof semantics were plan-shaping. | Resolved by `workshops/001-orchestrator-landing-and-thesis-proof.md`. |
| Cross-harness thesis runtime trace | Spike/POC | Only running each harness can prove whether a uniform tool-call sensor exists. | Deferred, non-blocking; L1–L3 ship now. |

### Clarifications

#### Session 2026-07-12

| Question | Answer |
|----------|--------|
| Workflow Mode | Simple, explicitly selected despite the broad documentation surface. |
| Testing Strategy | Hybrid: structural checks plus targeted cold acceptance. |
| Mock Usage | Avoid mocks; use real temporary skill fixtures and live/captured traces. |
| Documentation Strategy | `docs/how/` only for user-facing guide changes. |
| Construction Isolation | Worktree and branch per stream are primary; shared-tree staging machinery is fallback. |
| Landing Seam | `/builder 8 ship` → push branch → PR → watched CI → confirmed merge. |
| Dogfood | s042 itself follows the proposed journey and records the evidence. |

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: cross-harness thesis runtime trace POC (deferred, non-blocking)

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| `research-dossier.md` | yes | Supplies lived findings, constraints, domain boundaries, and implementation surfaces. |
| `workshops/*.md` | yes | Authoritatively selects internal role-module placement and layered thesis proof. |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Round 1 plus worktree/ship/dogfood rulings resolved all blocking choices. |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`. |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md`; domain and harness contracts were loaded directly. |
| G4 | ADR Compliance | N/A | No `docs/adr/` directory. |
| G5 | Structure | PASS | Unified business and implementation sections, tasks, coverage, risks, and references present. |
| G6 | Testing Alignment | PASS | Hybrid strategy: structural RED→GREEN precedes payload changes; cold acceptance follows. |
| G7 | Domain Completeness | PASS | Every modified file is mapped; no new domain or dependency edge is introduced. |

### Summary

Implement one cohesive `pij-skill` change: add the stream-orchestrator landing module, route existing prime triage to it, and update the portable prime lifecycle from shared-tree-first to worktree/branch construction with Builder ship PR landing. Extend `pij-skill-check` first so missing pointers, wrong ordering, fake thesis contracts, and lifecycle drift fail deterministically. Keep product engines untouched and prove the result with temporary mutations plus a cold dogfood run.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `skills/pij/references/prime/orchestrator.md` | `pij-skill` | contract | New stream-role landing and journey contract. |
| `skills/pij/references/routes/prime.md` | `pij-skill` | contract | Redirect deterministic stream triage to the new role module. |
| `skills/pij/references/prime/rituals/kickoff.md` | `pij-skill` | contract | Allocate/create/record worktree+branch; invoke `/pij prime`; clean up after PR merge. |
| `skills/pij/references/prime/templates/stream-brief.md` | `pij-skill` | contract | Add worktree/branch/base and module-first orient stack. |
| `skills/pij/references/prime/templates/spine.md` | `pij-skill` | contract | Add worktree/branch to roster and allocation evidence. |
| `skills/pij/references/prime/templates/orient-local.md` | `pij-skill` | contract | Derive worktree root/naming/base and ship target per repo. |
| `skills/pij/references/prime/rituals/bootstrap.md` | `pij-skill` | internal | Add per-repo worktree/landing derivation and preparing-state allocation. |
| `skills/pij/references/prime/orient-oprime.md` | `pij-skill` | contract | Make worktree-per-stream primary instead of contention-triggered suggestion. |
| `skills/pij/references/prime/protocol.md` | `pij-skill` | contract | Record construction, fallback, and `/builder 8 ship` landing doctrine. |
| `skills/pij/references/prime/rituals/batons.md` | `pij-skill` | internal | Narrow shared-tree/index batons to fallback; retain timing-purity batons. |
| `skills/pij/references/prime/rituals/incidents.md` | `pij-skill` | internal | Reframe INC-004 rules as shared-trunk fallback evidence. |
| `harness/scripts/pij-skill-check.sh` | `extension-authoring-harness` | cross-domain | Structural sensor for the new role module and lifecycle markers. |
| `docs/how/pij-prime.md` | `pij-skill` | internal | Operator-facing entry, worktree lifecycle, and landing overview. |
| `docs/domains/pij-skill/domain.md` | `pij-skill` | contract | Add the orchestrator landing concept and updated consumed lifecycle. |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Wrong role posture forms before orient; only a thin module-first landing is early enough. | Keep one `prime` row; stream triage loads `prime/orchestrator.md`. |
| 02 | Critical | The shared-tree run's dominant defects came from packaging machinery, not reviewed code. | Make worktrees primary and delete staging/apply complexity from the normal path. |
| 03 | High | Worktrees isolate trees, not false dependency claims or runtime/timing interference. | Preserve source verification, immutable packets, review aim, timing batons, and merge coordination. |
| 04 | High | Structural checks can prove the `/thesis` contract but not universal runtime invocation. | Separate contract/outcome/runtime proof and keep claims honest. |
| 05 | High | Existing pair, baton, control-plane, Builder, and ship primitives already own execution mechanics. | Cite and sequence them; do not create new engines. |
| 06 | High | Current `flow-pair fix` can lose reviewer findings. | Require persisted findings and manual narrowed fallback; do not expand this plan into engine repair. |

### Implementation

**Objective**: ship a module-first orchestrator journey that dogfoods Builder, worktree isolation, separate peer review, and PR landing without changing pij product code.
**Testing Approach**: Hybrid—structural RED→GREEN, targeted mutation checks, then cold dogfood acceptance.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Extend `pij-skill-check` first with the required module, stream pointer, pointer-integrity, ≤120-line budget, ordered markers, worktree/ship markers, an explicit anti-"prime's window" marker, exact default-profile markers, and forbidden second-row/direct-build patterns; capture the expected RED against the current tree. | `extension-authoring-harness` | `harness/scripts/pij-skill-check.sh` | The modified check fails specifically because `prime/orchestrator.md` and its pointer/markers do not exist; no unrelated sensor regresses. | Hybrid/TDD entry. |
| [ ] | T002 | Add `prime/orchestrator.md` and redirect the stream row in `routes/prime.md`; encode role boundary, ordered orient→`/thesis`→preamble journey, Builder+validator, exact default `gpt-5.6-sol @ xhigh` separate peers with verbatim read-back, wait state, pair delegation, source/packet/review duties, reporting, resume, and Builder ship landing. | `pij-skill` | `skills/pij/references/prime/orchestrator.md`; `skills/pij/references/routes/prime.md` | Structural gate advances from missing-module RED to marker/pointer checks; one `prime` registry row remains; module stays ≤120 lines. | Cite existing contracts, do not restate. |
| [ ] | T003 | Update kickoff and government templates for worktree/branch allocation, spawn-from-worktree cwd, module-first brief, roster evidence, resume, PR-merged teardown, and shared-tree fallback. Peer `pij spawn` must be invoked from the worktree because its current contract derives pane cwd from `process.cwd()`; do not document the unrelated `pij agent --cwd` flag as a peer-spawn option. | `pij-skill` | `skills/pij/references/prime/rituals/kickoff.md`; `skills/pij/references/prime/templates/stream-brief.md`; `skills/pij/references/prime/templates/spine.md`; `skills/pij/references/prime/templates/orient-local.md`; `skills/pij/references/prime/rituals/bootstrap.md` | A cold reader can derive worktree root/name/base, create and record it before spawn, invoke peer spawn from that cwd, verify descriptor cwd/branch, and remove it only after successful PR landing or explicit abandonment. | Standard git only; no new CLI or peer-spawn flag. |
| [ ] | T004 | Align portable prime doctrine and fallback rituals with worktree-primary construction, timing-purity batons, shared-trunk fallback discipline, and `/builder 8 ship` landing. | `pij-skill` | `skills/pij/references/prime/orient-oprime.md`; `skills/pij/references/prime/protocol.md`; `skills/pij/references/prime/rituals/batons.md`; `skills/pij/references/prime/rituals/incidents.md` | No portable prime page still teaches contention-triggered worktrees or trunk apply windows as the default; timing/claim/merge hazards remain explicit. | Worktrees remove tree/index collisions, not claim defects. |
| [ ] | T005 | Update operator and domain documentation without duplicating ritual prose. | `pij-skill` | `docs/how/pij-prime.md`; `docs/domains/pij-skill/domain.md` | Guide links the new role file and summarizes worktree→pair→Builder ship; domain doc adds the orchestrator landing concept with no new domain/edge. | User-facing docs strategy. |
| [ ] | T006 | Mutation-prove the structural gate using temporary copied skill roots. | `extension-authoring-harness` | Temporary files only via `PIJ_SKILL_ROOT`; `harness/scripts/pij-skill-check.sh` | Baseline green; removing the module pointer, reordering `/thesis` after Builder, adding a second registry row, and deleting worktree/ship markers each produce the intended failure; originals remain byte-identical. | Real fixtures, no mocks. |
| [ ] | T007 | Run the cold dogfood acceptance and record evidence. | `pij-skill` | `docs/plans/042-pij-orchestrator-routing-skill/reviews/` or execution evidence under this plan | A fresh stream seat follows only `/pij prime` + the brief, states the role, invokes `/thesis` through its host mechanism where observable, produces a preamble checkpoint, reaches Builder/wait-for-build-config, and performs no implementation; any L4 telemetry absence is stated honestly. | Use a real temporary worktree and separate session. |
| [ ] | T008 | Run targeted and full gates, reconcile docs, and prepare the dogfood implementation for separate peer review. | `extension-authoring-harness` | All changed files | `just pij-skill-check`, relevant targeted checks, and `harness checks` pass; no unrelated worktree files are staged; report includes artifacts/SHAs/gates/observations/open. | Do not commit or build in the orchestrator seat. |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T001, T002 | Registry/module/pointer structural assertions and cold route. |
| AC-02 | T001, T002, T007 | Ordered markers, anti-fake wording, and dogfood outcome. |
| AC-03 | T003, T007 | Brief/kickoff fields and cold worktree/cwd evidence. |
| AC-04 | T002, T007 | Module journey and preamble/Builder/wait artifacts. |
| AC-05 | T002, T003, T007 | Pair/placement contract and cold topology evidence. |
| AC-06 | T002, T006, T007 | Module markers, mutation checks, and reviewer/coder packet evidence. |
| AC-07 | T003, T004, T006 | Worktree-primary/fallback markers and mutations. |
| AC-08 | T002, T004, T005, T006 | Builder ship markers, portable doctrine, operator guide, mutation. |
| AC-09 | T001, T006, T008 | RED→GREEN, mutation matrix, final gate. |
| AC-10 | T007 | Cold dogfood report and pane/session evidence. |
| AC-11 | T005, T008 | Guide/domain review and final documentation gate. |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Live skill payload breaks prime sessions during implementation. | Medium | High | Worktree branch, structural gate first, no trunk landing, cold test, separate reviewer, PR/CI. |
| Module becomes a doctrine dump. | Medium | High | ≤120-line budget; pointer-only reuse; single role/journey responsibility. |
| Worktree lifecycle text is incomplete. | Medium | High | Explicit derive/create/record/verify/teardown criteria across bootstrap, kickoff, brief, spine, and guide. |
| Structural gate overclaims thesis execution. | Medium | High | Exact result wording: contract/order proven; runtime proof best-available only. |
| Cold acceptance is blocked by missing host telemetry. | High | Medium | Use observable thesis output/preamble artifact; record L4 as unavailable rather than fabricate. |
| Shared-tree fallback doctrine is accidentally deleted. | Low | High | Preserve it explicitly in baton/incidents/protocol as fallback and test marker presence. |
