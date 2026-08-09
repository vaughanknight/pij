# Fix packet 9 — remove every repair claim. Documentation only, no behaviour change.

**Base**: `cc4265fb`. Review: `assets/reviews/phase-2-fix8-review.md`. **No code changes. No
criterion changes except renaming and re-asserting two.**

## What is wrong

The reviewer's round-7 falsification was applied to **one** of the two places it lived. And the
**new** disclosed over-drop repeats the identical error — which I endorsed in writing, so this is
mine as much as yours.

**Both claims are false for the same reason: a write happening INSIDE the daemon does not make
another tick happen.**

1. `Daemon.tick()` writes the heartbeat at its **beginning**, before it drives and binds pending
   sessions
2. the bind then **removes that just-written map entry**
3. `runDaemon()` only schedules a later `setInterval` — it does not make a further tick durable or
   inevitable. A stop or crash after this tick leaves a same-incarnation bound seat unverified
   until some daemon runs again

So "the daemon performed the write, therefore a tick is ≤600ms away by construction" is **not** a
weaker version of the terminal→terminal argument. It is **the same argument**, and it fails the
same way.

## T1 — The exact sites. I enumerated them so this is not a third round of "you missed one"

Searched my four owned files for `self-heal|re-stamp|next tick|600ms|by construction` — 22 hits, of
which **four are the false repair claims**:

| site | what it claims | action |
|---|---|---|
| `fs-registry.ts:474-476` | terminal→terminal: daemon "by construction running", `list()` re-stamps "within one 600ms tick" | **delete the repair claim**; keep the asymmetry reason |
| `fs-registry.ts:510-511` | spawn-bind: "genuinely does self-heal… a tick is by construction ≤600ms away" | **delete** |
| `overlay.test.ts:1061` | criterion **named** "…drops, and self-heals" | **rename** to a conditional later-heartbeat assertion |
| `overlay.test.ts:1069` | same by-construction claim in the criterion's comment | **delete** |

The remaining 18 hits are **fine and must not be touched** — they are either statements about the
tick's own rebuild (`tick-heartbeat.ts:4`, `:173`, `test:58`), correctly-labelled conditionals
(`overlay.test.ts:576`, `:670`, `:922`), the already-corrected note (`:893-894`), or unrelated uses
of "by construction" about terminality (`fs-registry.ts:201`, `:303`, `:869`). **Check that list
rather than trusting it**, but do not widen the edit beyond the four.

## T2 — State the price, do not soften the claim

Both cases end the same way, in the same words the terminal→terminal case now uses:

> **priced, not repaired.** A later heartbeat write ends the inheritance; with no daemon running,
> there is no such write and the seat reads `unverified` until one runs. That is conservative and
> accepted.

**Do not write "usually", "typically", or "in practice".** A hedge is how a repair claim survives a
correction — it keeps the reassurance and removes the falsifiability, which is worse than the
original because it can no longer be checked.

## T3 — The criterion

Rename `P1i DISCLOSED OVER-DROP: …and self-heals` to assert what it actually proves: **a later
heartbeat write re-stamps the seat.** Same shape as `AC-13' BOUND (CONDITIONAL)` at `:576`, which is
already correct — copy its labelling.

## T4 — Attribution

Both corrected comments record that the repair premise was **falsified by review**, with the
counter-example (`executeAgentReport()` for terminal→terminal; the tick-ordering argument for
spawn-bind). A deleted justification that leaves no trace invites the next reader to re-derive it —
that is the round-7 lesson, and it applies to the deletion as much as to the claim.

## Gates

`just typecheck`, `just lint`, targeted vitest. No behaviour change, so kill sets must be
**identical** to `cc4265fb` — if any mutant's kill set moves, a comment edit changed behaviour and
something is wrong.

## Ownership

**Yours**: `adapters/fs-registry.ts`, `adapters/fs-registry.overlay.test.ts`, the execution log.
**Forbidden**: everything else, and **no code changes at all**.
