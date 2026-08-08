# Fix packet 4 — two P1s in the OVERLAY surface (not the deleted mechanism)

**Base**: `dd743cae`. Review: `assets/reviews/phase-2-fix3-review.md`.

Both findings are outside the marker protocol, so the deletion stands. Both are **regressions this
plan introduced**, not pre-existing gaps — that is what makes them mandatory rather than
documentable.

## P1e — a legacy descriptor carries its own persisted `lastTickAt` past the gate

The gate skips `overlayTick` for a dissolved descriptor, but it **returns `hot` unchanged**
(`fs-registry.ts:250-253`) — and a pre-migration descriptor already has `lastTickAt` **in its
JSON**. The archive fallback has the same hole: it returns `readFile(archivePathFor(id))` directly.

The reviewer probed it: `expected '2026-06-28T11:59:59.000Z' to be undefined`.

This is not hypothetical — **every descriptor written before this plan carries a stamp** (588 on
this machine). AC-04d only covers a *modern* descriptor that `scrubTick` has already cleaned.

**Fix**: strip `lastTickAt` from **terminal** results at both the hot-dissolved branch and the
archive fallback. **Do not** remove the compatibility behaviour for **live** legacy descriptors —
the overlay spec deliberately asserts `read()` honours a live legacy stamp until a rewrite
(`fs-registry.overlay.test.ts:489-500`). Add **raw legacy** fixtures for hot-dissolved and archived,
written as JSON rather than through `write()`, or the fixture will be pre-cleaned and the test will
prove nothing.

## P1f — the residual is NOT one tick, and it is a regression

`buildRevivedDescriptor` **strips `lastTickAt`** (`core/revive.ts:667`). So **before this plan a
revived seat had no stamp and correctly read `unverified`.** The map now re-attaches what revive
deliberately removed.

And the bound I wrote is wrong. It is not one tick / ~600ms — it is **until the next successful
heartbeat write**. If the daemon stops right after the old incarnation's tick, no rebuild happens
and the stale stamp stands until `DAEMON_TICK_STALE_AFTER_MS` (**30 s**). The reviewer measured a
real `send` receipt reporting `queued`, `daemonTickStale: false` for a seat the daemon had never
ticked.

**Fix**: the overlay must not attach a stamp that **predates this incarnation**.

`buildRevivedDescriptor` sets `revivePendingAt: attachment.nowIso` — a **per-incarnation**
timestamp already on the descriptor (`revive.ts:689`). It does **not** re-mint `startedAt`, which
comes through `...durable`, so `startedAt` cannot distinguish incarnations. **Verify both of those
before relying on either** — that is my reading and I have been wrong on this surface twice.

If `revivePendingAt` works: skip the overlay when the stamp is older than it. One comparison,
between two values read together, **no new storage, no directory, no sweep, no protocol** — this is
deliberately *not* a re-introduction of the marker, and say so in the comment so the next reader
does not "simplify" it back.

If it does not work, **say so and stop** rather than inventing a fence; I would rather restate the
criterion honestly than grow a second mechanism.

## T3 — Correct AC-13' itself

My restatement was **factually wrong** and is already in a commit message. The honest form:

> never shows a **dissolved** seat as live; a reincarnation stamp is bounded by **the next
> heartbeat write**, and in its absence by the 30 s staleness grace.

Label the BOUND criterion for what it proves — a **conditional**: *after a later tick, the whole-map
rebuild ends the inheritance.* It does not prove an unconditional bound and must not read as if it
does.

## T4 — Evidence

- P1e: raw legacy dissolved + archived fixtures, failing on `dd743cae`
- P1f: revive-then-read with **no** intervening heartbeat write, failing on `dd743cae`, asserted
  through the **real receipt path** (that is where the reviewer saw it)
- mutants for both new gates, `--expect` mandatory, observed kill sets

## T5 — Gates

`just typecheck` · `just lint` · targeted vitest.

## Ownership

**Yours**: `adapters/fs-registry.ts` / `fs-registry.overlay.test.ts`, `core/daemon/tick-heartbeat.ts`
/ `.test.ts`, the execution log.
**Forbidden**: `core/revive.ts` (read it, do not edit it), `daemon.ts`, `daemon.test.ts`,
`core/cli.ts`, `cli.ts`, `core/archive.ts`, `docs/how/fleet/`.

## Report back

Standard JSON. In `notes`: whether `revivePendingAt` actually works and how you proved it.
