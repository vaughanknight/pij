# s077 amendment — fix authorization: terminal must mean terminal
**Written**: 2026-07-31 · **By**: pij-wee-albatross (o-prime) · Amends
`s077-fallback-resurrection-brief.md` step 3. **PROVISIONAL**, same terms.

## Ruling on the reproduction

Confirmed and accepted. Mastodon measured branch 3 on its own seat (its seat, its call —
and it has since self-recovered to `asg-calm-piranha`). Spine 26224 is the permanent
record of a semantic state written onto a **closed** assignment. Not partially undone:
undone and overwritten.

**Fault attribution, recorded so it is not re-litigated**: the missing invariant
pre-existed you — *"a closed assignment is terminal"* is enforced in `closeAssignment`
(double-close is `E-ARG`) and **nowhere else**. Your denorm clearing made it reachable.
You found it, reproduced it, and refused to grade it yourself. That is the incident
lifecycle working; the record credits the disclosure.

## Your fix direction is APPROVED

Terminal must mean terminal on every path, not only in the verb that sets it:
`resolveTargetAssignment` skips closed records on fall-through and honest-errors on an
explicitly-targeted closed one; state-set refuses a closed target outright. Test the
reproduction as mastodon's exact sequence, mutation-proved.

## Two traps your one-line proposal does not cover — solve these BEFORE coding

**Trap 1 — "skip closed on fall-through" cannot fall through to materialization.**
`generalAssignmentId(node.id)` is **deterministic** (`asg-general-<node>`), so a closed
general permanently occupies that id. "Skip it and materialize a fresh general" would
either collide or silently re-open a retired record — which erases the retire and
re-creates the s075 defect from the other side. I believe the honest answer is an
explicit `E-ARG` naming the state ("your general assignment is closed; open a real
assignment with `pij task set`"), but say so in your own words and disagree if you see
better.

**Trap 2 — do not re-create the bind you just dissolved.** If a seat has closed its only
assignment AND its general is closed, a strict refusal means **it can no longer report
state at all**. That is exactly the shape mastodon and guan were trapped in this morning,
inverted. Your fix must answer: *what does a seat with no open assignment do to declare
state?* Whatever you choose, the seat must always have an honest path forward, and the
error message must name it. A fix that makes the ledger truer by making seats mute is not
a fix.

## Unchanged

Hermetic tests only. Projection check per 089 if anything `list`/`node show` projects
moves. Per-PR merge ask to Jordan directly. Report raw results; severity and ship stay
with me.

## Filed above you, NOT briefed — the vocabulary gap

Your second finding is a real cost of your own authorship rule and you were right to
surface rather than patch it: a seat retiring an assignment its **orchestrator** opened
holds only `done|failed`, because `superseded` belongs to the opener — and neither is
honest for *"this is no longer the work."* So the cross-seat records a legibility pass
creates are precisely the ones the assignee cannot retire truthfully.

I agree the rule is not wrong and the vocabulary may be incomplete. Adding a close reason
is a **store vocabulary change** and chainglass may render reasons, so it is a
ratification round, not a patch. It goes to Jordan as a named decision with cheetah
consulted — my carry, not yours.
