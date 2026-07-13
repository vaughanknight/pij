# Cold Review — s044 Phase 1

**Date**: 2026-07-13  
**Reviewer**: `pij-vital-toad`  
**Verdict**: **FIX_REQUIRED**

## Reviewed Change

- **Base / HEAD**: `1336291a5a2285d37487cf83bda86b7438ba93c4`
- **Uncommitted diff sha256**: `e920bf198c97668119c3a006d068dd44ac64147d65aac709ff3c0feeb3dd75d1`
- **Plan**: `compact-before-redispatch-plan.md` v1.8, sha256 `a422da9f735a2be20fd00c9ed9fb8a147d876791cf2bf9164760b83c9c277018`

| Path | Review result |
|---|---|
| `skills/pij/SKILL.md` | Completion interrupt is always loaded; invariant 5 is unchanged. |
| `skills/pij/references/00-routing.md` | C3 correctly makes completion compact first, terminal-only, fire-and-forget, and non-blocking; C1/C7 are unchanged. |
| `skills/pij/references/routes/pair.md` | Coder/reviewer ordering and reload-first exception are explicit. |
| `harness/scripts/pij-skill-check.sh` | Core markers and ordering are guarded, but receipt-gate rejection has an additive false negative. |
| `docs/domains/pij-skill/domain.md` | Completion concept/invariant/history added without removing PR #9 concepts. |

## Findings

| ID | Severity | Evidence | Finding | Required fix |
|---|---|---|---|---|
| F-001 | CRITICAL | `tasks/phase-1-completion-first-peer-compaction/tasks.md:90-97`; rubric Dimension 7 at `skills/flow-pair/references/review-rubrics.md:163-180` | The required `execution.log.md` is absent at both the plan root and phase-task path, while T001-T006 remain unchecked at `tasks.md:52-57`. The coder completion report is a claim summary, not the required per-task progress/decision/gate artifact. The rubric makes an absent execution log an automatic `FIX_REQUIRED`. | Add the plan-owned execution log with task outcomes, changed files, decisions, and gate evidence; reconcile the task statuses with the completion claim. |
| F-002 | HIGH | `harness/scripts/pij-skill-check.sh:168-210`; `.harness/temp/s044/mutation-matrix.sh:69-71`; T004 at `tasks.md:55` | The structural gate accepts an **added** receipt-progress gate as long as the existing positive marker remains. Independent copied-root mutation appended `Wait for compact receipt delivery before report handling.` after `observe-only diagnostics, never progress gates.`; `PIJ_SKILL_ROOT=<fixture> bash harness/scripts/pij-skill-check.sh` exited **0**. The 23-case matrix only *replaces* the positive marker, so it does not prove T004's claim that adding receipt gating fails. | Add narrowly scoped negative receipt/progress-gate detection for C3/pair and an additive mutation case. Keep `pij inbox --wait` explicitly allowed and required. |

## Dimension 0 — Independent Mutation

Changed assertion:

```text
s/(require_count "\$root_skill" "\*\*Completion interrupt\*\*") 1/\1 2/
```

Command:

```bash
bash harness/scripts/flow-pair-mutate.sh \
  harness/scripts/pij-skill-check.sh \
  's/(require_count "\$root_skill" "\*\*Completion interrupt\*\*") 1/\1 2/' \
  'bash .harness/temp/s044/reviewer-dim0-test.sh'
```

- **RED**: `expected 2 occurrence(s) ... found 1`; `pij-skill-check failed`.
- **Restored sha256**: before and after `cb0cdafc7a69ee1c40ca72f2e0f6a41eb2a15de59440ccb7200578413c1b9113`.
- **GREEN**: completion-root assertion passed; `pij-skill-check: all green`.

The coder's 23-case copied-root matrix also reran successfully and confirmed all five source files remained byte-identical. F-002 concerns the missing additive contradiction case, not restoration.

## Acceptance Coverage

| AC | Status | Evidence |
|---|---|---|
| AC-01 | PASS | Root invariant 6 names completion as an interrupt and compact as first tool action. |
| AC-02 | PASS | Pair coder sequence compacts before report handling/reviewer acquisition. |
| AC-03 | PASS | Pair reviewer sequence compacts before FIX/APPROVE handling. |
| AC-04 | PARTIAL | Current prose is fire-and-forget and non-blocking, but the sensor misses additive receipt gating (F-002). |
| AC-05 | PASS | Root invariant 5, C3 ownership, pair reload-first safety, and C7 pull behavior are retained. |
| AC-06 | FAIL | Additive receipt-gate mutation stays green (F-002). |
| AC-07 | PASS | Accepted coder/reviewer traces show compact as first post-event tool, then artifact read, with no intervening polling/receipt gate. |
| AC-08 | PASS | Non-plan modified paths exactly match the five-file grant; no product path changed. |
| AC-09 | PASS | Domain concept, invariant, and history are current; plan 041 pull guidance remains. |
| AC-10 | PASS | C3 records expected one-shot `E-DEAD`; lifecycle evidence is bounded and consistent with auto-close behavior. |

