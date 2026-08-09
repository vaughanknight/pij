## Summary

`inert-subscription` detected a dead **trigger** but never a dead **recipient**. A seat whose
every watcher is a terminated session produced **zero rows** — the most literally inert
subscription possible was the one case the detector named for it did not cover (#154).

Live instance: **`pij-continuing-ermine` ran 42 hours with its sole watcher terminal since
`2026-08-06T01:31:59Z`.** No supervision, no row, no signal of any kind. The absence of a nudge
is indistinguishable from healthy operation, which is the property the whole watchdog exists to
defeat.

This PR is the first of stream **s097 (`silent-detectors`)**, which carries #114, #125, #141,
#154 and #156. Those five issues are **three missing facts, not five bugs**; this one is
*"liveness is only ever a suppressor, never a subject"*.

## What changed

| file | change |
|---|---|
| `core/anomalies.ts` | **+156/−0** — watcher resolution into live/gone/unknown; the dead-recipient row |
| `core/anomalies.test.ts` | +234 — criteria 1–8, labelled by what they can prove |
| `core/daemon/anomaly-sweep.ts` | +31/−3 — optional watchdog projection + credibility deps |
| `core/daemon/anomaly-sweep.test.ts` | +117 — including a latch-collision pin |
| `daemon.ts` | +34/−0 — **only** the `new AnomalySweep({...})` argument object at `:354` |

**`core/anomalies.ts` is `+156/−0`: not one existing line changed.** Every row that fired before
fires identically.

## The bigger finding: this detector had never run in the daemon

While fixing #154 we found that **`AnomalySweep` never built the watchdog projection at all** —
`AnomalySweepDeps` had no watchdog store, and `tick()` called `detectAnomalies` without it. So
`inert-subscription` in its entire existence had only ever appeared when a **human** happened to
run `pij anomalies`. It has never once alerted anyone.

That is part of why ermine's 42 hours went unreported, and it is the same shape as the bug being
fixed: *a detector that is correct, tested, and never reached.* A #154 fix that never gets to the
alert path is not a fix, so the sweep wiring ships here.

**This PR therefore turns on the paused-trigger and fleet-disabled rows in the daemon for the
first time.** Expect them to start alerting.

## Cross-stream: one line is deliberately left unwired

The watcher verdict comes from `activityCredibility()`, whose contract is published by stream
**s095** and whose implementation lands in `core/state.ts` — **another stream's file**. It is
taken as an **optional injected function**, not imported (the s079 precedent: *a new INPUT is
safe where a new READ would destroy purity*), so this branch is green today and binds to the
real predicate on merge.

**The daemon call site passes the watchdog projection but not the predicate, because the
predicate does not exist on this branch yet.** Consequence, stated plainly: the dead-recipient
row **cannot fire in production until s095 lands**. One line at `daemon.ts` completes it.

That inertness is **observable by construction, not silent** — with no predicate injected the row
provably cannot fire, and `anomaly-sweep.test.ts` criterion **2b** pins exactly that. *"Absent
wiring"* and *"no row"* are the same observable, which is the property that stops this becoming
another never-reached detector.

## Test criteria are labelled, and only three of ten are evidence

Adopted fleet-wide after three streams nearly shipped criteria that could not fail:

- **BEHAVIOURAL** — must FAIL on pre-fix code (**3 of 10 here**)
- **NEW-API** — cannot fail first, will not compile (1)
- **PRESERVED-PROPERTY / scope-pin** — passes before and after; a regression guard, **never**
  evidence of the fix (6)

Every behavioural criterion was **run against the unfixed tree and watched to fail**:

```
FAIL > 1 - BEHAVIOURAL - all watchers superseded FIRES the dead-recipient row
  AssertionError: expected [] to have a length of 1 but got +0
FAIL > 7 - BEHAVIOURAL - a NON-PAUSED node with all-superseded watchers fires
  AssertionError: expected [] to have a length of 1 but got +0
```

### The trap that caught us, kept in the tests on purpose

A first draft of criterion 1 **passed on pre-fix code**. Its fixture used `pausedBy: "self"`,
which triggers the **pre-existing** paused-trigger row — and both rows share
`kind: "inert-subscription"`, so the assertion was satisfied by a *different detector firing for
an unrelated reason*. It could never have failed.

**An assertion over a SET is not evidence about a MEMBER**, and any fix that *adds* a member to
an existing set makes set-level assertions uninformative **by construction**.

The fixture was **kept** rather than simplified: it still fires both rows, and the criterion now
discriminates on the new row's own content. That is why *"the detail must be distinguishable from
the paused-trigger row"* is a **testability requirement**, not a matter of tone — please don't
trim that wording as prose.

### Mutation evidence (Dim-0)

| # | mutation | result |
|---|---|---|
| A | emit condition → `if (false)` | criteria 1 **and** 7 RED; restored GREEN |
| B | deleted the `verdict === "unknown"` arm (folding unknown into gone) | criterion 5 RED; restored GREEN |
| C | deleted the watchdog spread in the sweep | criteria 1, 3 + collision pin RED; restored GREEN |

## Two design decisions worth a reviewer's eye

**1 · The emit condition is `live === 0 && gone > 0`, not `live === 0`.** The stricter rule is
not a tightening — it is the rule. `live === 0` alone fires on a subscription whose every watcher
is merely **unknown** (an unresolvable id, or a failed probe), which is a fatality conjured from
no evidence. #154's claim is *"every watcher is a terminated session"*: that needs at least one
**observed** terminal recipient and no live one.

**2 · Evidence is two elements, `[gone, unknown]`.** The sweep latches on `kind:node:evidence`,
and the paused-trigger row for the same node carries `[watchers.length]` — which equals `gone`
exactly when every watcher is gone. A one-element key would have **collided and silently
swallowed whichever row the sweep saw second**. Pinned by a test asserting a node that is both
paused *and* dead-recipient delivers **2** alerts.

## The row reports an observation, never a death

`terminal` is currently a latch written by a blind probe and never re-probed. Measured on the
live fleet today: **31 seats carry parked + non-requested-terminal, and 2 of them read
`liveness: active`** — their agent is running right now. One (`pij-unwilling-butterfly`) has
`lastEventAt` **still advancing every ~13s** while carrying a terminal record stamped 5 hours
earlier.

So the row says the watchers *carry terminal observations*, names the composition, and states
that this is an observation rather than a fatality. `superseded` is a rendering verdict, **not a
teardown authority**.

## Scope — what this deliberately does not do

- **Partial degradation does not fire.** One live watcher still receives every notice; a row for
  *"fewer readers than you configured"* is a much noisier signal about subscription **integrity**
  rather than **delivery**. Recorded as a known gap, not smuggled in.
- **`watchers.length === 0` stays silent** — unwatched by choice is healthy, and that guard is
  untouched.
- **Does not fix #114, #141 or #156** — separate phases in this stream.

## `daemon.ts` — declared region

`daemon.ts` is a **composition root** and has **three streams** in it this wave (s092 bootstrap,
s095 `:639-648`, this at `:354`). Granted explicitly by the prime. **Only the
`new AnomalySweep({...})` argument object changed; zero new imports** (`FsWatchdogStore` /
`FsWatchdogGlobalStore` were already imported at `:33`). Verify with
`git diff -- .pi/extensions/pij/daemon.ts`.

## Deferred, filed as #179 — read this without opening the file

Phase 0 wires the watchdog projection into the daemon, which makes `inert-subscription` a
**pushed alert** for the first time. That activated a latent defect in a *neighbouring* row:

`anomalies.ts:434` attributes the fleet-wide-`disabled` row to `watched[0]`, whose identity
follows **filesystem enumeration order**. The sweep routes each anomaly to that node's effective
parent — so if the arbitrary pick is a prime or parentless, **a fleet-wide watchdog outage is
dropped and then latched**, never re-announced.

Harmless while the row only appeared in a human-run `pij anomalies`; a real nondeterministic drop
now. **Deliberately not fixed here** — a deterministic fleet-level recipient is a routing
redesign, not a detector fix, and this PR should not grow one. Filed as **#179** with the
mechanism and evidence; a comment at the call site cites it. The one-row-per-fleet-switch design
is correct and unchanged — **the bug is attribution, not cardinality.**

## Filed along the way

- **#174** — `observeActivity` refreshes `lastEventAt` on a seat with a terminal record; a corpse
  stays permanently "busy right now" (measured live, ~13s cadence, 10h post-mortem).
- **#179** — a fleet-wide watchdog outage routed to an arbitrary `watched[0]` can be silently
  dropped, then latched (deferred from this PR, see above).
- **#175** — `status-stale` hand-rolls a "parked" predicate wider than the canonical
  `mutesWatchdogNudge`; `done`/`failed`/`cancelled` exempt themselves by assertion.

## Review

Cross-model review by `gpt-5.6-terra` (coder was `claude-opus-5`). **Round 1: `FIX_REQUIRED`** —
three findings, all actioned; its "Medium" was promoted to **Critical** by the PM and is the
archive/dissolved fix above. **Round 2: `APPROVE_WITH_NOTES`**, one note: *this branch must not be
represented as closing #154 until s095 wires the predicate* — which is why there is no `Closes`
line.

**Dim-0 was self-authored in round 2, not re-run.** In round 1 the reviewer's "independent"
mutation was **byte-identical to the coder's mutation A** — proving the tests detect removal of
the emit guard, and nothing about a mutant neither party imagined. A pair buys independence of
*runner*, not of *mutant*. Round 2 required the reviewer to invent its own:

| self-authored mutant | result |
|---|---|
| reverse archive-fallback precedence (`resolveRetired ?? byNode` ) | RED 2/82, incl. the live-tier-precedence test |
| empty the daemon's watcher projection (`watchers: []`) | RED 2/3, incl. the real-`Daemon` inbox assertion |

**No surviving mutant** in that set.

**Gate honesty**: the specified suites are **99/99** and typecheck is clean. `harness checks`
passed local-paths, typecheck, lint, Windows-compat, package-audit and snapshots; its full-suite
phase hit a **SIGTERM (143) in an unrelated CLI integration spawn test** and smoke lost a tmux
pane. A separate `just smoke` retry passed. **This is recorded rather than smoothed over — the
full completion gate is not being represented as green.**

The SIGTERM was independently characterised before review: stashing all five changed files and
re-running the same spec on the clean tree **failed there too, with different test names each
run**, same signal. Pre-existing flake in the real-tmux spawn path under fleet load, not a
regression — and the discriminator used was a *tree*, not a retry, because a failing name that
changes between runs makes a single green retry meaningless.

## Gates

`just typecheck` clean · `just lint` 0 errors (9 pre-existing warnings, none in these files) ·
targeted **84/84** · full suite **4055 passed, 0 failed**. Typecheck and targeted tests re-run
independently by the PM, not taken from the coder's report.

## This PR does NOT close #154

The row cannot fire in production until `s095` lands the credibility predicate, so auto-closing
the issue would assert a repair that has not reached the alert path. **Left open deliberately**;
it closes when the one-line daemon wiring completes.
