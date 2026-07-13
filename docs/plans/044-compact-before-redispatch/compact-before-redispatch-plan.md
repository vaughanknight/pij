# Completion-First Peer Compaction
**Mode**: Simple
**Plan Version**: 1.8.0
**Created**: 2026-07-12
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context

📚 Incorporates `research-dossier.md`. The live skill carries the correct completion trigger and reliable compact command, but C3's receipt-before-pointer gate is superseded by R5 fire-and-forget; the salience regression began when the dedicated compact-early section was compressed during the flow-pair → `/pij pair` port.

### Summary

Restore completion-time compaction as an unmistakable, non-blocking skill interrupt. When a coder reports completion or a reviewer returns a verdict, the orchestrator's first action is `pij send <id> --command compact` without `--wait`; it then immediately reads and acts on the report while compaction runs independently.

### Goals

- Put completion-first compaction in the always-loaded `/pij` contract.
- Restore route-local wording that makes compact the first action after coder completion and reviewer verdict.
- Preserve exact ownership: root invariant 5 owns always-loaded delivery-aware waiting; C3 owns timing/lifecycle/fire-and-forget/reuse; pair owns route-local reload-first safety; C7 owns detailed push-vs-pull behavior.
- Add deterministic structural backpressure so later skill refactors cannot silently compress or reorder the rule.
- Cold-canary actual agent behavior: compact starts before report inspection or next-step work.

### Non-Goals

- Add an atomic `pij send --compact-first`, compact alias, daemon round counter, or other product mechanic.
- Compact a peer while it is actively producing a response.
- Change compact command, receipt, daemon, ledger, packet, or review-engine behavior.
- Duplicate the full C3 convention across every route.
- Require or attempt compaction after a `pij agent spawn --once` peer has auto-dissolved; no live context remains.
- Begin implementation before s041 releases or sequencing is granted for overlapping live skill files.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|--------------|----------------------|
| `pij-skill` | existing | **modify** | Own the always-loaded interrupt, pair-route procedure, and domain contract. |
| `extension-authoring-harness` | existing capability | **modify** | Extend `pij-skill-check` with ordered completion-first assertions and mutation proof. |
| `pij-messaging` | existing | **consume** | Reuse reliable remote compact and observe-only receipts; no product changes. |
| `flow-pair` | existing | **consume** | Reuse coder/reviewer report lifecycle and pointer delivery; no engine changes. |

### Testing Strategy

- **Approach**: Hybrid.
- **Rationale**: structural Markdown contracts need deterministic RED→GREEN assertions, while actual first-action behavior needs a cold agent canary.
- **Focus Areas**:
  - always-loaded completion interrupt;
  - coder completion and reviewer verdict parity;
  - compact-before-report-handling order;
  - explicit no-`--wait` / no-receipt-gate behavior;
  - root/C3/pair ownership, active-response safety, reuse, and C7 push-vs-pull preservation;
  - temporary mutation fixtures and cold event-order evidence.
- **Excluded**: product-code unit tests, daemon restart, flow-pair engine changes, and claims that marker presence alone proves runtime behavior.
- **Mock Usage**: avoid mocks; use copied skill fixtures for structural mutations and real isolated peers for the cold canary.

### Documentation Strategy

- **Location**: `docs/domains/pij-skill/domain.md` only.
- **Rationale**: user-facing CLI behavior is unchanged; the runtime skill payload is the operator guidance.

### Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=1, D=0, N=1, F=1, T=2
- **Confidence**: 0.93
- **Assumptions**:
  - current compact and receipt behavior remains authoritative;
  - project-local skill linking can cold-test the branch payload without repointing the global live skill;
  - s041 sequencing is resolved before implementation.
- **Dependencies**: live `/pij` skill structure, `just pij-skill-check`, peer event streams, and o-prime fence adjudication.
- **Risks**: live skill edits affect active agents; structural assertions can overclaim behavior; root/route/C3 wording can drift.
- **Phases**: one cohesive implementation phase.

### Acceptance Criteria

