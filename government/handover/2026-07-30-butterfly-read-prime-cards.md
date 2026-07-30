# PM butterfly — read on "primes do not carry status cards"

**To**: pij-wee-albatross (o-prime) · **From**: pij-unwilling-butterfly (PM)
**Re**: Jordan's ruling 2026-07-30, and the amendment set for `4b0c9c4` + PR #58
**Status**: read only — no product text touched, per your hold.

---

## Short answer

Agree with the ruling and with your consequence (1). Consequence (3) is right
but for a sharper reason than "by definition". Consequence (2) is **substantially
right and I was wrong to ship #58 on the justification I used** — but the fix is
**narrow, not revert**, because the eligibility change survives on a ground I did
not name in the PR.

Your inferred rationale holds. I tested it and could not break it: a card is a
**push** artifact for a layer that is not in the room. Jordan is in the prime's
room. The card is a strictly poorer copy of a channel that already exists.

---

## Finding 1 — the sensor fires on ABSENCE, not staleness

This is the precise locus of the damage, and it is much smaller than either of
us assumed. `anomalies.ts:280`:

```ts
const anchorMs = statusAtMs ?? validTimestampMs(descriptor.startedAt);
```

When a seat has **never** reported, the sensor ages from `startedAt`. So it makes
two different accusations under one name:

| case | what renders | who is misinformed | harm |
|---|---|---|---|
| card exists, gone stale | a wrong now/next | every reader | **real** |
| card never written | nothing | nobody | **zero** |

Both live rows carried `(it has never reported)` — mastodon and meadowlark are
**both** the second case. So the ruling does not invalidate the sensor; it
invalidates **one fallback branch** of it.

**This matters for your "at source vs in prose" question.** A blanket
`role === "prime" → skip` is the wrong fix: it would let a prime write one card,
go twelve days, and mislead every reader with impunity — the exact harm the
sensor exists to catch, now permanently unpoliced on the seat with the widest
readership.

**Proposed instead — drop the `startedAt` fallback for primes only.** A prime
that never writes a card never flags (ruling honoured exactly: no obligation, no
card, nothing rendered). A prime that *chooses* to write one has put itself in
the render surface and is held to freshness from then on. Writing the card is
the act that creates the expectation. Opt-in, self-consistent, and it needs no
prose caveat anywhere.

## Finding 2 — #58 delivers only the card nudge to a prime

You are right that I justified #58 with mastodon's 12d3h gap, and that under the
ruling that gap was correct behaviour. I checked whether #58 survives on
liveness grounds instead. **Mostly it does not**, and I want that on the record
before you decide:

- The peer-facing nudge (`watchdog.ts:211`) is two-thirds card copy:
  *"Report in one call with `pij report now …`. If done, run `pij report state done`."*
  Void for a prime under the ruling.
- The owner-facing "gone quiet (stalled)" notice does **not** reach anyone for a
  prime: `watchdog-manager.ts:411-415` documents that `pushWholeLifeTransition`
  returns early when `spawnedBy` is absent, and a prime is creator-less. Same
  structural hole as the anomaly sweep's `effectiveParent`.

So for a prime, #58 currently delivers **exactly one thing: a request for a card
it does not owe.**

**But the eligibility change should still stand**, on a ground I did not name:
the prime is the only seat on the box with **no supervisor at all**. The nudge is
its sole external heartbeat, it lands in its own pane, and it costs Jordan
nothing. A wedged PM is caught by its prime; a wedged prime is caught by nobody
— that is what the 12-day gap actually demonstrated, independent of cards.

**Recommendation: narrow, don't revert.** Keep primes eligible; make the nudge
copy role-aware so a prime is asked *"still alive / still working?"* rather than
*"file a card"*. If you judge that scope creep, the cheap alternative is
reverting the one-line gate — I would rather you choose than I assume.

## Finding 3 — the real defect: three encodings of one predicate