## Required Questions

| Question | Answer |
|---|---|
| Completion compact first for coder and reviewer? | Yes. |
| Explicit fire-and-forget with no compact wait/poll/receipt gate? | Current payload: yes. Structural prevention of an added receipt gate: no, F-002. |
| One-shot auto-dissolve / `E-DEAD` accurate? | Yes; explicitly scoped to one-shot peers with no reusable context. |
| Root invariant 5, C1/C7, and `pij inbox --wait` preserved? | Yes; relevant baseline text is unchanged. |
| Pair reload-first safety and coder/reviewer order retained? | Yes. |
| Structural ownership/order checks avoid rejecting inbox waiting? | Yes, but receipt-gate coverage is incomplete. |
| 23-mutation matrix meaningful and byte-restoring? | Meaningful for its named replacements and byte-identical; incomplete for additive receipt gating. |
| Domain preserves PR #9 concepts/invariants/history? | Yes. |
| Exact five-file grant with no hidden product change? | Yes. |
| Cold canary bounded honestly and evidence-supported? | Yes; it explicitly limits the claim to the isolated runs and the cited traces support tool order. |

## Gates

| Gate | Result |
|---|---|
| `just pij-skill-check` | PASS |
| Independent Dimension-0 mutation | RED -> byte-identical restore -> GREEN |
| 23-case copied-root mutation matrix | PASS |
| Additive receipt-gate probe | **Unexpected GREEN** (F-002) |
| `just typecheck` | PASS |
| `just lint` | PASS with 10 pre-existing warnings and one schema-version info outside the five-file grant |
| `just flow-pair-test` | PASS, 16 files / 148 tests |
| `git diff --check` | PASS |

## Deferred / Non-Blocking

- D-032 fresh-worktree Pi trust-prompt smoke remains external ruled debt and was not expanded or re-reviewed.
- The cold canary is behavioral evidence for two isolated peers, not universal model compliance; its document states that ceiling accurately.

## Verdict

**FIX_REQUIRED** because the required execution log/progress artifact is absent and the new structural sensor does not reject an additive receipt-progress gate as required by T004/AC-06.

## Re-review Round 1

**Date**: 2026-07-13  
**Scope**: F-001 and F-002 only

| Finding | Status | Re-review evidence |
|---|---|---|
| F-001 | **RESOLVED** | `tasks/phase-1-completion-first-peer-compaction/execution.log.md` now records T001-T006 outcomes, exact implementation and evidence files, decisions, RED-to-GREEN history, mutation and cold-canary proof, gates, D-032, the scope-alert disposition, and nested canary-output recovery. The canonical task table marks T001-T006 `[x]`. |
| F-002 | **RESOLVED** | `reject_compact_progress_gate` examines only the extracted C3 and pair completion sections. It rejects receipt, `executed:true`, acknowledgement/confirmation, and compact-completion wording when tied to report/review/fix/next-pointer progress. Root and C7 still explicitly require `pij inbox --wait`. The matrix now contains `c3-additive-receipt-gate` in addition to the original 23 mutations. |

### Independent Proof

- Added the exact contradictory sentence to a copied C3 fixture while retaining every positive marker: `Wait for compact receipt delivery or executed:true before report, review, fix, or next-pointer progress.`
- The focused fixture exited 1 on `completion C3: no additive receipt/completion progress gate`.
- In the same fixture, `completion C7: pij inbox --wait` remained green.
- All five source-file hashes were byte-identical before and after the focused fixture.
- `just pij-skill-check`: PASS.
- Full copied-root matrix: green baseline, 23 original expected-RED mutations, additive expected-RED mutation, and byte-identical source restoration all PASS.
- `git diff --check`: PASS.
- Tracked implementation paths remain the exact five-file grant; round-1 durable fixes are the three paths granted by the fix packet.

### Final Verdict

**APPROVE** — F-001 and F-002 are resolved with non-vacuous focused proof. No smoke or cold canary was rerun, and no out-of-scope finding was added.
