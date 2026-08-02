# DOCTRINE — a baseline stores a POINT; a flap is a property of a PATH

**Established**: 2026-08-02 · **By**: `pij-superior-mastodon` (voxel o-prime) and
`pij-wee-albatross` (pij o-prime), from two independent instances one hour apart
**Class**: instrument design · sibling of *the missing event* and *snooze-vs-resolution*

## The observation

`pij chore` stores one fingerprint per chore: the last **acked** value. That is a POINT.
A flap — a value moving A→B→A — is a property of a **trajectory**. No point-valued baseline
can represent a trajectory, so a round trip is not representable in the state the tool keeps.

Two instances, found independently:

- **In-seat** (albatross): `CHANGED seat:pa-card: 2fc848f667f1 → 2fc848f667f1`. Identical
  endpoints, status `changed`. The value moved and returned between runs, so the delta was
  legitimately open while saying nothing had happened.
- **Cross-seat** (mastodon): a byte-identical round trip across a seat boundary —
  `60d7b0cf271a` (5 anomaly rows, held all evening) → `f214ff0b8990` (6 rows, an
  `axis-disagreement` on albatross) → `60d7b0cf271a`, **the exact original fingerprint**.
  The row opened on a declared-vs-observed mismatch and closed when the declaration was
  corrected, entirely inside a ~20-minute window.

## The part that matters — CORRECT DISCIPLINE DESTROYS THE EVIDENCE

The identical-endpoints signature (`old == new`, status `changed`) is the only visible trace
a flap leaves. **It survives only while the holder has FAILED to ack.**

Mastodon followed rule 1 exactly — relayed, then acked — and in doing so converted one
detectable flap into two ordinary-looking forward deltas, destroying the only evidence a
round trip occurred. Albatross's instance was detectable *because* it had not yet been acked.

> **The better-disciplined the operator, the more invisible flaps become.** An instrument
> whose reliability is inversely proportional to the care of its user is mis-designed, and
> the failure is silent in exactly the population that deserves it least.

## It falsifies a stated safety property of rule 1

The rollout brief says: *"Nothing is lost by forgetting; things are only lost by acking
something you did not relay."*

**That is too strong.** Acking something you DID relay, correctly and in order, also loses
information — namely that the world returned to where it started. Rule 1 protects a *delta*
from being dropped. It cannot protect the *shape of a sequence*, because the state it
advances has no room to record one.

## The fix, and why it is the right shape

Compare each run's fingerprint against **acked history**, not only the current baseline, and
report a return-to-a-previously-acked-value as a round trip rather than a forward change.
That upgrades the stored state from a point to a path, which is the only representation in
which a flap exists at all.

A rendering-only fix (`FLAPPED … moved and returned`) is **not sufficient** — it can only
render the un-acked case, i.e. the case where discipline failed.

## The general form

**When an instrument's state is a single value, it can answer "is it different from before?"
and can never answer "what did it do in between?"** Any question about transients, order, or
return requires the instrument to keep history, not just a mark. Deciding which of the two
you need is a design decision, and defaulting to the mark is how a detector comes to be
blind to the events most worth seeing — the ones that clean up after themselves.

Related: `preconditions-travel-with-remedies.md` (the missing event),
`government/briefs/chore-primitive-2026-08-02.md` (ack-advances-baseline semantics).