- **AC-01**: Given `/pij` is invoked, its always-loaded root contract states that a coder/reviewer completion interrupts normal processing and compact is the first action.
- **AC-02**: Given a coder completion report arrives, the pair route requires compact to start before report inspection, reviewer acquisition, review dispatch, or fix preparation.
- **AC-03**: Given a reviewer verdict arrives, the pair route requires compact to start before sanity checking, approval, finding synthesis, or fix dispatch.
- **AC-04**: Completion compact is fire-and-forget: the skill uses no `--wait`, never waits for `executed:true` or receipt delivery, and never blocks report/review/fix work or redispatch on compact latency.
- **AC-05**: Root carries one completion interrupt pointing to C3 and preserves invariant 5 (`Delivery-owned waiting`: push delivery, external `pij inbox --wait`, never a `pij state` wait loop); C3 owns timing, overlap rationale, reusable/live scope, the `--once` boundary, fire-and-forget dispatch, and peer reuse; pair owns route-specific sequence plus reload-first safety; C7 owns detailed push-vs-pull behavior.
- **AC-06**: `just pij-skill-check` fails when the root completion interrupt/C3 pointer, root delivery-owned-waiting invariant, coder/reviewer parity, completion-before-handling order, C3 ownership/details, no-compact-`--wait`, or non-blocking continuation marker is removed, duplicated, or reordered.
- **AC-07**: A cold isolated agent receiving a real coder completion report sends compact as its first tool action without `--wait`, then immediately reads/acts on the report without waiting for receipt or compact completion; the same ordering is evidenced for a reviewer verdict.
- **AC-08**: No `.pi/extensions/pij/**`, flow-pair engine, CLI, daemon, schema, or package file changes; non-plan implementation paths match the Domain Manifest while durable evidence stays inside named plan-owned outputs.
- **AC-09**: The `pij-skill` domain document records completion-first compaction and its structural/cold proof contract without duplicating route prose.
- **AC-10**: Given a `--once` agent auto-dissolves as its report lands, a first-action compact attempt may return `E-DEAD`; the contract records this as expected lifecycle evidence, not a failure or redispatch blocker.

### Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| s041 and s044 overlap live root/C3/domain contracts. | High | High | s041 retains first ownership; after it lands, refresh/rebase, re-read root/C3/domain, revalidate material changes, and obtain an exact o-prime manifest grant before implementation. |
| Restored prose becomes another doctrine dump. | Medium | Medium | Root gets one interrupt invariant; pair gets route sequence; C3 remains the shared detail owner; existing line budgets stay green. |
| Structural checks pass but a fresh agent still reads the report first. | Medium | High | Mutation-proof the gate and run a cold real-peer event-order canary. |
| Cold canary accidentally tests the global main skill instead of the branch payload. | Medium | High | Use a project-local worktree skill link and mechanically record the resolved skill path before the canary. |
| Compact is issued while a peer is still responding. | Low | High | Trigger only from terminal completion/verdict reports; preserve the current active-response safety wording. |

### Open Questions

None blocking. Exact implementation wording is constrained by AC-01–AC-05 and the historical section at `2d49d7^:skills/flow-pair/SKILL.md:42-73`.

### Workshop Opportunities

None. Current behavior, historical intent, proof surface, and file boundaries are sufficiently evidenced.

### Clarifications

#### Session 2026-07-12

| Question | Answer |
|----------|--------|
| Workflow Mode | Simple: one cohesive skill/harness phase, CS-3. |
| Testing Strategy | Hybrid: structural RED→GREEN plus cold event-order acceptance. |
| Mock Usage | Avoid mocks; copied skill fixtures and real isolated peers. |
| Documentation Strategy | Domain contract only; no CLI guide change. |
| Primary seam | Jordan ruled completion-time compact, not just-in-time redispatch. |
| Historical evidence | Jordan required comparison; the pre-port flow-pair skill's dedicated compact-early section is the restoration baseline. |

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| `research-dossier.md` | yes | Establishes the port regression, existing mechanics, smallest surface, and proof gap. |
| `workshops/*.md` | no | No unresolved design topic requires a workshop. |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Completion seam, historical baseline, proof level, and non-goals are resolved. |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`. |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md`; domain boundaries loaded directly. |
| G4 | ADR Compliance | N/A | No accepted ADRs apply. |
| G5 | Structure | PASS | Both halves, required sections, task table, coverage map, risks, and references are present. |
| G6 | Testing Alignment | PASS | Structural gate work precedes payload changes; cold acceptance follows. |
| G7 | Domain Completeness | PASS | Every modified file is mapped; consumed product domains remain unchanged. |

### Summary

