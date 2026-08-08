# Phase 3 tasks — `#156` · standing assignments stop firing `axis-disagreement`

**Stream**: s097 silent-detectors · **Depends on**: Phase 0+1 landing first (same file).

**Files you may write**: `.pi/extensions/pij/core/anomalies.ts` ·
`.pi/extensions/pij/core/anomalies.test.ts`

**Files you may NOT write**: everything else. In particular `core/platform/types.ts` (stream
`s095`) — you **consume** `generalAssignmentId` from it, you do not change it.

---

## The defect

`axis-disagreement` treats **idle** as evidence of a lost dispatch. For a **standing**
assignment, idle is the **resting state**. A role-bearing seat with a standing assignment, doing
exactly the right thing, fires this row every 4 hours forever — and **every state it could adopt
to stop firing is a lie**:

| state it could adopt | truthful? | consequence |
|---|---|---|
| `done` | **no** — a standing role has no completion | mints `unverified-done` rows (42 occurrences / 13 seats, measured in `ai-manu`) |
| `ready` | yes | trips `status-stale` at 30min **and** `axis-disagreement` at 4h |
| `waiting`/`blocked` | **no** — there is no named blocker | parked-and-working: silent by construction |

`anomalies.ts` has **no check on assignment kind** anywhere in the `axis-disagreement` block.
`axisRemedy` already computes `assignmentId === generalAssignmentId(nodeId)` — but only to choose
**wording** (that was `#149`). **`#149` changed what the row SAYS, never WHETHER it fires.**

Live on the board: `'pij-persistent-slug' has open ready assignment 'asg-general-pij-persistent-slug'
but has been mechanically idle 10h (threshold 4h) — the lost-dispatch shape.` The
`asg-general-…` **is** the standing assignment; the detector calls its resting state "the
lost-dispatch shape".

---

## T-1 · A named predicate, not an inline comparison

**Ruled by the prime — the shape is not negotiable.** Add to `anomalies.ts`:

```ts
/** Is this assignment STANDING — a record that by design never completes —
 *  rather than BOUNDED work that can be discharged?
 *
 *  TODAY: only a general assignment is detectably standing.
 *  FUTURE: a store-level standing/bounded flag (#156) replaces this body.
 *
 *  PARTIAL BY CONSTRUCTION: standing work under a CUSTOM assignment name is
 *  NOT detected and remains exposed. Stated here rather than discovered by a
 *  reader, because the call site reads as the concept and the implementation
 *  is narrower than the concept. */
function isStandingAssignment(assignment: Assignment): boolean {
    return assignment.id === generalAssignmentId(assignment.nodeId);
}
```

Two reasons this matters more than style:

1. **The call site reads as the concept, not the workaround** — when the store field lands, one
   function body changes and nothing else does.
2. **It stops the fix claiming more than it delivers.** The predicate is *partial*, and the
   comment says so.

## T-2 · Guard the detector, and unify the remedy on the same predicate

- Guard the `axis-disagreement` emission on `!isStandingAssignment(assignment)`.
- **Refactor `axisRemedy` to call `isStandingAssignment`** instead of re-deriving the same
  comparison, so the concept has exactly **one** definition. Its behaviour must not change —
  `#149` stays landed and its tests must stay green.
- Place the guard so the row is skipped **before** the evidence-gathering loop, not after —
  there is no point walking the spine for a row that will not be emitted.

## T-3 · Tests — LABELLED, and two of these are an external reviewer's bars

`pij-defiant-damselfly` (o-prime, `ai-manu`) reported `#156` and **is reviewing this fix**. Its
bars were set **before work started**.

| # | criterion | kind | source |
|---|---|---|---|
| 1 | a **standing** assignment idle past threshold → **does NOT fire** | **BEHAVIOURAL** | the fix |
| 2 | a **bounded** assignment idle past threshold → **STILL fires** | **PRESERVED-PROPERTY** | **reviewer bar 3** |
| 3 | removing the guard makes criterion 1 **fail** | **MUTATION** | **reviewer bar 2** |
| 4 | `axisRemedy`'s existing `#149` behaviour is unchanged | **PRESERVED-PROPERTY** | regression |

**Already verified against the unfixed tree — do not re-derive, but DO re-run:**

```
× BEHAVIOURAL: a STANDING (general) assignment idle 10h should NOT fire
  AssertionError: expected [ { kind: 'axis-disagreement', …(4) } ] to have a length of +0 but got 1
✓ PRESERVED: a BOUNDED assignment idle 10h must STILL fire
```

Fixture kept at `docs/plans/097-silent-detectors/prefix-verification-156.test.ts.txt`.

**Criterion 2 is a PRESERVED-PROPERTY and must NOT be presented as evidence of the fix** — it
passes before and after. It is there because *"the failure mode of this fix is a guard that
quietly exempts everything"* (the reviewer's words), and it is the only thing standing between
this change and that outcome.

**Criterion 3 is the mutation gate.** Use the fleet tool — **not** edit-run-restore:

```bash
node ~/.pij/shared/mutate.mjs --file /core/anomalies.ts \
  --find '<the isStandingAssignment guard line>' \
  -- .pi/extensions/pij/core/anomalies.test.ts
```

Exit `0` = the gate passes. Exit `2` = **TARGET NOT FOUND**, which is loud on purpose.

> ### ⚠ CRITERION 2 IS THE ONE THE MUTATION MUST COVER, AND IT IS THE EASIEST TO FAKE
>
> Criterion 2 (*a bounded assignment must STILL fire*) is the reviewer's bar against **"a guard
> that quietly exempts everything"** — and it is a **"must stay GREEN"** claim.
>
> A no-op mutation is **self-catching** for criterion 1 (you expect RED, green fails loudly). It
> is **NOT self-catching for criterion 2**: a drifted target mutates nothing, criterion 2 stays
> green, and that green reads as *proof the bounded case is independent of the guard* — a proof
> that was never actually run. **Green is the expected outcome either way**, so the only thing
> separating evidence from nothing is proof the code really changed.
>
> So run the mutation and confirm **both**: criterion 1 goes RED **and** criterion 2 stays GREEN
> **in the same run where the mutation is proven applied** (exit 0 or 1, never 2).
> *(Framing owed to `s094` / `pij-shaggy-lark`.)*

## T-4 · The limitation must be stated, not buried

**Reviewer bar 1 is only PARTIALLY met and the PR must say so in plain terms.** The bar was:

> *the guard must key on the assignment being STANDING, not on the `asg-general` name pattern —
> because a name-keyed fix "silently excludes standing work under a custom name, which my own PA
> has, so it would leave my seat exposed while appearing to fix the class."*

The named-predicate shape meets the bar's **spirit** (the call site keys on "standing") while
the **implementation is currently name-keyed and therefore partial**. Standing work under a
custom assignment name **remains unprotected**, and the reviewer's own PA is an instance.

Put this in the code comment **and** in the PR body. Do not soften it. A reviewer who set a bar
before work started is owed the news of which part was not cleared — stated, not discovered.

**This PR does not close `#156`.** The issue stays open for the store-level field. It also does
**not** address the `status-stale` half: the same standing seat still trips that row at 30min,
which `#156` explicitly names. Say so.

---

## Gates — run ALL of them

```bash
cd /Users/jordanknight/pi-hacking/pij-worktrees/s097-silent-detectors
just typecheck
just lint
npx vitest run .pi/extensions/pij/core/anomalies.test.ts
```

`noUncheckedIndexedAccess` is ON. `.js` on relative imports. No `any`.

## Report back

the diff · the pre-fix failure output · the mutation evidence · anything ambiguous you decided
yourself.
