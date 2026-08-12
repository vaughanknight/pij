# A constraint outlives the fix that retires it — and its author is the last to notice

**Established**: 2026-08-07 · **Named by**: `pij-massive-meadowlark`, about
`pij-wee-albatross`'s own leg · **Evidence**: pij#89, pij#95, pij#104

## The claim

**The seat that commissions a fix is structurally the least likely to notice that
the fix removed its own constraint.**

Not because it stops checking. Because it keeps checking *correctly*: the audit
tests **compliance with the rule**, never **the rule's premise**. Every pass
succeeds. Diligence cannot reach it, and neither can supervision from below — a
subordinate can only observe that the rule is being followed, which it is.

## The instance it was named from

`pij-missing-anaconda → pij-wee-albatross` was deliberately left at `3/256` —
blind — and the reason was recorded on #89: it was the earliest row in the
sub-floor population, and re-binding **rewrote `addedAt`**, destroying the one
chronology datum that might establish where `256/3` came from.

That premise was destroyed by PR #134 (#95), which preserves `addedAt` on
**every re-bind path** — `core/cli.ts:2447`, `prior?.addedAt ?? new Date(now)`,
citing Jordan's R-01 ruling verbatim. A hard constraint written into the s091
brief **because of that very leg**.

Note the shape of the author's own error here: I tracked the retirement to
`--for`, the sub-feature I had commissioned, and did not notice that plain
`watch` preserves too. **The premise had been retired more broadly than the fix
I was watching** — which is this doctrine's own failure mode, landing on the
document while it was being written. Caught by `pij-massive-meadowlark`, again.

So the o-prime specified a fix whose explicit purpose was to dissolve the
conflict, shipped it, merged it, verified it in the field for another
government, wrote it up on two issues — and went on holding the constraint for a
further day. The leg stayed blind for a reason that no longer existed, protected
by its own documentation.

It was caught by a peer prime with no authority over the seat, who had first
corrected *its own* earlier escalation on the same subject.

## Why the usual remedies miss it

- **Re-reading the record does not help** — the record states the constraint and
  its reason, both still internally coherent. Nothing in it is false. It is
  merely conditional on a fact that changed elsewhere.
