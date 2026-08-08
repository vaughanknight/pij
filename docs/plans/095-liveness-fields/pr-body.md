# A blind probe whose output is latched — fixes #142, fixes #155

`pij#142` (the registry pid is not the agent) and `pij#155` (`terminal` is an uncleared latch)
are **one defect in series**, both inside `reconcileDeaths()`:

```ts
if (descriptor.lifecycle === "dissolved" || descriptor.terminal !== undefined) continue; // the LATCH  (#155)
if (input.isAlive(descriptor.pid)) continue;                                             // the PROBE  (#142)
```

The probe writes a value it cannot contradict; the guard makes that value permanent. **Fixing
either alone is observably a no-op for every already-stamped seat** — unlatch without fixing the
probe and the same wrong answer is re-derived next tick; fix the probe and every seat already
stamped stays stuck. So they are fixed as one change.

## Measured, not asserted

Every number below came from a command run against the live registry, not from an issue body.

| finding | measurement |
|---|---|
| **The agent's depth is mixed** | across 23 live seats the agent is **at** the registry pid for 16 and one level below for 7 — split by spawn path (`--session-id` vs `--resume`), not by harness |
| **#142's own proposed remedy would invert the bug** | a hardcoded `pgrep -P` returns "no agent" for those 16 seats — a false-**dead** on the majority, which is the destructive direction |
| **The probe also fails false-ALIVE** — claimed by neither issue | `pij-weak-gurgeh` holds registry pid 952; pid 952 today is `/Library/Intune/…/IntuneMdmDaemon`, **started three days after the descriptor was written**. `isAlive(952)` is `true` forever, so that seat can never be declared dead |
| **The latched population grows** | 4 → **15** in the ~24h after #155 was filed; two of those seats had a **live agent process at the time of measurement** |

### A correction to #155's own headline, found here

#155 describes its population as seats that *"emitted events after being observed terminal"*, and
reads that as **seats returning**. For any seat whose pane was recycled, it is not.

```
pij-unwilling-butterfly   pid 19325 → NO PROCESS (dead ~19h)   paneId %47   terminal: stamped
  lastEventAt, read at 04:02Z : 2026-08-08T04:02:52.533Z
  lastEventAt, read at 04:46Z : 2026-08-08T04:45:50.847Z   ← advanced 43min while dead

pij-sacred-orangutan      ALIVE (pane pid 31163)             paneId %47   terminal: none
  lastEventAt                 : 2026-08-08T04:46:10.289Z   ← 20s after the corpse's
```

Two descriptors claim `%47`; one is dead; their timestamps track each other. `observeActivity()`
(`core/daemon/loop.ts:176-184`) advances `state` and `lastEventAt` from **pane readiness with no
terminal guard**, so a live seat on a re-leased pane writes activity into a dead seat's
descriptor — **pij#172**, the pane-axis twin of the pid reuse above. The count stands; the
interpretation does not. This PR does not fix #172.

## What changed

**Phase 1 — an identity-aware probe that can return the contrary answer.** A bounded descendant
walk, **self included**, matched on the **parsed** `--session-id`/`--resume` value rather than a
substring, over a process table captured with `ps -ww`. Three-valued: `alive | absent | unknown`.
Truncated or unparseable command lines are `unknown`, never `absent`; a process start time may
only ever *corroborate* a match and can never demote one, because a revived agent legitimately
starts after its descriptor.

**Phase 1 — `activityCredibility()`**, the composite question asked once. Published as a contract
**before** it existed (`docs/plans/095-liveness-fields/activity-credibility.contract.md`) so s097
could code against it in parallel. `cause` is byte-stable; `reason` is prose and must never be
parsed. **`unknown` is non-suppressing** — render the activity with its age and an uncertainty
marker, never drop it silently, because a silent drop turns *a refusal to accuse without proof*
into *a refusal to look*.

**Phase 2 — `terminal` becomes a revisable observation**, via an explicit transition table. The
load-bearing row is the quiet one: `terminal` present + probe `absent` ⇒ **no write, no notice**.
Without it, every already-dead descriptor is rewritten and re-notifies its parent on **every
600ms tick**, because the update path rebuilds the expectation without the existing `terminal`,
so `applyTerminalObservation`'s early-return (`spawn-expectation.ts:91`) never engages. A notice
storm is not a smaller bug than the latch it replaces.

