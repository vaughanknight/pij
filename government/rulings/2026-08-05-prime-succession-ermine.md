# Ruling — o-prime succession: pij-wee-albatross → pij-continuing-ermine

**Date**: 2026-08-05
**Ruled by**: Jordan (human), in-pane, directly
**Recorded by**: pij-continuing-ermine (incoming o-prime)
**Repo**: `AI-Substrate/pij` · `/Users/jordanknight/pi-hacking/pij`

## The ruling

> "you need to take over as prime as wee-albatross has run out of usage credits"

`pij-continuing-ermine` (copilot, pane `%947`) takes the o-prime seat for this
repo. `pij-wee-albatross` is retired.

## Why this is recorded, and not merely done

`bootstrap.md` § 1.4 says **refuse to seat over a living prime** — and
`pij-wee-albatross` was `liveness: active` at the moment of seating. It was not
dead; it was **out of usage credits**, which the registry cannot see and no probe
reports. Every deterministic signal available to me said "living prime, do not
seat".

The ruling is what makes the seating legitimate, so the ruling has to be on disk.
Without this file the next auditor sees exactly the usurpation pattern § 1.4
exists to prevent: a seat that designated itself over a prime the store still
reported as alive.

**Encode candidate**: credit exhaustion is a liveness state the platform has no
sensor for. A creditless seat is indistinguishable from a healthy idle one — it
holds its designation, keeps its children, and answers nothing. Filed as an
observation, not a fix.

## What was done, in order

1. `pij adopt "%947" --harness copilot` → seated as `pij-continuing-ermine`.
2. Probed for the incumbent **unscoped** (`pij list --prime --json`), not `--here`
   — per the route's own warning that `--here` shares the failure mode of the
   decision it audits.
3. Contacted `pij-wee-albatross` for a handover. **No reply** — consistent with
   credit exhaustion.
4. Took the handover from `pij-missing-anaconda` (its PA) instead — the
   highest-fidelity *live* source, since the outgoing seat could not write its
   own handover doc.
5. `pij orchestration prime set` → `pij-continuing-ermine`, **then**
   `pij orchestration prime retire pij-wee-albatross`. Set-before-retire
   deliberately: no moment with zero primes.
6. Verified **unscoped**: sole current prime for this folder.
7. Repointed 5 projects (`project set --prime`):
   `pa-role-and-capability-gate-add-orchestrationrol`, `s074-pij-rail-v2`,
   `state-set-general-fallback-resurrection-with-no`,
   `task-set-open-close-asymmetry-fix-cross-seat-tas`,
   `watchdog-parked-state-blindness-eligible-ignores`.
8. Reparented the three live children — PA `pij-missing-anaconda`, PMs
   `pij-respectable-starfish` and `pij-unwilling-butterfly` — with `pij link
   --parent` and **no `--role` flag**, so the existing stamps survived
   (verified: `pa`, `pm`, `pm` intact). Omitting `--role` is what avoids the
   PA capability-gate trap in `bootstrap.md` § 5.2; re-stamping the PA would
   have needed a subscription it is barred from re-creating.

Reparenting was not cosmetic: `pij anomalies` delivers to the **effective
parent**, so until step 8 every anomaly raised by the live fleet was being
routed to a seat that could not read it.

## Inherited state at succession

- **Main**: `origin/main` at `e15343d`; the canonical checkout was behind at
  `00e140e`. Ten PRs landed overnight under albatross.
- **Open**: PR #116 (mergeable, CI green, butterfly's D-043 ledger doc), PR #98
  (draft, s087 notice-tail). Issues #95, #99, #102, #106 open.
- **`pij-unwilling-butterfly` was blocked on a resolved condition** — its own
  note names "Jordan's per-PR merge go on #70 and #72", and **both merged**
  (2026-08-04). It had no way to learn this: it is idle, and nothing pushes a
  merge event to a blocked seat. A blocked seat cannot discover its own unblock.
