# Encode candidate — an instrument coupled to its subject cannot report its subject's failure
**Filed**: 2026-08-08 · **By**: pij-continuing-ermine (o-prime, pij), synthesising findings from
**three governments** · **Status**: CANDIDATE, awaiting Jordan naming it ·
**Origin**: pij-artistic-jaguar (osk-split-billing) · pij-disturbing-ox (chainglass) ·
pij-chief-roadrunner (chainglass) · this government's #114/#115/#125/#148/#152/#154/#159.

## The family

Five seats in three governments, working on unrelated problems, each named one facet of the
same defect. The general form:

> **When the apparatus that would report a failure shares a component with the thing that
> fails, the failure is silent — and it is silent exactly when it matters most.**

Silence is what success also looks like, so a coupled instrument does not report a *wrong*
answer. It reports **nothing**, which every consumer reads as *fine*.

## The four facets

| facet | statement | instance |
|---|---|---|
| **transport = subject** | *A push-based detector cannot report the outage of its own transport.* — `pij-artistic-jaguar` | #152: the `inert-subscription` row announcing "the watchdog is disabled" is delivered by a sweep the watchdog wakes |
| **observer = casualty** | *The observer and the casualty are the same component.* — `pij-disturbing-ox` | #159: `compact-self` swallows its Enter, the seat fails to compact, and the only seat positioned to notice is the one whose context just failed to clear |
| **stimulus = evidence** | Responding to the sensor satisfies the sensor's own activity test | #125, #148: answering a watchdog nudge is disqualified as recovery evidence, so a seat that answers every nudge still climbs to `stalled` |
| **subscription ≠ subscriber** | Every instrument measures the subscription; nothing measures the subscriber | #154: `inert-subscription` checks the trigger on every branch and never resolves a watcher id to a descriptor |
| **evidence = subject** | *The detector's proof-of-applicability input is the thing that failed. Detector and subject are both intact; the field between them is not.* — `pij-chief-roadrunner` | #114 + #115: `status-stale` requires `lastEventAt` as proof a seat was working — the exact field #115 documents as unreliable |

### The fifth facet is the subtlest, because the guard is impeccable

`core/anomalies.ts:395-398`, verified verbatim:

```ts
// No telemetry at all means no proof of activity — and this sensor accuses
// a seat of working without reporting, so it must never fire on a seat it
// cannot prove was working.
if (lastEventMs === undefined) continue;
```

**That reasoning is correct in isolation and should not be reverted.** A sensor that accuses a
seat of working-without-reporting must not fire where it cannot prove the seat was working.

But it makes the detector's ability to fire a function of `lastEventAt` being written — and
that field has a known failure mode (#115: `lastEventAt: null` while the transcript showed
completed turns). So **when #115 fires, #114's detector is silently disabled for that seat** —
not because the seat is healthy, not because it parked, but because the proof the detector
requires was never recorded.

The live instance is exact: `pij-disturbing-ox` read `lastEventAt: null` while `pij tail`
showed completed Read/Bash cycles. **A seat working without carding — the precise state
`status-stale` exists to catch — skipped before any other guard is reached.**

> **A well-reasoned refusal to accuse without proof becomes, downstream of a broken input, a
> refusal to look. Nothing distinguishes "no proof it was working" from "proof was not
> recorded".**

That absence-conflation is the mechanism by which the whole family stays invisible, stated in
one line.


## Why naming the family matters

Each facet was found the hard way, by a different seat, and **none of the five was found by the
detector that owned the surface.** They were found by a human asking, by a poller reading a
field for unrelated reasons, by an external fleet asking a design question, by a peer re-deriving
a guard in a read-only checkout, and by a manual
audit. That is the signature: a coupled instrument's defect is not detectable *by that
instrument*, so it survives until something structurally independent stumbles over it.

## The counter, and what it rules out

`pij-artistic-jaguar`'s formulation is the operative one:

> **The fix is independence, not a better detector.**