Implement one skill-only restoration. Add a completion interrupt to the always-loaded root, restore explicit compact-early handling in the pair route, and protect the contract with structural mutations plus a cold real-peer canary. Keep C3 as the shared convention owner and make no product changes.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `skills/pij/SKILL.md` | `pij-skill` | contract | Add the always-loaded completion interrupt. |
| `skills/pij/references/00-routing.md` | `pij-skill` | contract | Extend C3 with reusable/live scope, the one-shot boundary, and explicit fire-and-forget/no-`--wait` continuation. |
| `skills/pij/references/routes/pair.md` | `pij-skill` | contract | Restore coder/reviewer completion-first procedure, execution order, and route-local reload-first safety. |
| `harness/scripts/pij-skill-check.sh` | `extension-authoring-harness` | cross-domain | Add ordered markers and mutation-sensitive structural proof. |
| `docs/domains/pij-skill/domain.md` | `pij-skill` | contract | Record the completion-first concept and proof surface. |
| `docs/plans/044-compact-before-redispatch/validation/cold-completion-canary.md` | `pij-skill` | internal | Durable bounded runtime evidence for coder-completion and reviewer-verdict event order. |
| `docs/plans/044-compact-before-redispatch/validation/one-shot-compact-evidence.md` | `pij-skill` | internal | Boundary evidence that auto-dissolved `--once` peers have no reusable context to compact. |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | High | The old flow-pair skill made compact a first-action interrupt; the router port compressed it. | Restore that execution shape in the root + pair route rather than adding product mechanics. |
| 02 | High | C3's completion timing is correct, but its receipt gate is superseded; remote compact remains reliable. | Preserve C3 ownership/timing/safety while replacing receipt blocking with R5 fire-and-forget. |
| 03 | High | The structural gate has no compact-first assertions. | Extend the gate first and mutation-prove each load-bearing marker. |
| 04 | High | Marker presence cannot prove a fresh agent's first action. | Add a cold event-order canary and state its evidence ceiling honestly. |
| 05 | High | PR #9 changed C7 from push-only guidance to delivery-owned push-vs-pull waiting. | Scope compact no-`--wait` assertions narrowly so legitimate external `pij inbox --wait` remains required and protected. |
| 06 | High | PR #9 also put delivery-owned waiting in always-loaded root invariant 5. | Protect the root marker independently so editing `SKILL.md` cannot silently remove the pull contract while C7 remains green. |

### Post-PR9 Drift Resolution

- **Release**: PR #9 merged as `1336291a5a2285d37487cf83bda86b7438ba93c4`; hosted Node 22/24/Windows checks green; s041 ownership released at Spine Seq 141.
- **Rebase**: s044 rebased cleanly from `347b6dd` to `1336291a`; plan folder remained intact and untracked.
- **Five-file reread**: complete; baseline `just pij-skill-check` green.
- **Material drift**: `SKILL.md`, C1/C7, and `pij-skill/domain.md` gained external pull/inbox contracts. C3, pair route, and structural gate remained otherwise unchanged.
- **Disposition**: v1.8 preserves both root invariant 5 and C7 delivery semantics while narrowing R5 checks to compact waiting only; cold validation required before grant.

### Implementation Preconditions

1. Jordan confirms the coder/reviewer build profile after this plan reaches `WAITING_FOR_BUILD_CONFIG`.
2. s041 completes or explicitly releases first ownership of `skills/pij/SKILL.md`, `skills/pij/references/00-routing.md`, and `docs/domains/pij-skill/domain.md`.
3. Refresh/rebase this branch onto the ruled post-s041 base; re-read the current root skill, C3, pair route, structural gate, and domain file.
4. If post-s041 changes alter C3 semantics, line budgets, marker ownership, or the Domain Manifest, stop and re-run Builder plan plus cold validation.
5. Obtain an exact o-prime implementation grant for every non-plan path in the Domain Manifest before coder dispatch.

### Implementation

