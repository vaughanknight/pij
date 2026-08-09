# Review packet — s100 dlg-0003 (Phase 2: overlay, scrub, lifecycle prune)

**Reviewer**: `pij-glad-stingray` (gpt-5.6-terra, high) — you reviewed Phase 1 and were compacted
after; assume you remember nothing.
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s100-tick-heartbeat` — absolute paths.
**Base**: Phase 1 is committed at `426c4c9` and approved. Review only what is on top of it:
`git diff 426c4c9`.

## Read first

1. `docs/plans/100-tick-heartbeat/tick-heartbeat-plan.md` — in particular § *The write-back
   defect, and the scrub that closes it*, and § *Applying "what would still be true if the
   replacement were a no-op?"*
2. `docs/plans/100-tick-heartbeat/assets/execution.log.md` — the coder's recorded evidence
3. The diff.

## Context: what Phase 1 left behind, deliberately

Phase 1 removed `lastTickAt` from descriptors. Between the phases **every daemon-owned receipt
reads `unverified`** — `daemonTickStatus(undefined, …)` returns `stale: true`
(`core/receipts.ts:31-33`) and `cli.ts:3398` turns that into the send receipt. Phase 2 restores
the reader surface **without** restoring the writes.

## Search trap — it will mislead you silently

All source is under `.pi/`, a **hidden** directory; `rg` skips hidden paths **by default** and
reports "no matches" for code that exists. **Always `--hidden`.** Never pipe an enumeration
through `head` — a list ending exactly at the limit is indistinguishable from a complete one;
count with `wc -l` first.

## THIS PHASE SHIPS THREE MECHANISMS, AND THAT IS WHERE YOU ATTACK

The criteria do not divide evenly across them. I computed this before implementation by asking,
of every criterion, *what would still be true if this mechanism were a no-op?*

| mechanism | criteria that could ever detect it being inert |
|---|---|
| **overlay** | AC-04, AC-05 — **2** |
| **scrub** | AC-12 — **1** |
| **prune** | AC-13 — **1** |

AC-06, AC-08, AC-09 pass against an inert overlay. **None of that is a defect** — each criterion
honestly tests its own mechanism. But it means a table of seven green ticks contains only two that
could have caught a dead overlay, and nothing in the table says so.

**Your highest-value targets are the two mechanisms with a single criterion: the SCRUB and the
PRUNE.** A single criterion per mechanism has **no cross-check** — if it is vacuous, nothing else
in the phase would notice, and its greenness is indistinguishable from coverage.

**Author your own mutants against those two. Do not re-run mine.** You wrote a merge-not-replace
mutant nobody specified in Phase 1 and it killed a real test; that is exactly what is wanted here.
A pair gives independence of *runner*; only a reviewer-authored mutant gives independence of
*mutant*.

## The scrub is the load-bearing mechanism of the whole change

`publish()` takes `existing` from `this.read()` (`fs-registry.ts:204`), and callers spread read
results into writes — including `stampSenderActivity` (`core/cli.ts:2179`) on **every `pij send`,
in a CLI process**. Without a scrub the overlaid stamp is persisted back, and this becomes a
performance fix that **relocates** its cost onto the latency-sensitive path it was measured
against.

Verify specifically:
- the scrub covers the descriptor `writeAtomic` **and** `syncIdentitySnapshot`
- it cannot be bypassed by any caller, whatever it spread
- **AC-12 runs against the real `FsRegistry`, never `FakeRegistry`** (`adapters/fakes.ts:164-190`
  has no overlay and would pass in a world where production fails)

## Also adjudicate

1. **Does the overlay apply to archived records?** `read()` falls back to the archive by direct
   path (`fs-registry.ts:156-158`). My position: it should **not** — a fresh stamp on a terminal
   record is a lie. Confirm the code matches whatever it claims, and that the claim is right.
2. **Is the map read once per `list()`**, not once per descriptor? A per-descriptor read would
   reintroduce a per-seat cost in the opposite direction.
3. **The prune must cover** `dissolve`, `remove`, `archive`, `revive`, and any restore/reclaim.
   `revive` deliberately strips `lastTickAt` (`core/revive.ts:661-675`); an un-pruned entry would
   **bypass a scrub the codebase already thought it had**.
4. **Is the access-path divergence documented at BOTH ends** — the overlay site *and* the
   `readFile` path? A divergence documented only where it is created is invisible to everyone who
   meets it where it matters.
5. **AC-05 must exercise the real receipt path, not a stub.** Through a stub it proves nothing,
   and it is the only criterion that observes the overlay from outside.

## Out of scope

`daemon.ts` (Phase 1, committed and approved), `core/cli.ts`, `cli.ts`, `core/archive.ts`,
`core/watchdog.ts`, `core/anomalies.ts`, `docs/how/fleet/ledger.md`, and the three flow-state
files.

## Report back

Write to `docs/plans/100-tick-heartbeat/assets/reviews/phase-2-review.md`, then send one line:
`<VERDICT> — <path>`. Findings need severity and `file:line` evidence you **verified**. Prefer one
verified critical over ten speculative. Say so explicitly if you could not verify something.
