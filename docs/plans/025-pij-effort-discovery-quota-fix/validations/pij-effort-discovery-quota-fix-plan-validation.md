# Validation — pij-effort-discovery-quota-fix-plan.md

**Date**: 2026-06-29
**Target**: `docs/plans/025-pij-effort-discovery-quota-fix/pij-effort-discovery-quota-fix-plan.md`
**Verdict**: ✅ VALIDATED WITH FIXES — all 3 findings folded into Phase 1 (HIGH + 2 MEDIUM)
**Scope**: adaptive (lead deterministic proof + 1 independent critic)

## Resolution (fixes applied to the plan, reverified)
- **HIGH** → Phase 1 now defines the discriminator (error-frame/anchored-phrase, never bare words) and names `death-reason.test.ts:96-110` as must-stay-green; task 1.5 proves the pincer both directions.
- **MEDIUM F4** → new task **1.2b** tests the peek (`pushProviderFailure`) branch; coverage map AC-01 now lists both paths.
- **MEDIUM F3** → new task **1.6** scopes classification to the pane tail and/or decouples is-dead from reason (impl-time design call noted).
Below is the original finding set (retained for the record).


## Proof run (claims confirmed against source)
- Finding 01/02 real: `daemon.ts pushWholeLifeTransition` classifies reason off `capturePane` then emits authoritative `💀` (`buildDeadNotice(..., {authoritativeDeath:true})`, daemon.ts:143-147); `TERMINAL_QUOTA_RE` (state.ts:74-76) contains bare `credit|balance|billing|prepaid|payAsYouGo|insufficient`; quota tested (state.ts:90) before DEAD_RE (91).
- Finding 03 real: `core/models/registry.ts` never references `reasoning`/`thinkingLevelMap`/`levels`.
- AC-04 flags exist: `claude --effort`, `copilot --reasoning-effort`, `codex model_reasoning_effort`; `parseSpawnArgs` has no `--effort`.
- Phase independence (P1/P2/P3 "Depends On: None") CONFIRMED — Domain Manifest file sets are disjoint (P1: state.ts+daemon.ts; P2: registry/validate/spawn/cli; P3: SKILL.md).

## Findings

| Severity | Finding | Evidence | Impact | Smallest fix |
|---|---|---|---|---|
| HIGH | Phase 1's "tighten `TERMINAL_QUOTA_RE` to a real error shape" is unactionable AND collides with existing locked fixtures the plan never names. | Task 1.1 rejects `"insufficient line items"` → unknown, but `death-reason.test.ts:107-109` pins `"API Error: 402 insufficient credits"` → quota, and `:96-104` pin `"prepaid credit balance exhausted"` / `"payAsYouGo balance insufficient"` → quota, all locked by the FIX-B mutation guard (`:95`). Reject vs keep differ only by neighbouring token; the plan defines no discriminator. | Two implementers diverge: one still matches billing prose, the other drops a real quota death — the thesis anti-goal. AC-02 "mutation-proof" is unverifiable without naming both guards. | In tasks 1.3/1.4: (a) name `death-reason.test.ts:96-110` as must-stay-green; (b) specify the discriminator — bare `billing\|credit\|balance` alone never matches; require an error frame (`Error:` / HTTP `402` / `exhausted` / `top up` / `add credits`) OR an anchored phrase (`insufficient\s+(credit\|funds\|balance\|quota)`, `balance\s+insufficient`, `quota.*exceeded`). |
| MEDIUM | Full-scrollback classification means even a tightened error-shape regex fires when the literal error text is present for a non-death reason. | `daemon.ts:143-144` and `:205` both run `classifyDeathReason(capturePane(...))` over the whole buffer; a billing repo legitimately prints `"402 insufficient credits"` in its own error-handling code / transcripts. | Residual false `quota` persists in exactly the user's `osk-split-billing` environment; the plan presents regex-tightening as a complete fix. | Add to Phase 1: scope classification to the pane **tail** (last error region), and/or decouple authoritative "is dead" (from pid) from low-confidence "reason" — default the dead branch to `dead`/`unknown` unless a high-confidence terminal error is in the final lines. |
| MEDIUM | AC-01 promises "no false ⚠️ peek (provider-failure branch)" but no task tests the peek branch. | Dead path (`daemon.ts:144`) and peek (`daemon.ts:205` `pushProviderFailure`) are separate emissions (`authoritativeDeath:true` vs `false`); tasks 1.1/1.2 + coverage map (plan line 183) name only the dead path. | A peek-gate regression (`isFatal`, daemon.ts:206) passes all enumerated tests while violating AC-01. | Add task 1.2b: "peek branch with billing scrollback on a stale-idle pid-alive session → no `provider-failure` push / no ⚠️." |

**Thesis**: partial — Phases 2/3 are sound and actionable; Phase 1 (the urgent one) cannot be implemented unambiguously as written, and understates residual risk. The fix is well-determined by evidence (existing fixtures + the reject set fix the discriminator).

**Consumers**: downstream = the implement stage (stage 6); Phase 1 tasks not yet actionable enough for it. Phases 2/3 ready.

**Open decision (human-gated)**: the MEDIUM design choice — pure regex-tighten vs. tail-scoping vs. decoupling is-dead-from-reason — is an architecture call for Phase 1, not a mechanical repair.
