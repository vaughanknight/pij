# Fix packet 8 — the attachment changed, and my over-drop justification was falsified

**Base**: `6fa07dda`. Review: `assets/reviews/phase-2-fix7-review.md`. **Two items, independent.**

## T1 — P1: legacy external re-adoption inherits a stamp

`isTerminalRecord()` returns false when `lifecycle` is **absent** (`core/archive.ts:33-35`), by
design. So a hot **legacy** descriptor — no `lifecycle`, no `harnessSessionId` — reads as
`hadLiveIncarnation`, and `pij adopt --id` then reattaches it with a **new** `harnessSessionId` and
`lifecycle: "bound"` through `registry.write()` (`cli.ts:2800-2812`, `core/binding.ts:212-230`).
Prior is neither null nor terminal ⇒ **no drop** ⇒ the old stamp becomes a receipt for a new
binding. Proved with a probe.

**Do NOT classify every lifecycle-absent record as terminal.** The reviewer is explicit: an
ordinary legacy state update is not necessarily a new incarnation. That would be a false positive
on every legacy write.

**The candidate**, and it is the third identity I have proposed on this surface, so **check it, do
not take it**:

> `harnessSessionId` is the incarnation identity for exactly the harnesses this map holds.
> `applyBinding` calls it *"the binding pij-id ↔ harnessSessionId ↔ pane ↔ cwd the daemon persists
> and tails"* (`core/binding.ts:21-28`), and `buildRevivedDescriptor` demotes the old value to
> `plannedHarnessSessionId` so a new one is re-discovered on rebinding (`core/revive.ts:688`).

So the conjunct: **keep the stamp only if the prior descriptor's `harnessSessionId` equals the
incoming one.** Different ⇒ the attachment changed ⇒ drop.

Verify before relying on it:

- `undefined === undefined` (legacy → legacy state update, attachment unchanged) must **keep** —
  that is the false positive the reviewer warned about
- `undefined → "claude-new-session"` (the adopt case) must **drop**
- the `core/cli.ts:3735` assignment swap preserves `harnessSessionId`, so it must still **keep**
- my previous two identity proposals died to exactly this kind of unchecked assumption
  (`revivePendingAt` existed on one path only; `pid` is the pane shell and is identical across a
  relaunch). **If `harnessSessionId` fails a case, STOP and tell me — do not invent a fourth.**

## T2 — Correct the over-drop justification. The RULING stands; my REASON was falsified.

I ruled `terminal → terminal` keeps its over-drop, on three reasons. **The reviewer falsified one
of them.** I said writes hitting a still-terminal record are the daemon's own latched transition
writes, so the daemon is running by construction and the next tick repairs. It is not true in
general: `executeAgentReport()` admits `failed` and writes `reportedAt` via `registry.write()`
(`core/agent-peer.ts:403-448`) — a production **failed → failed** write with **no next-tick
repair**, because the daemon may be stopped.

**The ruling is unchanged** — it survives on the asymmetry alone (an over-drop costs one
`unverified` read; an under-drop is a false-fresh lie for the full grace), and the reviewer agrees
the direction is conservative because `bind-failed` sends are blocked anyway.

**But the comment and the criterion must stop claiming the repair.** Rewrite both to say what is
true: *the over-drop is priced, not repaired.* A justification that names a mechanism which does
not always apply is worse than one that names none, because it invites a reader to check the
mechanism and conclude the case is handled.

This is the same shape as the round-5 funnel and the round-6 destination search: **a true statement
about some cases, used as a statement about all of them.** Third instance, and this one is mine.

## T3 — While you are in that comment

Apply the replacement we agreed: the ruling, its (now two) surviving reasons, **attribution and
date**, and the reversal path kept as a documented decision. Phrase it as *"this was considered and
here is the ruling"*, never *"this is fine"* — the second is indistinguishable from an unexamined
default.

## T4 — Evidence

- a regression through the **legacy-adopt** path, red on `6fa07dda`
- the three keep-cases above, labelled preserved-property negatives
- mutants: the session-id conjunct removed; the conjunct inverted; re-verify M30–M35 unchanged
- `--expect` mandatory, observed kill sets

## Ownership

**Yours**: `adapters/fs-registry.ts` / `fs-registry.overlay.test.ts`,
`core/daemon/tick-heartbeat.ts` / `.test.ts`, the execution log.
**Forbidden**: `core/archive.ts` (import only), `core/binding.ts`, `cli.ts`, `core/cli.ts`,
`core/agent-peer.ts`, `daemon.ts`, `docs/how/fleet/`.

## Report back

Standard JSON. In `notes`: which of the four `harnessSessionId` cases are **asserted** vs believed.