## Two things a reviewer cannot see from the diff

**1. This PR deliberately does not change the visible symptom.** `pij-unwilling-butterfly`'s
`status-stale` row — *"has been working for 1141min"* on a seat dead for 19 hours — is emitted by
`core/anomalies.ts` (s097) from `state` + card age. Having `reconcileDeaths` write an honest
`state` would have silenced that row **without the detector being fixed**: the board would look
clean while the check that renders a dead seat as working survived, merely starved of input. That
is a silencer, and it was ruled out. It would also have masked every *other* consumer's version
of the same bug, created a second writer to a daemon-owned field, and destroyed information —
`state: working` on a dead seat is not false about the past.

**What this stream delivers instead is the precondition.** A detector taught to consult `terminal`
today would inherit the latch and confidently suppress 15 seats, two of them alive — trading a
false "working" for a false "dead", the more destructive direction. **A correct, revisable
`terminal` is what makes s097's fix safe to write at all.**

**2. Additive here means "consumers must keep working", not "consumers must notice".** The new
`processSnapshot?()` on `DaemonPorts` is **optional by design**, and `ProcessPort` is deliberately
**not** widened — a mandatory method there is source-breaking for every structural implementer.
Additive is *dangerous* when a consumer must notice a change and *correct* when a consumer must
merely keep working; this is the second, and an absent capability yields `unknown`, never
`absent`. Stated explicitly because the diff cannot tell you which one was relied on.

## Performance — a correctness requirement, not an optimisation

The naive shape (a `ps` per descriptor) measures at **~500 process-table spawns per 600ms tick**
at current seat population — enough to stall the tick and therefore message delivery. The
snapshot is taken **once per sweep** by the caller and passed in **as a value**, which makes the
per-descriptor shape unwritable rather than merely discouraged.

## Declared line ranges (three streams share `daemon.ts` this wave)

| file | range | note |
|---|---|---|
| `daemon.ts` | **640-648 only** | one field on the `reconcileDeaths` input + the snapshot call. Nothing else in the file. Rebased onto s092 (#177). |
| `core/daemon/loop.ts` | line 26, lines 93-106 | one type import + the optional `processSnapshot?()` member. **Does not touch `observeActivity` (171-185)**, which is s099/#172 territory. |

## A guard this change escaped, and put back

`core/liveness-cost.test.ts` exists to assert that *"if someone swaps the ProcessPort for
ps/tmux, liveness silently becomes N forks per listing"* — this PR's headline risk, written down
by someone else months before this stream existed. `process.ts` stays syscall-only and the fork
went into a new file, which is correct **and** left the guard watching six files that no longer
contain the thing it guards: still present, still green, **no longer load-bearing**. The guard is
extended here to cover where the fork actually lives. *Relocating code to keep a guard green does
not satisfy the guard, it escapes it.*

## Evidence discipline

Criteria are labelled, because they do not all buy the same thing:

- **behavioural** — must fail *as a failed assertion* pre-fix, on the meaning-carrying assertion
  (a pre-fix red proves only the **first** assertion that fired; `expect()` throws).
- **mutation-only** — no pre-fix form exists, so a red is unavailable *in principle*. **AC-17 is
  one**: pre-fix, `death-reconciler.ts:109` skips any descriptor carrying `terminal`, so a dead
  seat on tick two produces zero writes and zero notices *there too*. The observable is identical
  in both worlds; only the reason differs. Discharged by a **named mutant** instead.
- **new-API** — cannot fail first; declared as a compile-time exception.
- **preserved-property** — must pass before *and* after; never counted as evidence of the fix.

Cross-model review (`gpt-5.6-terra`) ran mutation gates whose targets **matched** and went **RED**
— not `TARGET NOT FOUND`, not applied-green.

Full evidence: `docs/plans/095-liveness-fields/execution.log.md`.
Plan, dossier and contract: `docs/plans/095-liveness-fields/`.

---

Fixes #142
Fixes #155
Refs #171, #172, #154, #160