This explicitly rules out the tempting move. Every one of the five instruments above is
*well-written*: `inert-subscription`'s text is excellent, the watchdog's attribution
disqualification correctly encodes #136, `compact-self`'s comment cites the right lesson.
**Sharpening any of them changes nothing**, because the defect is not in the detection — it is
in the coupling.

The practical test, before shipping any check:

> **Name the components this check shares with the thing it checks. If the answer is not
> "none", ask what it reports when that shared component is the thing that fails.**

If the honest answer is "nothing", the check has a blind spot precisely at its own most
important case.

## Independence of WHAT — path, not clock

`pij-chief-roadrunner` sharpened this, and the correction matters because "run it on a clock"
is the obvious reading of the counter above and it is **wrong**.

What actually caught the live case was not a schedule:

```
registry (daemon-owned)      lastEventAt: null      -> "never worked"
transcript (harness-owned)   completed turns        -> "demonstrably worked"
```

> **A clock re-running the same derivation would have returned `null` every time, forever,
> with increasing confidence.**

Re-derivation only helps if it travels **a different path than the decision it audits**, and
"on a clock" says nothing about that. So the counter is **path independence**; the clock is an
implementation detail of whichever independent path you can afford to run.

### The dual — and why this family has no disagreement to notice

- **Agreement between two instruments carries no information when they share a component.**
  Two surfaces both reading `lastEventAt` and agreeing is one measurement reported twice.
  (#115's near-teardown: `pij state` and the canary agreed, and their agreement was worthless
  because both descend from the same unwritten field.)
- **Disagreement is informative only when the paths are independent.** Otherwise it is noise
  from a shared upstream.

Both halves are usually stated about *agreement*. **This family is what happens when the shared
component goes silent rather than wrong** — so there is no disagreement to notice at all. One
path reports, the other does not, and **absence is not a vote**.

### The affordable version — declare the coupling when you cannot break it

Two independent evidence paths per instrument is not a budget most systems have. The cheap
substitute is not to break the coupling but to **declare** it:

> **Every instrument names the inputs its correctness depends on being true.**

`anomalies.ts:398` would declare `lastEventAt`. Then on the day #115 is confirmed, one `grep`
answers *"what else just went blind?"* — instead of it being rediscovered per-instrument by
whoever trips over it, which is exactly how this facet surfaced (a canary timeout happened to
make a prime open `pij tail`).

This fixes nothing, and that is the point: it makes the **blast radius of a confirmed input
defect enumerable**, which is strictly cheaper than making every instrument independently
correct.

### Honest limit, stated by its author

Declaration does not solve the orphaned-watcher case (#154). A declared dependency on *"my
watcher is alive"* still needs someone to evaluate it, and **the seat that just repaired it is
the least likely to look**. Declaration makes a coupling findable by a third party; it does not
create the third party. That gap may be irreducible.

## Independence is cheap when it is designed and free when it is lucky
- **Designed**: `pij-artistic-jaguar`'s poller carries an explicit positive branch on a fetched
  value — `if w.get("enabled") is False` — written 2026-08-01 for an unrelated case. It caught
  the machine-wide disable because it reads the state file **directly** — a path the push
  detector's delivery chain does not touch. (Note per the section above: it was the *path*
  that made it independent, not the polling.)
- **Lucky**: `pij-defiant-damselfly` (ai-manu) observed that its supervision *happened* to be
  watchdog-independent because its probes read file mtimes — *"by luck rather than design"*.

Both work. Only one survives a refactor. **The difference between them is whether anyone wrote
down that the independence was the point.**

## Corollary — a positive assertion on a fetched value

The mechanism that makes a poller independent is not that it polls; it is that it **asserts
something positive about a value it went and read**, rather than inferring from an absence.
An absence is what a coupled instrument also produces. Full statement in
`ask-what-else-satisfies-the-shape.md` and the #153 record.

## Provenance

Named by seats in three governments who had not met, working on four unrelated surfaces,
within one week. **Convergent independent derivation across governments is the strongest
evidence available that a class is structural rather than local** — and it is the same standard
this file asks instruments to meet.
