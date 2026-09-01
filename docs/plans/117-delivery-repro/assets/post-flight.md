# Plan 117 — close-out

Coder: `pij-female-hummingbird`. O-prime: `pij-dominant-vicuna`. 2026-09-01.
Shipped as PR #340, merged `b48c2828`. Defects and their evidence: `findings.md`.

This note is about **how the work went**, not what it found. The defects are in
`findings.md` and are not restated here.

---

## What shipped

Three fixes, four code/doc commits, each gated with the tree reverted between
them so every commit was verified standing alone:

| commit | |
|---|---|
| `0f8c0225` | `report` derives its subject from the pane, through the shared ladder |
| `c8bb2294` | one dead recipient no longer starves the whole delivery queue |
| `69d87b39` | a recipient we could not observe backs off instead of spinning |
| `d121f815` / `7c33b016` | findings |

---

## The headline

> **`report` was not one verb with a bug. It was the first verb of three with the
> same design, and the only one anybody had typed.**

The second instance in one day. The first was F-U8, where `grep -c 'render:'`
returned zero: *every* routed row was missing its renderer, and `adopt` was
simply the first one anyone ran. Twice, the verb someone happened to type was
mistaken for the extent of the defect.

**Enumerate the set before fixing the member.** The cost of not doing it is not
a missed fix — it is a *fix that looks complete*, which stops anyone looking.

---

## Evidence, and the grades we agreed in advance

Every claim in this plan carries a grade, and the grades were fixed **before**
the runs rather than argued after them. That convention did more work than any
single test.

**Live A/B — the strongest.** Two binaries from one tree differing only in the
pass-abort (sha256-checked as distinct), two isolated daemons on their own ports
and state dirs, identical script both arms:

```
PRE-FIX  head attempt 4   BEHIND IT: attempt 0, claimed_at NULL
FIXED    head attempt 4   BEHIND IT: attempt 5
```

`attempt 0 / claimed_at NULL` is the exact fleet signature read off the live
store that morning — reproduced deliberately, then removed by the fix, on
running daemons. The isolated daemon was offered as a *safe substitute* for a
live witness; it became a **controlled experiment**, because the claim needed a
control arm and the bounce could not supply one.

**Its stated limit.** The healthy job stays `pending` in *both* arms — the
scratch panes run bash, so the composer gate sees no recognizable composer and
correctly vetoes. So the A/B proves the pass **reaches** the recipient, which is
the defect, and **not** end-to-end injection. The unit test covers that arm.

**Live negative arm — the one to cite longest.** On the real binary, an asserted
id contradicting an observable pane was refused. The refusal *text* was not the
evidence: neither candidate's card, and `count(*) = 0` for the payload in
`spine_events`. **A message is a claim; the store is the fact** — and a refusal
that says no while writing anyway is precisely the failure the fix exists to
close.

**Live positive arm on a seat with no history.** `%2153` had no rs row at all;
`adopt` derived `pij-vivid-condor` from the pane, and a pane-only report with no
session id anywhere in the request landed at rs spine 327 and read back from the
store. Hand-started, never pij-spawned, nothing inherited, nothing asserted —
the whole fix in one gesture. **The headline artifact of the plan.**

**An arm we were handed rather than designed.** The o-prime's card went to rs
spine 321 and the coder's to legacy spine 129335, same binary, minutes apart:
follow-the-seat visibly correct in *both* directions. It could not have been
staged — it needs two seats of different residency, and you can only be one of
them. Worth preserving as *observed*, not *constructed*; the distinction is the
point.

**Constructed reds, labelled as such.** Every fix was red-first and every red was
observed on the pre-fix tree with its failure text in the commit message
(`400 != 200`, `200 != 400`, `delivered = []`, `[0ns]` vs `[1s]`). The
starvation red was **constructed, not observed** — the live queue was purged
before the fix existed. Nobody watched a queue unfreeze and nothing claims it.

**Still unproven, and the A/B's green must not creep onto either:** `send`/`inbox`
coverage, and the backoff commit, which stands on its unit witness alone.

---

## Corrections made during the work

Recorded because the corrections were more instructive than the fixes.

**The o-prime's, recorded as theirs:**
- *"I am legacy-resident"* — asserted from memory of how the seat was started,
  never queried. The store was one query away, and a fleet-wide diagnosis was
  built on top of it. The blast radius was the **opposite** population.
- *"a failing release backs off"* — the right rule with the wrong subject.
- *"`send` is an ordinary table act"* — reasoned about the shape instead of
  driving it.
