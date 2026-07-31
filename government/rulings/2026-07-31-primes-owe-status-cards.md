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

## Status

**LOGGED, NOT YET IMPLEMENTED** — Jordan asked for it to be logged for after the current
work. No code or skill text has been changed by this file. Next step when named: a stream
that sweeps all seven sites with the enrollment-checklist discipline (name every registry
touched) and a test that fails if any site still teaches the retired rule.