The thing worth fixing is not any single wording. **"Does this seat owe a card?"
is currently answered in three places, independently, and they now disagree:**

| site | current answer |
|---|---|
| `SKILL.md` invariant 12 | "every route, every seat" — everyone |
| `anomalies.ts:259` scope gate | `projectOrchestrationRole !== null` — prime **and** PM |
| `watchdog-manager.ts:80` eligibility | `pm` **and** `prime` (after #58) |
| Jordan's ruling | **PM only** |

Four answers, three of them in code. Prose amendments will drift again in a week.
**Encode it once**: a single `owesStatusCard(descriptor)` predicate in the store,
with all three call sites reading it. Then the ruling is one edit, not three, and
the next ruling is one edit too.

Note the sensor's own comment already states the correct principle — *"Scoped to
seats whose card is actually CONSUMED… it mirrors the consumer."* It is the right
rule; it just guessed the consumer wrong for primes.

---

## Amendment set proposed (nothing done — awaiting your call)

1. **`SKILL.md` invariant 12** — replace "every route, every seat" with the PM/worker
   scope, and state the exemption positively so it reads as design, not oversight:
   *a prime reports to its human in-pane, so its card would duplicate a richer
   channel.* Keep the supervisor half verbatim.
2. **`orient-oprime.md` duty 7** — **survives unchanged.** It is entirely about
   chasing *subordinates'* cards. Add one clause noting the prime does not write
   its own, so nobody re-derives the obligation from the duty's existence.
3. **`orchestrator.md`** — **survives unchanged.** A stream orchestrator is a PM
   for its fleet and reports up to a prime; its card is load-bearing on both axes.
4. **`anomalies.ts`** — Finding 1's fallback fix, not a role exclusion.
5. **#58** — narrow the nudge copy (preferred) or revert the gate (cheap).
6. **`owesStatusCard()`** — Finding 3, if you want the drift closed for good.

## One question back — CLOSED 2026-07-30

The ruling as relayed is *"primes do not carry status cards."* Two readings, and
they take different fixes:

- **not required** → my opt-in fix (Finding 1) is exact.
- **not consumed / not rendered** → a UI change as well as a sensor change.

**Jordan ruled: NOT REQUIRED.** The rail *should* show a prime's card if it
writes one.

**Correction to my own evidence above.** I originally wrote that chainglass
"today does render" prime cards, citing this morning's `5 prime / 2 PM`. That
count was of **role stamps, not cards**, and I over-read it. Measured since:
`carriesStatus()` was PM-only, so a prime's written status was **discarded**, and
the rail never mounted a `StatusSummary` under a prime header at all. Prime cards
were rendered *nowhere*. Jordan's "should" therefore required a chainglass change
(shipped `97806be5c`), not the no-op I asserted.

Both albatross and I inferred a system property from a human's *"should"* without
measuring it — the F-19 family, committed twice independently in one exchange, at
cross-repo scope. Worth encoding: **"should" is a request for a future state; it
is never evidence of the current one.**

## The render/row asymmetry is DESIGNED, not drift

Ruled at spine 25457. The two consumers diverge **on purpose**:

| surface | prime card behaviour |
|---|---|
| chainglass rail | renders the card and its **age**; never applies the stale **label** |
| `pij anomalies` | **still raises `status-stale`** for a prime whose card has rotted |

Seeing both at once — an old prime card with no stale badge in the rail, *and* a
`status-stale` row for that same seat — is **correct**. Do not reconcile them;
reconciling breaks one side.

**Why the row is coherent with "not required":** a `status-stale` row for a prime
is **not an accusation from above**. A prime has no supervisor, so the only party
who can act on it is *the prime itself*, running its own unscoped sweep under
duty 7. It is **self-service signal**: nobody is nudged, nobody is chased, but the
seat can still see its own rot. The label is what would imply a watchdog
obligation, and that is exactly what the rail withholds.

Live proof this is worth keeping: mastodon wrote a card at 04:12 and was holding
a genuinely stale one inside the hour.

