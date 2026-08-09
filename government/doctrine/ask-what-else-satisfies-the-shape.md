# Encode candidate — ask what ELSE satisfies this shape
**Filed**: 2026-08-07 · **By**: pij-unwilling-butterfly (worker, pij), recorded by
pij-continuing-ermine (o-prime) · **Status**: CANDIDATE, awaiting Jordan naming it ·
**Origin**: the #64/#80/#145/#149 chain — three artefacts by one author, each sound in
isolation, whose intersections cost a seat's ability to declare state.

## The formulation, in the author's words

> All three were written **while looking at the case in front of me**, and none of them asked
> what ELSE satisfies this shape. The guard asked *"is this record closed"*, not *"what else is
> closed"*. The remediation asked *"what are the causes of THIS row"*, not *"what records can
> receive this advice"*. The test asked *"does the derived id work"*, not *"what else has this
> prefix"*. **Same question missing each time.**

## Why it generalises

A **guard**, a **remediation**, and a **test** are all *predicates over a set*. Each of the
three was authored by reasoning correctly about **one member** of that set — the member that
prompted the work.

> **The bug is never in the member you looked at.**

That member is the one case the author has fully in mind, so it is the one case the artefact
handles correctly. The defect lives in the other elements of the set the artefact silently
claims authority over, and the author never enumerated them because the prompting case never
required it.

## The three instances

| Artefact | Question asked | Question missing | Cost |
|---|---|---|---|
| **#64** terminal guard | is this record closed? | what else is closed? | correct in isolation |
| **#80** axis remediation | what are the causes of *this* row? | what records can *receive* this advice? | offered `task close` on a general assignment — a record that by design never completes |
| **#149** boundary test | does the derived id work? | what else has this prefix? | certified a false rationale; next reader edits for the wrong reason |

None of the three is wrong about its prompting case. **#64 is correct** — a closed record must
not be resurrected. **#80 is correct** for a dispatch. **The #149 test's coverage was
correct.** The damage is entirely in the unexamined remainder of each set, and it only became
visible where two of them intersected.

## The check this implies

Before shipping a guard, a remediation, an error message, a detector, or a test, name the set
it quantifies over and find **one member that is not the prompting case**:

- **Guard** — what else satisfies this predicate, and is refusing right for all of them?
- **Remediation** — who else can receive this text, and is every offered action *true* of them?
- **Test** — what else passes this assertion, and does it still fail for the reason claimed?
- **Detector** — what else trips this, and is flagging right for all of them?

If the artefact's justification only holds for the case that prompted it, the justification is
**an example, not a reason** — and the next reader will edit it against the example.

## Corollary — a false rationale is worse than thin coverage

The #149 test's *coverage* was adequate: both the old and new assertions failed under the
hardening they were written to catch (verified by reproduction, after the o-prime's contrary
claim was **refuted by measurement**). What was defective was its **stated reason**, which
described another seat's genuine general assignment as *"a lookalike ... an ordinary
dispatch"*.

> **A test whose stated reason is false is a test the next reader edits for the wrong reason.**

They will preserve what the comment says is protected, discard what it does not mention, and
believe they kept the intent. The old test would have kept passing right up until it stopped
mattering.

## Relationship to the existing files

This is the **upstream** of `preconditions-travel-with-remedies.md`. That file says a remedy
must carry its precondition; this one says the reason the precondition went missing is that
**nobody enumerated who would receive the remedy**. Preconditions are the fix; failing to ask
*what else satisfies this shape* is the cause.

It is also the mechanism behind the D-043 class (a remediation that cannot resolve what it
detects) and behind `an-instrument-that-punishes-diligence-is-inverted.md`: in every case an
instrument was authored against the misbehaving member of a set and then applied to the
well-behaved ones.

## Provenance note

Filed under the author's name deliberately. This was found by **instantiating it three times
and then noticing**, not by reasoning about it abstractly — which is stronger evidence than
any argument, and the attribution should survive summarisation.
