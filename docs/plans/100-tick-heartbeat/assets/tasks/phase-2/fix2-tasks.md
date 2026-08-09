# Fix packet 2 — dlg-0003-fix re-review, TWO P1s

**Review**: `docs/plans/100-tick-heartbeat/assets/reviews/phase-2-fix-review.md` — read in full.
**Base**: `817c2d87`. Both P1s are real; the first is worse than the reviewer knew.

## P1a is a REGRESSION I INTRODUCED — this is new information the reviewer did not have

The reviewer's interleaving:

1. map has `pij-a: S`; the daemon snapshots a still-live `pij-a` (`daemon.ts:299`)
2. another process dissolves `pij-a` and writes the marker for `S`
3. the tick publishes its **old** snapshot as `pij-a: T`
4. marker for `S` is inert (T ≠ S) ⇒ `read()` returns `T` — a live stamp for a dissolved seat

**Your disclosed justification for accepting this was wrong**, and that matters more than the race:

> "the tick rebuilds from the current owned set, so the write that outran the prune also performs it"

It does not. The tick's `ownedIds` was collected **before** the dissolve, so the write **re-adds**
`pij-a`. A disclosed risk carrying false reasoning is more dangerous than an undisclosed one,
because the disclosure discharges the attention that would have found it.

**And it is not pre-existing.** Verified at `426c4c9^`, `fs-registry.ts:204-211` — the old
per-descriptor write went through `publish()`, which held a **tombstone guard**:

```ts
const existing = this.read(descriptor.id);
if (existing?.lifecycle === "dissolved" && descriptor.lifecycle !== undefined
    && descriptor.lifecycle !== "dissolved") return;
```

A seat that dissolved mid-tick had its heartbeat write **dropped**. The side-file write has no
equivalent — it publishes the whole map blind. **We removed a guard we did not know was load-bearing
and did not replace it.**

### The fix shape available to you — an ORDERING, not a new identity

The reviewer says you need "an incarnation identity that both the tick snapshot and the lifecycle
operation carry". There may be a cheaper one already present: **`tickAt` is computed at
`daemon.ts:292`, BEFORE `registry.list()` at `:299`. So the map's `tickAt` IS the snapshot time,
not the publish time.**

So a marker that records **when it was written** can be compared temporally instead of by exact
stamp equality:

> suppress `id` when a marker for it has `forgetAt` **>** the map's `tickAt`

- bad interleaving: snapshot `T0`, marker at `T1 > T0`, publish `tickAt = T0` ⇒ `T1 > T0` ⇒
  **suppressed**. Correct.
- genuine reincarnation: a later tick has `tickAt = T2 > T1` ⇒ **not suppressed**. Correct.

**This is an option, not an instruction.** You have overridden me three times with measurements and
been right each time. If it is wrong, say why — and specifically check what it assumes about clock
behaviour, and what happens when `tickAt` and `forgetAt` are equal to millisecond resolution.
Whatever you choose must make the reviewer's exact interleaving **fail before the fix and pass
after**, with that interleaving expressed deterministically.

## P1b — the marker directory is shared mutable state, and the reviewer REPRODUCED it

`forget()` does `mkdirSync` then `writeFileSync` (`:360-365`); `write()` sweeps and `rmdir`s the
empty directory (`:305-335`). The daemon can remove the directory **between** a pruner's mkdir and
its marker write. Measured on Darwin: `{"markerWrite":"ENOENT","staleStampStillVisible":true}` —
and `forget()` swallows it, because it is best-effort.

So **"no shared mutable state" was false**: no two *prunes* share state, but every prune shares the
directory with the sweep.

`rmdirSync` refusing a non-empty directory atomically is confirmed and remains true — it just does
not make **parent lifetime** atomic with a concurrent child creation. Deleting the emptiness guard
was still correct; it was answering a different question.

Options: keep the parent stable (never remove it — an empty directory is cheap), or retry creation
until the marker is durably present. **Deterministic coverage of this interleaving is required
either way** — the reviewer produced it, so it can be produced in a test.

## What must be true when you are done

1. The reviewer's interleaving (snapshot → dissolve+marker → publish old snapshot) leaves **no**
   stale overlay, proved by a test that **fails on `817c2d87`**.
2. The mkdir/rmdir interleaving leaves the marker durably present, proved the same way.
3. **Retract or qualify the "race-free by construction" claim in the source comment.** It is true
   between prunes and false between a prune and the tick. A comment that overstates a safety
   property is worse than none — the next reader will not re-derive it.
4. Re-run the full mutant set with `--expect`; record OBSERVED kill sets.
5. `just typecheck`, `just lint`, targeted vitest.

## Ownership — unchanged

**Yours**: `core/daemon/tick-heartbeat.ts` / `.test.ts`, `adapters/fs-registry.ts` /
`fs-registry.overlay.test.ts`, the execution log.
**Forbidden**: `daemon.ts` (Phase 1, committed — if your fix genuinely requires a change there,
STOP and tell me; do not edit it), `core/cli.ts`, `cli.ts`, `core/archive.ts`, `docs/how/fleet/`.

## Report back

Standard JSON. In `notes`: the mechanism, why it closes BOTH interleavings, and what it assumes.
