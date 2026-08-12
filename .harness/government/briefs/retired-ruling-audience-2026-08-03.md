# MEASURED — the retired card-ruling is overwhelmingly a **PA** problem, and PR #72 fixes the other 7%

**Filed**: 2026-08-03 · **By**: `pij-wee-albatross` (o-prime, pij) · **Status**: MEASURED, PR NOT FILED
**Trigger**: watchdog nudge #7 delivering Jordan's overturned ruling to the o-prime again.

## The measurement

Every seat inbox on the box scanned for watchdog deliveries containing the retired text
*"You do NOT owe a status card — a prime reports to its human in-pane…"*:

**323 deliveries, to 14 distinct seats.** Top 8 by volume, with roles:

| deliveries | role | seat |
|---|---|---|
| 105 | **pa** | `pij-major-gazelle` |
| 63 | **pa** | `pij-artistic-jaguar` |
| 41 | **pa** | `pij-missing-anaconda` |
| 33 | **pa** | `pij-endless-centipede` |
| 22 | **pa** | `pij-statutory-seahorse` |
| 18 | **pa** | `pij-disastrous-marlin` |
| 16 | prime | `pij-able-jay` |
| 7 | prime | `pij-wee-albatross` |

**282 to PAs · 23 to primes.** Every PA on the box is in the top six.

## Why this reprioritises

Two DIFFERENT defects wear the same sentence, and only one has a PR:

1. **The RULING half** — the text asserts primes owe no card, which Jordan reversed
   2026-07-31. **PR #72 fixes this** (`watchdog.ts:276`). It is correct and should merge.
2. **The AUDIENCE half** — `owesStatusCard()` returns false for a `pa`, so a PA falls into the
   card-less branch and receives **prose written for a prime**: *"a prime reports to its human
   in-pane."* A PA has no human in-pane. **#72 does not touch this**, and it is **92% of the
   delivered volume.**

So merging #72 is right and stops the fleet's *primes* being taught a retired rule — but it
addresses 23 of 305 identified deliveries. The dominant failure is a message that is not
merely outdated but **addressed to the wrong role**, arriving on a timer at the six cheapest,
most impressionable seats in the fleet — the exact population the PA survey found will believe
an enforcer over a document.

## Why it took a count to see

The defect was visible in prose from the first nudge and was filed as *"the nudge copy has the
wrong AUDIENCE"* (`pa-lastEventAt-frozen-2026-08-01.md`) — a true observation that produced no
reprioritisation, because **its scale was invisible without counting.** Seven nudges at one
seat reads as an annoyance; 105 at one PA and 282 across six reads as the fleet's dominant
mis-instruction channel.

*Report the population, not the anecdote.* The same rule that governs probes governs
priorities: a defect's importance is a denominator question, and neither reasoning nor
irritation supplies one.

## Fix shape

Give the card-less branch **role-appropriate prose**, or gate the branch on role rather than
on `owesStatusCard` alone. Verify by driving it: send a nudge to a live PA and assert the text
does not mention a prime's human-in-pane channel.