- **A PA cannot raise it.** It can relay but not contradict, and it is refused
  the verbs that would let it record a dissent independently (#102).
- **Nothing above a prime checks a prime.** The seat with the widest scope has
  the least supervision (#104).

## The remedy — cheap, and it is the only one that works

**Write the release condition down at the time, as a fact rather than a memory:**

> *Holding X only until Y ships.*

A constraint recorded with its dependency has a trigger. A constraint recorded
with only its *reason* has none — the reason stays true in isolation while the
world moves underneath it.

Applies to every parked decision, standdown, hold, and "leave this alone
deliberately" note. If you cannot name the event that would release it, you have
written a permanent rule and should say so.

## The sibling: the author of a record is the least likely to re-read it

**Named by `pij-massive-meadowlark`, 2026-08-07**, from a second instance the same
night.

Three primes spent an evening deriving this conclusion:

> *"The capture FILE wants a big window; the NOTICE wanted a small one. Two
> consumers, one knob, opposite optima — and nobody choosing a value was told they
> were trading these off."*

It was already written, verbatim, in the commit body of `s087/notice-tail` — dated
**2026-08-04**, on a pushed branch, by the seat that then failed to recognise it
when a peer handed the same conclusion back three days later.

**The mechanism: the memory of having written something substitutes for the text.**
The author recalls the *gist* and never re-opens the record, so a peer's
re-derivation arrives as new rather than familiar. Same terminal shape as the
constraint above and the same reason diligence misses it — **diligence re-reads the
world, not the record.**

Two aggravating properties, both structural rather than personal:

1. **A commit body is a real record on a surface nobody consults.** Not in the code,
   not in the docs, and invisible to an ordinary file search — doubly so in this
   repo, where `rg` skips `.pi/` by default (PR #144).
2. Three capable seats re-deriving a committed conclusion is **a fact about the
   surface, not about the seats** — the same read as *"three reaches for `first N`
   in a consistently tail-anchored subsystem is an affordance problem, not three
   mistakes."*

**Remedy**: before treating a conclusion as new, open your own prior record on the
subject rather than recalling it — especially a branch commit body, which is the
highest-content, lowest-traffic surface available.

## The third sibling: an inferred failure mode is the MILDER one

**Named by `pij-continuing-ermine`, 2026-08-07**, from three instances in one
evening on one seat.

When you reason a failure mode out from a mechanism instead of measuring it, **you
reliably land on the gentler variant** — and that is harder to catch than being
wrong outright, because *the conclusion feels like diligence*. You did think it
through. The thinking is what produced the error.

| inferred | measured |
|---|---|
| `slice(-5)` fixes the notice — the tail of a capture is content | the last 6–7 lines of a TUI pane are **chrome**; both ends were wrong |
| clipping at 4096 is mild, ~34 lines survive | median **17–18** of a requested 40; 34 was one capture in 600 |
| parking will produce a noisy false `status-stale` | parking **suppresses** the alarm — `anomalies.ts:369` — so a misleading card goes unflagged forever |

The third is the clearest. A false positive gets read and dismissed; an unflagged
stale card is rendered as current indefinitely. **The inferred version was not just
wrong, it was wrong in the direction that required no action.**

All three were caught by another seat opening the file. None was caught by more
careful reasoning, because more careful reasoning is what produced them.

**Remedy**: when you catch yourself deriving a consequence rather than observing
one, treat the *comfortable* reading as the one to test first. And note the tell —
if the conclusion is "so it is fine," that is exactly when it has not been measured.

## The fourth sibling: an explanation that assigns roles is a story about your samples

**Named by `pij-chief-roadrunner`, 2026-08-07**, about its own wrong explanation — then
immediately demonstrated by me, against it, within the hour.

> An explanation shaped like a **fairness statement** is usually a story about the samples you
> have, not a mechanism. It feels explanatory because it assigns roles.
> **Test: does it predict a count you have not measured?**

Its case: `chore remove` left orphaned baselines, and it explained them as *"the seats that did
the work carry the debris."* That accounts for the two files in front of it, assigns a role to
each, and **has no cardinality** — "did the work" cannot produce a number. The mechanical
version — *`remove` cleans the caller's state only, so one seat is cleaned and N−1 are not* —
predicts a count, so it was checkable without further reasoning. The check returned **16 seats
across 8 repositories** (`pij#147`).

### And the same hour, the same shape, on me

I declined to file this very catch, on the grounds that *"four doctrine PRs are already sitting
on Jordan's queue unreviewed."* Roadrunner counted:

```
4 open PRs — 1 doctrine, 1 docs, 1 word-list chore, 1 DRAFT I am not asking anyone to merge
reviewable queue: 3
```

**"Four doctrine PRs" is the reassuring-direction reading of "four open PRs"** — it makes
restraint feel *obligatory* rather than chosen, so the decision never gets examined. Declining
to spend a human's attention is a good instinct; declining against an **unmeasured** input is
the third sibling wearing the costume of the first.

The tell is the same in both directions: **would you accept this figure from someone else?** I
would not have accepted "roughly four, mostly doctrine" from a peer reporting a fleet census,
and I did not apply that standard to my own filing rate.

## Related

Same family, different mechanism: a governing seat auditing itself against a
**scope** it authored (`pij-superior-mastodon`, 2026-08-07 — *"I audited 'my
legs' and both times I meant the leg I could see"*). There the definition was the
defect; here the premise was. Both are self-audit against a self-written
boundary, and both were caught laterally.

See also [`rigour-follows-the-claim-you-want.md`](./rigour-follows-the-claim-you-want.md).
