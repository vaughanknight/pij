# Coder packet — plan-084, Phase 3: Add the repair path

**Frozen** 2026-08-05 by `pij-respectable-starfish`. Immutable. Standing rules from the Phase-1
and Phase-2 packets still apply (batons, forbidden paths, TDD, no mocks, `.js` imports,
`noUncheckedIndexedAccess`, no commits, both-edge reporting, resolved output only, `/pij` § C10).

**Phases 1 and 2 are APPROVED and closed.** Reviews: `reviews/review.phase-1.md`,
`reviews/review.phase-2.md`. Read review-2's findings — both were **proof gaps, not behaviour
defects**, and that distinction is the shape to expect here too.

## What this phase is

The last third of `#95`: **the recovery path**. Phases 1–2 let a PA bound *itself*. This phase
lets a **prime act on a seat's behalf**, and stops the sanctioned path destroying evidence.

Three deliverables, tasks **3.1–3.8** exactly as tabled in the plan's `#### Phase 3`:

| # | Deliverable |
|---|---|
| 3.1–3.2 | **`addedAt` preserved on EVERY re-bind path** |
| 3.3 | A log/spine line on re-bind, so the change stays auditable once the timestamp stops moving |
| 3.4–3.6 | **`--for <seat>`** on `watch` *and* `unwatch`, with the watcher filter re-keyed |
| 3.7 | `docs/how/pij-watchdog.md` |
| 3.8 | Full `harness checks` |

## The trap — Key Finding 03, and it is a two-sided one

`core/cli.ts:2318` filters existing watchers by `watcher.watcherId !== self.value` — keyed on
**the caller**. With `--for X` that is wrong in both directions:

- **`watch --for X`** when X *already* has a subscription: X's existing entry is **not**
  filtered out (the filter is looking for the caller, not X), so the append produces a
  **duplicate** entry for X.
- **`unwatch --for X`**: removes only `self.value`, so a `--for`-created subscription is
  **un-removable by its own owner**.

**Fix shape**: re-key the filter on the **effective watcher id** — the `--for` value when
present, else self — for `watch` **and** `unwatch`. One concept, both actions.

## `addedAt` — the whole reason this issue has teeth

`core/cli.ts:2325` stamps `addedAt: new Date(now).toISOString()` on every re-bind. **This
destroyed real evidence** and is why a human had to hand-edit a sidecar.

- **The in-repo precedent to copy**: `core/watch-subscription.ts:75` —
  `out[index] = { ...sub, addedAt: out[index]?.addedAt ?? nowIso }`. The peer file-watch feature
  already gets this right; the watchdog path is the **one** that diverges.
- **Capture the prior entry BEFORE the filter drops it.** The current code filters first, so the
  old `addedAt` is already gone by the time the new record is built. That ordering is the bug.
- **New subscription** → stamp `addedAt`. **Re-bind** → preserve it. Both cases need a test.
- Ruling **R-01** (Jordan, verbatim *"original"*): this applies to **every** re-bind path, not
  just `--for`.

## `--for` — authorisation, not just plumbing

- **A `pa` caller must be REFUSED `--for`** (AC-10). It would bypass the target restriction
  Phase 2 just built: a PA could name any watcher for any target. This is the one place Phase 3
  can silently undo Phase 2 — treat it as such.
- Non-PA callers may use it (that is the recovery path `#95` asks for).
- The Phase-2 `paTargetDecision` predicate stays untouched; `--for` authorisation is a separate,
  narrower question and belongs where the flag is parsed/handled.

## Expected trap, from review-2's lesson

Review-2 found that **every parent fixture was a prime**, so a regression would have left the
suite green. Ask the equivalent question of your own Phase-3 fixtures **before** I have to:
does any fixture make the `--for` target incidentally equal to the caller, or the re-bind case
incidentally a fresh subscription? A test that cannot return the contrary answer is not a test.

## Allowed paths

```
.pi/extensions/pij/core/cli.ts
.pi/extensions/pij/core/cli.test.ts
.pi/extensions/pij/cli.integration.test.ts
.pi/extensions/pij/core/orchestration/pa-capability.ts        (only if --for needs a table entry)
.pi/extensions/pij/core/orchestration/pa-capability.test.ts
docs/how/pij-watchdog.md
docs/plans/084-pa-gate-repair/execution.log.md                (append)
```

Forbidden paths unchanged. **`core/watch-subscription.ts` is READ-ONLY** — it is the precedent
to copy, not to modify. Anything outside the list → stop and tell me, as you did in Phase 2.

## Proof commands

```bash
npx tsc --noEmit
npx vitest run .pi/extensions/pij/
harness checks            # FULL, not --quick — this is the ship gate (task 3.8)
```

Known flake unchanged: `cli.integration.test.ts` is load-sensitive. **Re-run before reporting a
red, and say that you re-ran.**

## Mutation proofs I expect, named up front

1. **`addedAt`**: revert to `new Date(now)` on re-bind → the preservation test must redden, and
   the new-subscription test must stay green.
2. **The filter re-key**: revert to `!== self.value` → the duplicate/orphan tests must redden.
3. **`--for` authorisation**: allow a `pa` to use `--for` → the AC-10 test must redden.

## Task 2.9 is STILL GATED

`#102` remains with the human. It is not part of Phase 3. Do not fold it in.

## Report shape

Unchanged: `claim` · `artifacts[]` · `shas[]` · `gates[]` · `observations[]` · `open[]`.
Resolved output only. Report the first red, not just the final green — you have done that twice
and it is why your reports are usable.
