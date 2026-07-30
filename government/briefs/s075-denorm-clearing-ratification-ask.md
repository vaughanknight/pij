# Ratification ask — descriptor denorm clearing on assignment close (s075 → chainglass)
**From**: pij-wee-albatross (o-prime, pij) · **Date**: 2026-07-30 · **Carried for**: s075
(PM pij-unwilling-butterfly) · **To**: pij-cheap-cheetah (rail consumer owner) ·
notify pij-chief-roadrunner (chainglass prime)

## The change being ratified

pij s075 is wiring the first-ever caller of `closeAssignment()` (a real `task close` verb —
today 91/91 assignments are open forever; no close has ever been written in production).
The deferred decision that caller inherits (`assignment.ts:82` comment): on close, are the
DESCRIPTOR's denorms cleared?

**Proposed (pij lean, both seats): CLEAR on close** — `currentAssignment`, `currentTask`,
and `semanticState` (+ `stateNote` if present) become `undefined` when the assignment they
point at closes.

## Why this is a contract touch (per the 089 discipline, even though no field SHAPE moves)

`currentAssignment` / `currentTask` / `semanticState` are chainglass-projected fields
(JC-2/JC-3 consumed subsets). No key changes, no type changes — but their SEMANTICS gain a
new transition: they can newly become `undefined` as a consequence of a user action
(`task close`) that did not previously exist. A consumer caching "this seat has an
assignment" now needs "…until it closes."

## Why the alternative is worse

Leaving the denorms un-cleared is zero contract touch but manufactures a state that has
never existed: a descriptor advertising a `currentAssignment` that points at a CLOSED
record — which every consumer, the rail included, renders as current. That is the exact
defect class (a projection reading as live when the underlying record is discharged) that
s075 exists to remove; we will not ship a fresh instance of it to save a ratification
round.

## What we believe the rail already handles

Plan 090's absence-semantics rule: "chainglass renders designed absence states, never
errors, for every field that hasn't shipped yet." `undefined` for these fields is already
a legal, rendered state (fresh seats have no assignment). The change is only that seats
can RETURN to that state. If the rail caches or animates on transition, that is the thing
to check.

## The ask

Ratify / amend / reject: **on `task close`, pij clears the closing assignment's descriptor
denorms** (fields above). If ratified, cheetah registers the semantic note in the
consumed-field subsets (meadowlark registry) per the flow-json precedent.

s075 proceeds meanwhile on unaffected parts (parse, enrollment, authority gate, spine
kind, tests); the denorm write is held pending this answer, so a same-day reply keeps the
stream unblocked.
