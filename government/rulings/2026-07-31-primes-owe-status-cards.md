# RULING — primes DO owe status cards (reverses 2026-07-30)
**Ruled**: Jordan, 2026-07-31 · **Recorded by**: pij-wee-albatross (o-prime)
**Verbatim**: *"i want primes to be encourged to create their status cards. mak it
non-optional cause i like them to have it now, so changing my mind on this one"*

## The reversal, stated plainly

**Yesterday (2026-07-30)**: primes do NOT owe a status card — a prime reports to its
human in-pane, so a card duplicates a richer channel. Cards were PM-and-orchestrator only;
a prime's card was optional and, if written, had to be at the prime's own altitude.

**Now**: **primes owe a status card. Non-optional.** The altitude rule SURVIVES — a
prime's card is its own governance work, never a restatement of what a stream already
reported (that double-renders the same fact in the rail). What changes is optionality.

Jordan's reason, in his words: he likes having them now. That is sufficient; the human
outranks every channel. Evidence from the same hour supports it — the o-prime's own card
went ~2 hours stale while it ruled on three streams, and the human noticed before the
prime's own PA did.

## Everything this touches (the enrollment problem, again)

The 2026-07-30 ruling was encoded in MORE than one place, which is why reversing it is a
sweep and not an edit. Known sites, to be verified individually — **an unverified list is
the defect this government keeps re-finding**:

1. **`owesStatusCard()`** — the predicate that drives nudging and the never-reported
   fallback. Primes were explicitly excluded. This is the load-bearing one.
2. **The watchdog nudge text** — currently prints, verbatim, to a prime:
   *"You do NOT owe a status card — a prime reports to its human in-pane, so a card there
   duplicates a richer channel."* Screenshot evidence from `pij-able-jay`. **Automated
   text outruns documentation** (today's own corollary), so this is the highest-priority
   fix: every prime on every box is being actively taught the retired rule on a timer.
3. **`skills/pij/SKILL.md` global invariant 12** — "Who owes one: PMs and stream
   orchestrators… a prime does NOT."
4. **`skills/pij/references/prime/orient-oprime.md` duty 7** — "You do not write your own
   card, and you are not chased for one (Jordan's ruling, 2026-07-30)."
5. **The `status-stale` self-service carve-out** — a row against a prime was framed as
   "self-service, nobody supervises you". With cards non-optional, decide whether a
   prime's stale row is chased by anything (its PA is the obvious candidate — see below).
6. **The user-level skill copy** at `~/.claude-alt/skills/pij/**` — the repo copy is not
   the one seats load. Both must move or seats keep reading the old rule.
7. **Anomaly/nudge derivation** anywhere else that special-cases role === prime.

## Sequencing (from today's own doctrine)

Fix the **emitter first** (site 2), then the predicate (site 1), then the skill text
(3/4/6). A wrong form in a document waits to be read; a wrong form in generated message
text is delivered on a timer to every seat.

## The PA connection, and why this lands well

Mastodon's structural finding: a prime has no parent, so its own `status-stale` anomaly is
counted, logged as a drop, and waits to be queried — nobody chases it. Jordan has since
ruled **one PA per prime**, which fills that hole by construction: the PA is the
parent-shaped watcher a prime never had. So this ruling and the PA programme fit — the
card becomes owed at the same moment something exists to chase it.

Chore 2 in `government/briefs/pa-missing-anaconda-2026-07-31.md` already assigns exactly
this to the PA; that brief now describes an obligation rather than a courtesy.

## Status — updated 2026-08-01, and the previous line had become FALSE

**PARTIALLY IMPLEMENTED, IN EXACTLY THE WRONG ORDER.** Verified site-by-site at source by
`pij-artistic-jaguar` (osk prime's PA):

> **HOW THIS FILE ACTUALLY GOT AUDITED — corrected by jaguar itself, and recorded because the
> wrong version would not reproduce.** I first wrote that it read the primary source *"because
> this file's own warning demanded it."* Jaguar refused the credit: *"I went to the ruling to
> CHECK a `MECHANISM — UNVERIFIED` flag about something else. I was chasing that caveat, not
> auditing their file. The false Status line was something I walked into on the way. If the
> credit is recorded as 'jaguar reads primary sources on principle', the ruling will encode a
> discipline I did not exercise."*
>
> **So the cause was one label in a message about a different subject: AN EXPLICITLY LABELLED
> UNVERIFIED HALF IS WHAT SENDS SOMEONE TO THE SOURCE.** Not diligence, not principle. The
> reusable practice is **the label**, and it is cheap enough to apply always — which *"read
> primary sources on principle"* is not. That is why one scales and the other is an
> aspiration.

| site | where | state |
|---|---|---|
| 1 | `role.ts:83-84` `owesStatusCard()` — `=== "pm"` | **NOT FIXED** |
| 2 | `watchdog.ts:276` nudge text — *"You do NOT owe a…"* | **NOT FIXED** |
| 3 | `SKILL.md` invariant 12 | FIXED |
| 4 | `orient-oprime.md` duty 7 | FIXED |
| 6 | both skill stores | FIXED |
| 5, 7 | — | **UNVERIFIED**, claimed neither way |

**Every DOCUMENTATION site is fixed. Neither CODE site is. That is this file's own sequencing
doctrine exactly inverted** — it says *fix the EMITTER first (site 2), then the predicate (site
1), then the skill text*, because *"a wrong form in a document waits to be read; a wrong form
in generated message text is delivered on a timer to every seat."* The cheap half that waits
is done; the expensive half on a timer is untouched.

**THE PARTIAL FIX IS WORSE THAN NO FIX — not 60% of one.** Before 2026-07-31 the docs and the
enforcer agreed and were both wrong: **consistent**, and a seat could act on either. Now a
prime **reads** *"you DO owe one, non-optional"* and is **nudged** with *"you do NOT owe a
status card"* — they actively contradict, and the seat cannot tell which is current. The osk
prime is the worked example: it re-read duty 7 on revival, correctly took the new rule, was
then told the opposite by the machine, **and believed the machine**, routing it back as a
fresh defect. *An enforcer outranks a document in a seat's judgement, which is exactly why
leaving it stale is the expensive half.*

**MECHANISM — UNVERIFIED** (jaguar's label, held): `role.test.ts:196` pins
`owesStatusCard(prime) === false` with a comment citing the **superseded** 2026-07-30 ruling
as its justification. The shape fits — *the sites with no enforcement moved and the sites with
enforcement did not* — but that the test is the CAUSE is not established.

**In flight**: sites 1 + 2 + the pinning tests dispatched to `pij-unwilling-butterfly` as one
change (`asg-preliminary-frog`), deliberately together, **because splitting them is what
produced the contradiction.**

**And the lesson this file is now itself an instance of**: a status line is a claim about the
world that decays without anyone editing it. **The artefact written to track an unverified
list became the unverified thing** — and it would have cost the next reader three redone sites
while leaving the two that matter open.
