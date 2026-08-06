# Review — plan-084 Phase 1 (Make the gate visible)

**Verdict**: ✅ **APPROVE**
**Reviewed** 2026-08-05 · base `efcc889` (uncommitted working tree) · branch `s091/pa-gate-repair`
**Cold reviewer**: `phase1-reviewer` (gpt-5.6-sol), no authorship, fresh context
**Persisted by**: `pij-respectable-starfish` — the reviewer is read-only and cannot write files

## Process note — the first return was rejected

The reviewer's **first** return was a bare `APPROVE / No significant issues found`, with no
findings, no evidence, and none of the six questions answered. **That was refused as
indistinguishable from a review that never read the diff**, and sent back demanding `file:line`
evidence for each question including the clean ones. The review below is the second pass.
Recorded because an unexamined APPROVE on a permission boundary is exactly the "green is a
claim" failure this stream is meant to catch.

## Orchestrator's own verification (independent of the reviewer)

Iron rule: *no APPROVE without a sha-verified RED → restore → GREEN mutation check.*

| step | command | result |
|---|---|---|
| baseline | `npx vitest run core/cli.test.ts core/orchestration/pa-capability.test.ts` | **397 passed** — matches the coder's claim exactly |
| **mutate** | replaced `parent: effectiveParent(d)` with `parent: d.parentId ?? null` (the D-041 trap, deliberately) | **RED — exactly 1 failure**: `state --json resolves parent through spawnedBy when parentId was never written` |
| restore | `cp` back from backup | **GREEN — 384 passed**, diffstat identical to the coder's (32 insertions, 1 deletion) |
| residue | `grep "parent: d.parentId"` | none — all three `effectiveParent` sites intact (`:2534` list, `:3227` state, `:5285` node-show) |
| live | `just pij state <seat> --json` | `parent` key present, value correct |

**What the mutation proves**: the divergence test is **not vacuous**. It fails for precisely the
mistake the plan was originally going to make, and nothing else fails with it.

Live command-line proof: [`../evidence/live-cli-proof.phase-1.md`](../evidence/live-cli-proof.phase-1.md).

## Reviewer findings — six questions, all answered, all clean

| # | Question | Verdict | Evidence |
|---|---|---|---|
| 1 | Can either key still be **absent** (not null)? | **Clean** | `core/cli.ts:3226-3227` — both are unconditional properties. `projectOrchestrationRole` → `?? null` (`role.ts:59-63`); `effectiveParent` → `?? null` (`tree.ts:15-16`). Neither can return `undefined`, so `JSON.stringify` cannot drop them. Legacy descriptors still load (`adapters/fs-registry.ts:1129-1134`; fields optional at `types.ts:184,232,362`). |
| 2 | Does an **explicit-root** `parentId: null` survive the `spawnedBy` fallback? | **Clean** | `tree.ts:15-16` — `null !== undefined` is true, so `spawnedBy` is never consulted. Covered by `core/cli.test.ts:1417-1432` (fixture sets both `spawnedBy` and `parentId: null`) and `core/tree.test.ts:57-64`. |
| 3 | Additive safety of the `pij state --json` contract | **Clean** | All 21 pre-existing keys retained, same expressions, same relative order; the two new keys inserted between `harness` and `boundModel`. Nothing renamed, removed, or re-semanticised. |
| 4 | Does anything match on the **old** refusal text? | **Clean** | Whole-worktree search (incl. hidden `.pi`, excl. `.git`/`node_modules`) for the old strings → **zero** current matches. One historical prose quotation of the unchanged *prefix* in `government/briefs/chore-primitive-rollout-2026-08-02.md:239`, which parses nothing. Existing tests use `toContain`, not exact equality (`pa-capability.test.ts:129-135`). |
| 5 | Scope leak — signature / decision / registry read | **Clean** | (a) `paRefusal(role, verb)` byte-identical at `pa-capability.ts:153-157`. (b) No diff in `PA_VERB_CLASSIFICATION`/`PaCapability`/`paRefusal`; production change limited to a type-only import, `PA_ROLE_FIELD`, and the message text. (c) `paGate` unchanged — still returns before any read for allowed/unclassified verbs (`core/cli.ts:2227-2228`), one pre-existing caller read at `:2231`. |
| 6 | Are the tests **non-vacuous**? | **Clean, and stronger than claimed** | Reviewer independently ran the matchers against an absent property: `toBeNull`, `toHaveProperty`, `toMatchObject` **all FAIL** on an absent key — the coder's WIN-002 correction is confirmed. One legacy test checks `Object.keys` before values (`:1397-1401`). Each of the 11 new tests named with the regression it would catch. |

## Correction the review surfaced

The change adds **11** `it(...)` cases, not 8: **8** state-projection tests in `core/cli.test.ts`
(`:1374`–`:1475`) **plus 3** refusal tests in `pa-capability.test.ts` (`:143-167`). The coder
reported 8 and the orchestrator's own `grep` also found 8 — both had scoped to one file. Nobody
was wrong; both were **incomplete**, and only a reviewer counting across the whole diff caught
it. A small instance of the same lesson this phase encodes: a partial view reads as a total one.

## Acceptance

| AC | Status | Proof |
|---|---|---|
| AC-01 | ✅ | Q1 above + live CLI transcript + mutation check |
| AC-01b | ✅ | Q2 above; `core/cli.test.ts:1404-1415` and `:1417-1432`; mutation turns `:1404` red |
| AC-02 | ✅ | `core/cli.test.ts:1442-1458`, `:1460-1475` — role and parent render as independent segments |
| AC-03 | ✅ | Q4/Q5 above; `pa-capability.test.ts:143-167`; `PA_ROLE_FIELD satisfies keyof SessionDescriptor` makes the compiler the enforcer |

## Carried into Phase 2

- The `conditional` capability arm must not disturb the `paGate` early-return that keeps AC-14's
  read-count invariant green.
- Phase 2's target predicate **consumes `effectiveParent`**, never raw `parentId` (Key Finding 09).
- AC-06b's live CLI proof runs via **`just pij`** — bare `pij` resolves to the main checkout and
  would produce a passing result about the wrong source tree.
