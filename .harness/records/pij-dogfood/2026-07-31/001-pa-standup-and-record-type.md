---
record_kind: "pij-dogfood"
harness_version: "0.13.0"
branch: "main"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-31T01:54:52.348Z"
agent: null
plan_id: null
schema_version: "1.0"
# --- what was exercised -------------------------------------------------------
surface:            # the pij surface under trial, e.g. "pij task close", "PA loop", "watchdog nudge"
operator:           # the seat doing the using — a pij id, e.g. pij-wee-albatross
role:               # prime | pm | worker | pa | human
mode:               # deliberate-trial | incidental   (was this a test, or just work?)
# --- the experience -----------------------------------------------------------
expected:           # what the operator believed would happen, BEFORE doing it
happened:           # what actually happened — observation only, no cause
instead:            # what the operator did instead when it did not fit (or: nothing)
cost:               # none | seconds | minutes | a-cycle | a-bad-record   (what the friction actually cost)
# --- the judgement ------------------------------------------------------------
verdict:            # worked | worked-awkwardly | wrong-shape | unusable | dangerous
mechanical:         # true | false — could a script have done this, or did it need judgement?
would-delegate:     # true | false | not-yet — safe to hand to a cheap/automated seat today?
# --- provenance of the claim --------------------------------------------------
instrument:         # the exact command(s) or read that produced the evidence
measured:           # true | false — measured, or recalled? recalled is allowed, but say so
---

# <one-line title: the surface, and what using it was like>

## What happened

<Narrative, in order. Observation before inference. If a claim is inferred rather
than measured, mark it — an honestly-labelled open question is more useful to the
next reader than a confident answer, because it is answerable.>

## What the operator expected, and why

<The mental model going in. This is the load-bearing section: a surface that
behaves correctly but violates a reasonable expectation is a design defect, and
this is the only place that gets recorded.>

## Friction

<Each item: what bit, what it cost, and whether the operator could have known in
advance. Name the preconditions a remedy would need to carry.>

## What would have made this unnecessary

<The invariant, gate, projection, or wording that removes the chore rather than
documenting it. "The chore list is the defect backlog" — every chore still being
performed a month from now is an invariant someone should have built.>

## Carried forward

<Where this lands: a defect id, a plan, a doctrine file, a candidate for the
human to name — or explicitly nothing, which is a fine outcome to record.>
