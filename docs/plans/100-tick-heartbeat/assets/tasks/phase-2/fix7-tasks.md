# Fix packet 7 — generalise the predicate; do NOT add a third case

**Base**: `dcdfe509`. Review: `assets/reviews/phase-2-fix6-review.md`.

## What the reviewer proved

`unarchive()` can make an **old failed incarnation hot** before the later write that makes it live:

1. `runRevive()` calls `registry.unarchive(seatId)` **before** validating the plan (`cli.ts:1700`),
   so a failed plan leaves an archived `failed` descriptor **in the hot tier**
2. `list()` deliberately includes `failed`, so the daemon writes a map entry for it
3. `runAdopt()` treats only `dissolved` as a revive (`cli.ts:2805-2808`), so it reattaches the
   failed descriptor as `bound` through `registry.write()` — **not** `revive()`
4. `publish()` sees `hadHotDescriptor === true`, skips the drop, and `read()` overlays a
   terminal-era stamp onto the new bound incarnation

Proved with a probe, removed cleanly. **Do not fix this as a third special case.**

## The correction to MY method, which is the more useful half

I claimed the destination search settled completeness. The reviewer's answer is exact:

> the missed composition is `unarchive()` changing the **precondition** of a later `publish()`,
> which a destination-only count does not prove safe

A destination enumeration proves *every write passes through these three*. It does **not** prove
*each writer's precondition means what it thinks it means*. **Enumerating writers does not
enumerate the states a writer can observe.** Say that in the source comment — the next person to
"simplify" this will re-derive the same three-writer argument and reach the same wrong conclusion.

## T1 — One predicate, three transitions

The bug is that `hadHotDescriptor` conflates *"an incarnation is present"* with *"a **live**
incarnation is present"*. Fix the conflation rather than adding a branch:

> drop unless the prior hot descriptor **existed and was non-terminal**

`isTerminalRecord` (`core/archive.ts:33-35`) is the existing predicate — **import it, do not
re-spell it**, or the two definitions will drift the first time someone adds a lifecycle.

Verify it covers all four, and that the last two are unchanged:

| prior hot | incoming | drop? | why |
|---|---|---|---|
| absent | anything | **yes** | round 5's rehydration |
| terminal (`dissolved`/`failed`) | anything | **yes** | this round: a terminal record is not a present incarnation |
| live | live | no | `core/cli.ts:3735` assignment swap — must keep its stamp |
| live | terminal | no | a dissolve needs no drop (the gate refuses it), and `failed` **parity** keeps the stamp |

That last row is the constraint the reviewer named: **preserve the intentional `failed` overlay
parity while the record REMAINS terminal**, and drop only when it stops being terminal.

## T2 — Regression for the public composition

Cover the reviewer's sequence through the **public** surface — `unarchive()` then a bound
`write()` — not a bare unit. It must fail on `dcdfe509`.

Also add the negative that keeps the fix honest: a **tick written AFTER the new binding must not be
suppressed**. The reviewer named that explicitly and it is the direction this predicate could break.

## T3 — Mutation

- terminal-prior treated as present ⇒ the new criterion must die
- the predicate inverted ⇒ the live→live criterion must die
- `isTerminalRecord` narrowed to `dissolved` only ⇒ the failed-adoption criterion must die

`--expect` mandatory, observed kill sets, and re-verify M30/M31/M32 still kill unchanged.

## Ownership

**Yours**: `adapters/fs-registry.ts` / `fs-registry.overlay.test.ts`,
`core/daemon/tick-heartbeat.ts` / `.test.ts`, the execution log.
**Forbidden**: `cli.ts`, `core/cli.ts`, `core/binding.ts`, `core/session.ts`, `daemon.ts`,
`core/archive.ts` (**import** from it, do not edit it), `docs/how/fleet/`.

## Report back

Standard JSON. In `notes`: confirm the four-row table above is what the code does, and say whether
any row is asserted by a criterion rather than merely believed.