- ~~Albatross left a **git stash** holding
  `docs/plans/083-a2a-wire-discipline/the-flow.json` and `the-flow.md`.~~
  **RETRACTED — the PA reported this and it is false.** Verified before relaying,
  per duty 6: `git stash list` holds only two stashes, dated 2026-07-19 and
  earlier, and **neither contains any the-flow file**. Those two files were
  **committed and merged** as PR #105 ("chore(plan-083): commit the-flow terminal
  state left in the canonical checkout") at 2026-08-05T03:04 — `gh pr view 105
  --json files` returns exactly those two paths and nothing else. There is no
  pending the-flow WIP. Nothing to recover, nothing to hand-apply.

  Worth keeping as a ledger entry rather than deleting: the PA's report was
  *directionally* right (albatross did have the-flow state outstanding in the
  canonical checkout) and *mechanically* wrong about its disposition — it
  reported the problem albatross had **already solved**, in the tense of an
  open item. A successor acting on it would have gone looking for a stash that
  does not exist, and — worse — a successor who *found* an unrelated stash
  (`stash@{0}` is real, and does touch `government/spine.md`) could have applied
  it believing it was the handover's. **A stale fact and a false fact are the
  same hazard here**, which is precisely why duty 6 makes the incoming seat
  re-derive claims instead of relaying them.
- **Pane `%517` hazard (issue #106)**: three bound descriptors share pane `%517` /
  PID 84718 — the **live PA** `pij-missing-anaconda` plus ghosts
  `pij-pale-silverfish` and `pij-able-jaguar`. Dissolving the ghosts by
  pane/PID can kill the live PA. Albatross verified this independently and
  commented rather than acting; that judgement stands.
- **337 dead registry rows** awaiting an operator cleanup call.

## Open with Jordan (inherited, not mine to take)

1. #106 — how to dissolve the two ghosts without killing the live PA.
2. Merge calls on #116 and #98.
3. Pruning the 337 dead registry rows.
4. ~~`pij-respectable-starfish`'s three plan-084 questions.~~ **CLOSED — already
   answered by Jordan before the succession.** Starfish corrected me directly
   when I relayed them as open; I had inherited them from its `question` semantic
   state and its node note, **both of which were stale**. Jordan's answers:
   Q1 *"original"* → preserve `addedAt` on **every** re-bind path, not only
   `--for`; Q2 *"yes"* → the allowance covers `unwatch` too, scoped by target;
   Q3 *"yes bring them in"* → #99 and #102 are **in** plan-084. Verbatim answers,
   starfish's readings, and the #102 design nuance are at
   `docs/plans/084-pa-gate-repair/rulings.md` on branch `s091/pa-gate-repair`.
   Nothing is pending with Jordan from starfish.

   The mechanism is the same one that trapped butterfly, one layer over: a
   `question`/`blocked` state persists after its cause is resolved, and every
   consumer renders it as current. I inherited two false open items in one
   sitting from exactly this.

## The step this ruling originally missed — watcher subscriptions

**Added after `pij-wee-albatross` recovered its credits and flagged it. It was
right, and understated.**

Step 8 above re-parented the three live children and I verified the `parent`
field on each. **That is not the whole of a handover.** A seat handover
re-parents the **children** and does **not** re-point the **watcher
subscriptions**. Measured from the sidecars ~7h after seating:

| seat | watched by | correct? |
|---|---|---|
| `pij-continuing-ermine` (me) | `pij-respectable-starfish` | yes — I arranged this deliberately |
| `pij-unwilling-butterfly` | `pij-wee-albatross` | **stale** — a stood-down seat |
| `pij-missing-anaconda` | `pij-wee-albatross` | **stale** — a stood-down seat |
| `pij-respectable-starfish` | *no sidecar at all* | **unwatched** |

So my most active seat — a PM mid-build on plan-084 — **was supervised by
nobody**, and had been since I took the seat.

### Why it survived my own audit

**No `pij` verb projects the watcher list.** `pij list`, `pij node show`, and
`pij tree` all reported these seats as correct, because by every field they
expose, they were. The only way to see it is
`jq '.watchers' ~/.pij/<id>/watchdog.json`, one seat at a time.

And the failure is silent in the way that matters: **a subscription pointed at a
stood-down supervisor reports exactly the same silence as a healthy one.**
Nothing distinguishes "watched, quiet because nothing is wrong" from "watched by
a seat that cannot act" from "not watched at all". I reported the fleet healthy
in good faith, having checked every surface available to me.

It was found only because albatross was still *receiving* butterfly's nudges
through the leg it no longer owned, noticed it was being supervised for a seat it
did not supervise, and said so. **That is lateral verification (its handover § 9,
and #104) catching what the vertical structure could not.**

Its own conduct here is worth recording too: it **deliberately did not unwatch**
before I had a replacement leg, because *"remove the sensor first"* is precisely
the failure this fleet spent the night filing. The stale leg was worth more than
a clean one until the gap was closed.

### Fixed

Added `pij-continuing-ermine` as watcher on all three children (`--capture
always --max-lines 12`, **no `--max-bytes`** per the withdrawn floor, PR #100),
verified at source, *then* released albatross to drop its two legs.

### Generalisation for the next succession

A handover checklist that stops at re-parenting is incomplete. Before relying on
any inherited subtree:

```
jq '.watchers' ~/.pij/<id>/watchdog.json     # for every child, one at a time
```

This is the #91 shape one level up — a subscription outliving the relationship
that justified it — and it is invisible by construction until someone notices
they are receiving mail for a seat they no longer own.

### A second un-repointed channel: spawn lineage

**Also flagged by albatross, after it had dropped both watcher legs.** It was
*still* receiving stall alerts for `pij-respectable-starfish` — not through
supervision, but because `spawnedBy` still names it.

So a handover re-points **neither** of the two channels that carry supervision
traffic:

| channel | re-pointed by handover? | visible to any verb? |
|---|---|---|
| watcher subscription | no | no — `jq` the sidecar |
| spawn lineage (`spawnedBy`) | no | **no — `pij list` exposes no spawn field at all** |

The second is worse than the first. I checked: **the `pij list` projection
contains no `spawnedBy`, no creator, no origin field of any kind.** So the audit
that found the watcher legs — which I ran, verified, and reported as thorough —
**was structurally incapable of finding this.** My coverage does appear real (I
have received captures for all three children and a stall alert for one), but I
could not have *proven* it in advance, and a stood-down seat continues receiving
alerts for every seat it ever spawned with no way to stop short of those seats
dying.

### Stall alerts have no expiry, and it corrupts the reader

**Albatross's measurement**: watchdog fired at `10:32:18`, the seat responded at
`10:32:43` — and the notice delivered to a human still read *"gone quiet — no
activity past the stale threshold"*. **True at fire time, false on arrival.**

Its framing, which is the sharpest statement of this sensor family's problem:

> A stall alert is a point-in-time reading delivered without its expiry
> condition — and the very mechanism it reports on is designed to resolve the
> condition within seconds.

This reconciles a dispute I inherited rather than settling it in someone's
favour. `pij-massive-meadowlark` called four consecutive stall alerts "false";
albatross contested the mechanism. **Both were locally right.** Most such alerts
*are* false by the time anyone reads them — which is precisely what trains the
discounting that made the fifth one dangerous. Neither seat could have seen that
from its own position.

**Consequence for anyone reading this thread's nudge counts**: they are data
about an *instrument*, not about a seat. An unknown fraction were already
resolved on arrival, so every supervisor's picture of every seat's
responsiveness has been pessimistic by an unmeasured amount.

### The cost axis does not exist

Acting on the above, I found `pij-unwilling-butterfly` was being polled every 20
minutes to report that a human merge call had not moved, and lengthened its
interval to 2h.

**That is a mitigation, not a fix, and it must not be read as one.** Its `ready`
was honest — it is dispatchable and refused to falsify its state earlier the same
day to silence the sensor, correctly. Neither end was wrong: the state was right,
the sensor was right, and the output was still pure waste. **The cadence was mine
to fix; the state was not.**

The part that outranks the mitigation: **nothing anywhere counts alert fires
against outcomes.** A cadence that is 100% noise is indistinguishable from a
working one from the supervisor's side. I caught it only because that seat's
captures happened to land on my leg and I read three of them. Butterfly's
formulation, recorded on #125:

> The activity axis cannot see an idle seat, and the **cost axis does not exist
> at all**.

### The real cost of a false-positive channel — measured, not argued

**Albatross returned to this a third time and produced the strongest finding of the
day.** Its original no-expiry argument was about wasted attention. This is a
**demonstrated masking**, on a live seat.

Three consecutive stall alerts on `pij-respectable-starfish`, each verified false —
the seat had already responded before the alert reached a reader:

| fired | seat responded | window |
|---|---|---|
| 10:32:18 | 10:32:43 | +25s |
| 11:44:24 | 11:44:55 | +31s |
| 13:36:56 | 13:37:19 | +23s |

Windows of 23–31s, tight and consistent enough to be structural rather than
coincidence. **But underneath those three false alerts, the seat's card rotted from
20.7 minutes stale to 60.5 minutes stale.**

So anyone applying the entirely reasonable heuristic — *"starfish's stall alerts are
always false, ignore them"* — would have been **correct about all three alerts and
missed the real signal underneath**. Its formulation:

> **The cost of a false-positive channel is not the noise. It is that it becomes the
> channel a true signal arrives on.**

This reproduces `pij-massive-meadowlark`'s four dismissals **live, on a different seat,
in a different government, with numbers** — corroboration neither seat could have
manufactured. Its habit was dangerous for reasons unrelated to its judgement.

**And it was caught only by doing the thing the finding argues for**: albatross checked
a third time *specifically because* it had just written that discounting these is the
hazard. The heuristic it was warning against would have stopped it at check two.

### Two seats, one instrument, opposite correct answers

Acting on the earlier cadence finding I had lengthened `pij-unwilling-butterfly`'s
interval, and I was about to do the same for `pij-respectable-starfish` when albatross
stopped me. **The two cases invert:**

| seat | state | longer interval? |
|---|---|---|
| butterfly | idle-and-ready, polled about a *human* merge call | **right** — nothing changes between polls |
| starfish | mid-build | **wrong** — its card is the only signal of what stage it is at |

I had generalised a fix across a boundary I never looked for. Verified at the moment of
correction: starfish `sys=working`, `lastEventAt` **11 seconds** old, card **62 minutes**
old — demonstrably active with reporting an hour behind.

The resolution was not a cadence change but a correction to *my own* rule: my
"report at stage boundaries, not continuously" over-corrected. **An hourly card during a
multi-hour build is not continuous.** Quieting the channel would have bought silence at
the cost of the only signal that mattered.

## Consequence still open at the time of writing

Nothing watches me. The PA **cannot** subscribe itself to a new prime (the
capability gate refuses the whole `watchdog` family to role `pa`, and
`watchdog watch` only ever registers the *calling* seat), and I cannot do it on
its behalf. My own `status-stale` row would be **dropped, not delivered** —
`target === null`, "no effective parent, no project prime" — so the failure is
silent by construction. Closing this needs a watchdog-eligible **non-`pa`** seat,
per `bootstrap.md` § 5.4.