**Objective**: make completion-time peer compaction hard to miss and hard to regress, without changing pij product mechanics.
**Testing Approach**: Hybrid — structural test first, payload restoration second, mutation proof and cold event-order acceptance last.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Extend `pij-skill-check` first with exact ownership and order assertions: one root completion interrupt pointing to C3; root invariant 5 markers `Delivery-owned waiting`, `pij inbox --wait`, and no `pij state` wait loop; exactly one C3 heading with timing/overlap, reusable/live and one-shot boundaries, fire-and-forget/no compact `--wait`, immediate continuation, and reuse markers; pair coder/reviewer completion → compact first → report handling plus reload-first safety; C7 push-mode no-state-poll + external `pij inbox --wait` markers. Reject compact `--wait` or receipt gates without rejecting inbox waiting. Capture the expected RED against the current payload. | `extension-authoring-harness` | `harness/scripts/pij-skill-check.sh` | The gate fails only on the new missing/superseded compact-first contract; root/C7 PR #9 delivery checks remain green. | Do not claim runtime proof. |
| [ ] | T002 | Add one always-loaded completion invariant without altering root invariant 5, extend C3 with reusable/live and one-shot lifecycle boundaries plus fire-and-forget continuation, and restore a focused `compact EARLY` block in pair, based on historical commit `eee2367` / pre-port lines 42–73 as superseded by R5. | `pij-skill` | `skills/pij/SKILL.md`; `skills/pij/references/00-routing.md`; `skills/pij/references/routes/pair.md` | Root gains the completion interrupt while invariant 5 remains exact; C3 says send without compact `--wait` and continue immediately; pair covers coder + reviewer and reload-first safety; PR #9 C1/C7 external-pull semantics remain byte-faithful; line budgets pass. | Do not weaken root/C7 `pij inbox --wait`. |
| [ ] | T003 | Update the domain contract with completion-first compaction and its structural + cold proof surfaces. | `pij-skill` | `docs/domains/pij-skill/domain.md` | Domain concepts/invariants name the interrupt while preserving PR #9's Pull guidance seam, delivery-owned waiting invariant, and history row. | No `docs/how` change. |
| [ ] | T004 | Mutation-prove the structural gate using copied `PIJ_SKILL_ROOT` fixtures. | `extension-authoring-harness` | Temporary files under `.harness/temp/s044/**` | Baseline green; targeted mutations remove the root interrupt/C3 pointer, remove root invariant 5 or its inbox/state markers, duplicate/move C3 ownership, move compact after report handling, delete reviewer parity, remove pair reload-first safety, C3 lifecycle/fire-and-forget/reuse, or C7 push/pull markers; adding compact `--wait` or receipt gating fails, while unchanged root/C7 `pij inbox --wait` stays green; source files remain byte-identical. | Real fixtures, no mocks. |
| [ ] | T005 | Run a cold branch-payload canary with isolated reusable real peers for coder completion and reviewer verdict. | `pij-skill` | `.harness/temp/s044/**`; `docs/plans/044-compact-before-redispatch/validation/cold-completion-canary.md`; `docs/plans/044-compact-before-redispatch/validation/one-shot-compact-evidence.md` | Resolved skill path points at the worktree payload; reusable-peer event order shows compact send (without `--wait`) as the first tool action, followed immediately by report/review/fix work without receipt polling or compact blocking; the separate one-shot evidence records expected `E-DEAD` after auto-dissolve. | Use project-local skill linking; do not repoint the global live skill. |
| [ ] | T006 | Run gates and prepare the change for independent review. | `extension-authoring-harness` | All changed files | `just pij-skill-check`, its mutation matrix, targeted cold canary, and `harness checks` pass; non-plan changed paths equal the five implementation files in the Domain Manifest, and additional durable outputs are confined to this plan folder's named validation/report/review paths. | No implementation in the orchestrator seat. |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T001, T002 | Root marker assertion and skill diff. |
| AC-02 | T001, T002, T005 | Pair ordering assertion and coder-completion event trace. |
| AC-03 | T001, T002, T005 | Reviewer-parity assertion and verdict event trace. |
| AC-04 | T001, T002, T004, T005 | No-`--wait`/non-blocking mutations and cold event order. |
| AC-05 | T001, T002, T004 | Root invariant 5 + completion interrupt, C3/pair/C7 ownership, and targeted lifecycle/safety/reuse/push-vs-pull mutations. |
| AC-06 | T001, T004 | Structural RED→GREEN plus ownership/order/detail mutations. |
| AC-07 | T005 | Cold branch-payload event-order canary. |
| AC-08 | T005, T006 | Exact plan evidence path, non-plan manifest subset, and full gate. |
| AC-09 | T003, T006 | Domain review and final changed-path check. |
| AC-10 | T001, T002, T004, T005 | One-shot boundary marker/mutation and recorded `E-DEAD` lifecycle evidence. |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Future delivery-mode edits collide with compact no-`--wait` checks. | Medium | High | Match the full compact-command phrase/section; mutation-prove that `pij inbox --wait` remains allowed and required. |
| Root/pair wording duplicates C3 and later drifts. | Medium | Medium | Split responsibilities explicitly and gate markers/order, not copied paragraphs. |
| Cold canary observes prompt compliance once but not universally. | Medium | Medium | Report it as cold evidence, not proof for every model/session; structural sensor remains deterministic backpressure. |
| Project-local skill link resolves incorrectly. | Medium | High | Record `readlink`/resolved path before canary and fail the test if it points outside the worktree. |
| A one-shot validation peer auto-dissolves before the completion interrupt can compact it. | High | Low | Treat `E-DEAD` as expected for `--once`; use resident/reusable peers for compact-order canaries. |
| Live-deployed Markdown changes affect active sessions during implementation. | Medium | High | Worktree isolation, s041 sequencing, no global symlink mutation, separate reviewer, PR landing. |