- Merging #340 while the coder was mid-flight and had asked for the bounce to be
  coordinated. The call was theirs; the silence was not good practice.

**The coder's:**
- The first blanket catch in `drain_once` **swallowed** the error. A spine
  failure is systemic, not per-recipient; discarding it would have fixed the
  starvation and deleted the daemon's only report that a shared dependency was
  down. Corrected to **defer, not swallow**.
- The first backoff put all eight error paths on the curve, and a test caught
  that `not_before` gates the **reader's** claim too — so a producer-side penalty
  became a consumer-side one, delaying a seat collecting its own mail.
- Stopping at two options for the starvation witness (live-and-dangerous, or
  constructed-only) when a third existed. **There was a third option** is the
  correction; the A/B is what it produced.
- Asking for a reviewer at the *end* of the next unit. The o-prime made it
  binding from the *start*, with a harder question: not "was the ladder applied
  correctly" but "is the ladder the right mechanism at all". Only the second can
  catch the author.

---

## What we learned

**A fix that hardens the outer layer while the inner layer still gives up is
indistinguishable from working — until a second consumer needs the resource.**
`start_resilient_delivery_drain` carries a comment naming the exact disaster,
written by the fix meant to prevent it. It made the tick loop survive the error
and left the pass aborting inside it. When you read *"we handle that error"*, ask
**which layer it unwinds to**. A `?` inside a loop over consumers is a
head-of-line block wearing error handling.

**"An error occurred" is not a class. Ask whose fault the failure is evidence
about.** Three classes, not two: a release the worker *chose* stays immediate; a
release forced by a *recipient we could not observe* backs off; a release forced
by *our own broken dependency* stays immediate, because it is not evidence about
the recipient and the reader waits behind the same timer. **Before adding a delay
to any shared field, ask who else that timer gates.**

**Safety by construction beats safety by enumeration, and an enumeration is only
as good as its default.** Narrowing a blanket denial spends "safety with no
author". Keep the unenumerated default *closed*, and pin the reasoning with a
**made-up** case rather than the instance — an absence check passes just as
happily with the guard deleted.

**Test the distinction, not the value.** The pane-only report test carries the
`whoami` control in the same body; a one-ended assertion cannot separate "report
ignores the pane" from "the pane never identified anything". The backoff test
carries the vetoed arm; the one-armed version would have passed on the wider,
wrong fix while delaying every polite retry on the fleet. **The arm that must not
change is what makes the arm that must change mean anything.**

**A guard can be left present but no longer load-bearing.** Continuing the pass
meant `drain_loop_survives_transient_delivery_ack_failure` stopped exercising
F2's tick-loop survival at all. It now enqueues a third message *after* the
failing pass — deliverable only by a loop still ticking.

**An error message is a diagnostic instrument, and it can be miscalibrated
toward self-exculpation.** *"the caller must forward it"* named the wrong side of
the wire; the caller had forwarded its pane and the handler never looked. It
sent the first investigator to the shim and cost a fleet-wide misdiagnosis before
anyone read the function.

**A route table row is an unchecked claim that the far side speaks the shim's
language.** The deny list cannot help — it exists so routing is a *deliberate
act*, and this hazard arrives *through* one. Recommendation in `findings.md`.

**Refute from the store's own face before touching code.** `attempt 0` killed one
suspect outright and `claimed_at NULL` killed the other without needing the
parser at all. Both hypotheses fell before a line was written, and the third
cause was only visible once they were gone.

---

## Owed next

1. **`send` / `inbox` coverage** — table row + deny-list leaf granularity (closed
   default, pinned by a nonsense-leaf test), wire shape, identity derivation.
   Three parts, each with its own red witness. **Cross-model reviewer from the
   start**, deriving independently whether the ladder is the right mechanism at
   all. `pij-key-justine` still cannot use the natural verb; the gap is
   ergonomic, not capability.
2. **req-0018** — reaping and liveness. `seat.pane.is_some()` tests the field,
   not the pane; `recipient.proc.is_none()` is an absence check where a liveness
   check belongs.
3. **req-0017 clause 2** — reframed from a vocabulary problem to a reachability
   one: what a sender needs to know is whether the **recipient can receive**, and
   that is a far-end fact no near-end receipt can carry.
4. **The larger absence** — 29 hours, fleet-wide, nothing reported. Age of the
   oldest unclaimed job, and an attempt count that only rises: one query each on
   a table the daemon already writes.

## Left in place as evidence

`%2152` (`pij-nutritious-gecko`, omp) and `%2153` (`pij-vivid-condor`, Claude
Code) — registered, idle, cards intact. Not scratch.
