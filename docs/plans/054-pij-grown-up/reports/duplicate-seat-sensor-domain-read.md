# Domain read — duplicate-seat sensor in the s054 anomaly sweep

**Requested by**: pij-reasonable-dove (o-prime), spine Seq 471 · **From**:
pij-civilian-takin (s054 orchestrator) · **Date**: 2026-07-17
**Status**: ASSESSMENT ONLY — no work authorized, none done. Naming is Jordan's.

**Finding under assessment** (from s055's activation poll): 11 pane+pid
collisions across 1219 descriptors; one pane+pid claimed by four ids; a
watchdog turn for one id landed in another's pane — *delivery was faithful to
a lying descriptor*.

---

## Q1 — Does the anomalies architecture take this sensor cleanly?

**Mostly yes, with one real tension.** Three of four fits are free; the fourth
is a genuine design decision, not a detail.

**✅ Inputs already carry it.** `AnomalyInputs` (`core/anomalies.ts:41`) takes
`descriptors: readonly SessionDescriptor[]` — the whole set, not a slice. The
raw material for a cross-descriptor invariant is already in the contract. No
signature change.

**✅ The posture already matches.** The module's charter is "safety is DERIVED,
never enforced" and the daemon "NEVER acts". A duplicate-seat sensor wants
exactly that: surface it, route it, never auto-reap. Auto-repair here would be
actively dangerous — killing the "wrong" duplicate is a guess about which
descriptor is lying.

**⚠️ It is a new *shape*, not a new case.** Every existing anomaly hangs off an
assignment chain (`for (const assignment of inputs.assignments)`, `:117`);
descriptors are only a lookup (`byNode`, `:114`). A collision is
descriptor-driven and assignment-free — so it is a new top-level pass, not
another branch in the existing loop. Additive and clean, but it does widen what
"anomaly" means: from *this node's work is in a bad state* to *the registry's
model of the fleet is self-contradictory*. Worth a conscious ruling rather than
a silent stretch.

**⚠️ The shape is single-node; a collision is inherently ≥2 (observed: 4).**
`Anomaly.nodeId: string` + optional `assignmentId` (`:32-39`). Two options:
emit **one anomaly per colliding node**, each naming its partners in `detail`
(fits the existing shape, keeps per-node alert routing working — my
recommendation), or extend the shape with `relatedNodeIds` (truer, but a public
contract change to a just-shipped type). The first is strictly cheaper and
loses nothing a UI needs.

**🔴 The real tension — evidence.** The module's core promise is that *every*
anomaly carries `evidence: readonly number[]` of **spine seqs**, "so a prime or
UI can chain straight to the audit trail" (`:37`, and the header contract). A
pane+pid collision **has no spine event** — descriptors aren't spine-written;
V-05 only appends *mechanical transitions*. So this sensor either:
- emits `evidence: []` — cheap, but it quietly breaks the one invariant every
  consumer was told to rely on; or
- has the daemon **append a spine event on first observation** of a collision
  (`actor: daemon`, prev/next = the colliding id set), then cite that seq as
  evidence. This is *more* work but it is V-05-consistent (mechanical
  observation → attributed event → evidence), keeps the invariant whole, and
  gives the collision a durable history — which matters, because a collision
  that resolves and recurs is a different animal from one that never cleared.

**My recommendation**: the second. The evidence invariant is worth more than
the sensor is urgent, and breaking it once teaches every future sensor that
it's optional.

**⚠️ Latch semantics need a ruling too.** AC-07's alert latch is
once-per-**transition**. A collision is a **standing condition**. Latched
naively, it alerts once and then goes quiet while the condition persists — the
exact "silence is not proof" failure the watchdog exists to kill. The latch key
should be the collision *identity* (pane+pid+the id set), re-alerting when the
**set changes** (a third id joins), not on a timer.

## Q2 — Node-truth concern, or s051 identity concern?

**Both, and the split is clean along detect/prevent — which is why it isn't a
turf question.**

**Detection is node truth (s054).** s054 exists so a node's descriptor tells
the truth about itself — its pane, its window, its state. Two descriptors
claiming one pane+pid means **at least one is lying about its terminal
address**, and the proof is already on the table: a watchdog turn landed in the
wrong pane *because delivery was faithful to the lying descriptor*. That is
precisely the honest-vs-lying axis; the sweep is the right instrument and
"surface, never act" is the right posture. It also composes with what shipped:
`windowId`/`paneId` addressability (AC-09) is what makes the collision
*visible* and what a UI would use to show it.

**Prevention and repair are s051 identity.** The question *why do two ids share
a pane+pid* is an allocation/adoption/ownership question — dedup at write time,
who owns an id, what adoption may claim. That is identity-integrity territory,
the #19/#20 family, and s054 must not touch it (it is also the zone s054's diff
deliberately never entered).

**The useful asymmetry**: the sensor is a **measurement instrument for s051's
own work**. 11 collisions across 1219 descriptors is a baseline s051 can drive
to zero and *prove* it drove to zero — and s054's outcome contracts are already
s051's convergence gate (SW-7, inverted). So building the sensor in s054's
sweep hands s051 both its gate and its dashboard. That is a better sequencing
argument than either stream's ownership claim.

## Two things I'd name beyond the ask

1. **1219 descriptors is itself a signal.** Collisions are the acute finding;
   the chronic one is that the registry accumulates ~1219 descriptors with no
   evident reaping. Dedup treats the symptom of a registry that never forgets.
   Worth a separate look — probably s051's or an ops concern, not this sensor's.
2. **This validates the watchdog's thesis, precisely.** dove's own words: the
   collisions were "latent until something polled every session on a timer."
   The instrument that found them exists because supervision toil got captured
   as an observation and became a stream. The loop closed and immediately paid
   out — that is the compounding argument made concrete, and worth putting in
   front of Jordan when the naming decision is made.

## Recommendation

Sensor in s054's sweep (detection), root cause in s051 (prevention), evidence
via a daemon-appended `system-state`-class event so the audit-chain invariant
survives. New work — needs Jordan's naming. I have made no changes and hold no
authorization here.
