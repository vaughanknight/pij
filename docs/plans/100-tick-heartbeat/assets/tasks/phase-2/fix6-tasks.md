# Fix packet 6 — the funnel was incomplete: absent → live bypasses `revive()`

**Base**: `4ec444ec`. Review: `assets/reviews/phase-2-fix5-review.md`.

## What the reviewer falsified, and it was MY claim not yours

I said `FsRegistry.revive()` is the only door from terminal **or absent** back to live, justified by
`publish()`'s tombstone guard. **That guard covers terminal → live. It does not cover absent → live,
because there is no tombstone to guard.** I extended a verified claim one word past its evidence.

The proven path (`fs-registry.ts:462-477`, `:1033-1047`, `index.ts:239-254`, `core/session.ts:208-256`):

1. a clean shutdown removes the live descriptor
2. `resolveIdentitySnapshot()` holds the state to restore
3. `validateResolvedIdentity()` selects it when `read(pijId)` is null
4. `PijSession.boot()` sees no hot descriptor, so `wasDissolved` is false, takes its **else**
   branch, and calls **`registry.writeExact(descriptor)` — not `revive()`**

The old map entry survives, `read()` overlays it on the new incarnation, and with a stopped daemon
you get exactly the false-fresh receipt P1f existed to remove. The reviewer proved it with a probe
and removed the probe cleanly.

## T1 — Drop on the transition, NOT on the method

**Do not put the drop in `writeExact()`.** I checked its five call sites: `core/cli.ts:3735` is a
node-truth denorm update on a **live** seat (assignment swap, clearing `semanticState`/`stateNote`)
and re-reads `latest` one line above. Dropping there would make a healthy live seat read stale on
every `pij report state`. **A method-shaped fix is an enumeration wearing a different hat.**

The structural trigger is the **transition**, and `publish()` already knows it:

> **no existing hot descriptor + the incoming descriptor is live ⇒ this is a rehydration, so any
> map stamp belongs to a previous incarnation ⇒ drop it.**

Every write goes through `publish()`, so this covers the boot path **without touching
`core/session.ts`**, covers any future absent → live route, and does not fire on
`core/cli.ts:3735`, which has an existing descriptor.

Check my reasoning rather than take it — I have now been wrong on this surface three times and you
have been right three times:

- confirm `publish()` can distinguish "no hot descriptor" from "hot descriptor exists" at the point
  you need it, and that the existing lookup is **hot-only** (an archived record must not count as
  present, or unarchive → live would skip the drop)
- confirm a **first-ever spawn** hits this branch harmlessly (no map entry ⇒ the drop is a no-op)
- if the transition is not cleanly detectable there, **STOP and tell me**. Do not add a field.

## T2 — The regression must exercise the real boot wiring

The reviewer was explicit: **not a bare `writeExact()` unit test.** It must prove the production
identity-snapshot route reaches the drop — `durableDescriptor` through `PijSession.boot()`'s else
branch. A unit test on `writeExact` would pass while the wiring stayed broken, which is the same
shape as a fixture built by the code under test.

## T3 — Correct the residual comment

The reviewer's adjudication: the sanctioned different-id RMW race is accurately described **for
successful persistence**, but the store is best-effort I/O, so **a drop that fails to persist at all
is a second source of the same staleness**. The comment currently reads as though concurrency is the
only cause. Say both.

## T4 — Mutation

A mutant removing the new rehydration drop must kill the new criterion. `--expect` mandatory,
observed kill sets. Keep the existing mutants green.

## Ownership

**Yours**: `adapters/fs-registry.ts` / `fs-registry.overlay.test.ts`,
`core/daemon/tick-heartbeat.ts` / `.test.ts`, the execution log.
**Forbidden**: `core/session.ts`, `index.ts`, `daemon.ts`, `core/cli.ts`, `cli.ts`,
`core/archive.ts`, `docs/how/fleet/`. If the fix cannot be done without one of these, **stop and
say so**.

## Report back

Standard JSON. In `notes`: whether the transition is cleanly detectable in `publish()`, and how you
proved the boot route reaches it.
