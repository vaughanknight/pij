# Fix packet 3 — DELETE the marker protocol (ruled by o-prime)

**Base**: `848982d5`. **This packet is mostly a DELETION.** Resist the urge to preserve machinery.

## The ruling

Three review rounds, every P1 inside the marker protocol, none in the overlay, the scrub, or
Phase 1. **A mechanism that produces a P1 per review round is not unfinished, it is wrong.** The
deciding evidence: P1d is the original P1a returning *through the assumption written to justify the
fix for it* — a mechanism regenerating its own defect.

## The load-bearing fact, re-verified at source before deleting anything

```
fs-registry.ts:217-218   list():  if (descriptor && descriptor.lifecycle !== "dissolved")
                                      out.push(this.overlayTick(descriptor, stamps));
fs-registry.ts:232-235   read():  if (hot) return this.overlayTick(hot, this.ticks.read());
```

**`list()` already excludes dissolved BEFORE overlaying. `read()` does not gate at all.** That gap
is the entire job the marker protocol was doing.

## T1 — Gate the overlay in `read()`

Mirror `list()` exactly: **skip the overlay when `lifecycle === "dissolved"`**, and only that —
`list()` does not exclude `failed`, and the pre-change behaviour stamped `failed` seats too
(`publish()`'s tombstone guard blocked only `dissolved`). **Preserve that parity; do not tighten it
while you are here.**

The descriptor and the decision are read together, so there is nothing to race: no clock, no shared
state, no cross-process ordering.

## T2 — DELETE the marker protocol entirely

From `core/daemon/tick-heartbeat.ts`: the marker directory, `forgetAt`, the injected clock, the
sweep, `expiredForgetMarkers` / `inertForgetMarkers`, the horizon, the retry, `TICK_FORGET_DIR`, and
the `ASSUMES: one machine, one clock` block — **that assumption is the single thing this ruling most
wants gone.** From `fs-registry.ts`: `forgetTick` and its five call sites, and the `ticks` port
surface that only existed to serve them (keep what `read()`/`list()` need).

Delete the tests that covered deleted machinery. **Do not keep a test alive by pointing it at
something else** — a test that outlives its subject becomes a pin on whatever it lands on.

## T3 — Restate AC-13, and state the residual honestly

> **ANNOTATION, added 2026-08-08 — this packet is left verbatim as dispatched.**
> The bound stated below ("one tick", "~600ms") was **falsified in the next review round**: there is
> no guarantee of a subsequent tick, so with a stopped daemon the residual stands for the full 30s
> staleness grace. The corrected form is in `fix4-tasks.md` and in the plan. Annotated rather than
> edited, because this is the instruction that was actually given and a reader needs to see what the
> coder was working from.


> **AC-13'** — the overlay never shows a **dissolved** seat as live, and a reincarnation stamp is
> bounded to **one tick**.

The residual, which must be **tested and stated, not discovered**: a freshly revived seat is live,
so it receives the overlay, and the map may still hold the previous incarnation's stamp for up to
one tick (~600ms). **A revived seat can therefore read `fresh` before the daemon has ticked *this*
incarnation.** That is optimistic about a seat that is genuinely alive — the least harmful residual
available, and strictly better than the two falsehoods being removed (a dissolved seat reading live;
a live seat reading dead).

Write a criterion that **pins the bound** — that the stale stamp is gone after the next tick — so
the "one tick" in AC-13' is measured rather than asserted.

## T4 — Prove the deletion did not lose the property

**AC-13' must fail on `848982d5`**? No — it will pass there too, because the marker protocol also
prevented a dissolved seat reading live. So AC-13' is a **preserved-property**, not evidence of this
change. Say so.

**What IS evidence of this change**, and what you must produce:
- a criterion for **P1c** (revive/unarchive no longer suppress a genuine new incarnation) that
  **FAILS on `848982d5`** and passes now — this is the behavioural proof, because the marker
  protocol actively broke this case
- a mutant that removes the new `read()` lifecycle gate ⇒ a dissolved seat reads live ⇒ red

## T5 — Gates and mutation

`just typecheck` · `just lint` · targeted vitest. Re-run the surviving mutant set with `--expect`
and record OBSERVED kill sets; several mutants target deleted code and must be **removed, not
retargeted**.

## Ownership

**Yours**: `core/daemon/tick-heartbeat.ts` / `.test.ts`, `adapters/fs-registry.ts` /
`fs-registry.overlay.test.ts`, the execution log.
**Forbidden**: `daemon.ts` / `daemon.test.ts` — the tick-order pin I added stays; if the deletion
makes it meaningless, **say so, do not delete it**. Also `core/cli.ts`, `cli.ts`, `core/archive.ts`,
`docs/how/fleet/`.

## Report back

Standard JSON. In `notes`: what you deleted, what survived and why, and anything the deletion made
newly reachable.
