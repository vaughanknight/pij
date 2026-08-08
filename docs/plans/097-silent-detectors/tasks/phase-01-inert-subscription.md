# Phase 0+1 tasks — `#154` dead recipient, and the sweep that never ran it

**Stream**: s097 silent-detectors · **Plan**: `docs/plans/097-silent-detectors/silent-detectors-plan.md`

**Files you may write**: `.pi/extensions/pij/core/anomalies.ts` ·
`.pi/extensions/pij/core/anomalies.test.ts` · `.pi/extensions/pij/core/daemon/anomaly-sweep.ts` ·
`.pi/extensions/pij/core/daemon/anomaly-sweep.test.ts` · **`daemon.ts` — ONLY the
`new AnomalySweep({...})` argument object at `:354`** (granted by the prime; see T-5)

**Files you may NOT write** (other streams own them — a change here becomes a merge conflict for
a seat that does not know you exist): `core/watchdog.ts` · `core/daemon/watchdog-manager.ts` ·
`core/state.ts` · `core/platform/types.ts` · `core/types.ts` · `core/cli.ts` ·
`core/orchestration/pa-capability.ts` · `core/daemon/loop.ts` · **the whole of `daemon.ts`
except the single `:354` argument object named in T-5**.
Also forbidden, always: `.the-flow-state.json`, `the-flow.json`, `the-flow.md`.

---

## Background — read this, the defect is a composition and not a typo

`inert-subscription` exists to detect **supervision wiring that delivers to nobody**. Today it
interrogates only the **trigger** (disabled fleet-wide / exempt / paused). It never interrogates
the **recipient**. `WatchdogNodeView.watchers` is a `readonly SessionId[]` that is only ever
`.length`-checked and `.join`-ed, so the detector **structurally cannot** know whether a watcher
still exists.

**Live instance**: `pij-continuing-ermine` ran **42 hours** with its sole watcher
(`pij-respectable-starfish`) terminal since `2026-08-06T01:31:59Z`. Zero rows, no signal of any
kind. The absence of a nudge is indistinguishable from healthy operation — which is the property
the whole watchdog exists to defeat.

---

## T-0 · Accept `activityCredibility` as an OPTIONAL INJECTED FUNCTION

Another stream (`s095`) owns the real implementation, which will live in `core/state.ts`. **You
must NOT import it** — that file is not yours and the import would not resolve on this branch.
Instead, **declare its types structurally in `anomalies.ts`** and accept the function as an
optional field on `AnomalyInputs`. This is the same decision the module already made for
`watchdog` (see the comment at `anomalies.ts:120-127`): *a new INPUT is safe where a new READ
would destroy purity.*

The published contract, verbatim in substance — **match these names exactly**, they are
byte-stable and another stream implements against them:

```ts
export type ActivityCredibilityCause =
    | "observed-live"        // a live probe corroborated the agent
    | "uncontradicted"       // nothing contradicts the recorded activity
    | "agent-absent"         // observed absent (terminal record, or a live absent probe)
    | "dissolved"            // lifecycle: "dissolved"
    | "close-requested"      // pij asked for this teardown
    | "probe-unavailable"    // the liveness observation itself was unavailable — we do not know
    | "no-activity-recorded";// no telemetry ever recorded — NOT the same as "it was idle"

export type ActivityVerdict = "current" | "superseded" | "unknown";

export interface ActivityCredibility {
    readonly verdict: ActivityVerdict;
    readonly cause: ActivityCredibilityCause;
    readonly reason: string;   // HUMAN-READABLE. NEVER parse this.
    readonly asOf?: string;    // ISO-8601 of the evidence (e.g. terminal.observedAt)
}

export interface ActivityCredibilityInput {
    readonly state?: "working" | "idle";
    readonly lastEventAt?: string;
    readonly lifecycle?: /* the descriptor's lifecycle type */;
    readonly terminal?: /* the descriptor's TerminalObservation type */;
    readonly agentLiveness?: "alive" | "absent" | "unknown";
}
```

Add to `AnomalyInputs`:

```ts
/** Injected, never imported: `state.ts` is another stream's file and a direct
 *  import would couple this module's merge to theirs. Optional by construction —
 *  absent keeps every existing caller byte-for-byte. */
readonly activityCredibility?: (input: ActivityCredibilityInput) => ActivityCredibility;
```

**Contract rules you must obey**:
- **Branch on `cause` / `verdict`. NEVER string-match `reason`** — it is prose and may be
  reworded at any time. Render it, do not parse it.
- Pass `agentLiveness` only if you have a probe. You do not — you read the registry. Omit it.
- `superseded` is a **rendering verdict, not a teardown authority**. Never treat it as proof of
  death in anything irreversible.

## T-1 · `inert-subscription` resolves its watchers (`anomalies.ts:337-362`)

`detectAnomalies` **already** builds `const byNode = new Map<string, SessionDescriptor>()` over
`inputs.descriptors` at `:297-298`, before this block. Use it. **Do not add a store read or a
probe** — the module's purity is the only reason its proofs mean anything (ruling s079).

For each `watcherId` in `node.watchers`, resolve it in `byNode` and classify:

| bucket | condition |
|---|---|
| **live** | resolves, and `activityCredibility(...).verdict === "current"` |
| **gone** | resolves, and `verdict === "superseded"` |
| **unknown** | does **not** resolve at all, **or** `verdict === "unknown"` |

**`unknown` must NEVER be counted as gone.** Two independent reasons, both measured:
- `verdict: "unknown"` covers `probe-unavailable` — the observation *itself* failed. Not
  evidence of anything.
- An **unresolvable id** is not a death: watcher ids are **never referentially validated**
  (`pij watchdog watch <target> --for <id>` validates only the *target*, and the sidecar parser
  accepts any string), so a typo'd or cross-home `--for` would otherwise be reported as a death.

**Emit the row when `live === 0` AND `node.watchers.length > 0`.**

- `watchers.length === 0` **keeps its meaning and stays silent** — unwatched by choice is a
  healthy, deliberate state. Do not touch that guard.
- Partial degradation (some gone, ≥1 live) **does not fire** — a deliberate scope decision
  recorded in the plan, not an oversight.
- **When `inputs.activityCredibility` is absent, this row cannot fire at all.** That is
  intentional: "wiring absent" and "no row" must be the same observable, so an unwired
  production call site is detectable rather than silently inert.
- **Reachability**: the existing code does `if (node.pausedBy === undefined) continue;`. A node
  with **live wiring but dead recipients is not paused**, so today it falls through and emits
  nothing. Your row must be reachable for a **non-paused** node. Restructure carefully so the
  existing paused-trigger behaviour stays **byte-identical** for every input that already
  produced a row.

**The `detail` string must**:
- be clearly distinguishable from the paused-trigger row (that one = dead *trigger*; this one =
  dead *far end*);
- name the composition — how many watchers, how many gone, how many unknown;
- **report an observation, never assert a death.** Say the watchers *carry terminal
  observations*; do not say they *are dead*. This is load-bearing: `terminal` is currently a
  latch written by a blind probe, and **2 of 31 sampled seats carry a terminal record while
  their agent is running right now**. A detector that asserts death on that input is a more
  authoritative version of the same error. You may render `credibility.reason` and `asOf` for
  the human (e.g. "superseded 6d ago") — render, never parse.
- carry a remedy that is **re-subscribing a live watcher**
  (`pij watchdog watch <node> --for <live-seat>`), explicitly **not** resuming a pause, and note
  that a card refresh does not resolve it (match the tone of the existing rows).

**Evidence must NOT be a constant.** The sweep latches on `kind:node:evidence`
(`anomaly-sweep.ts:42-43`), so a constant key alerts once and then stays silent forever however
much worse it gets. Follow the `status-stale` precedent at `anomalies.ts:447-452` (a changing
bucket). The count of gone watchers is a reasonable changing value.

## T-2 · Tests for T-1 (`anomalies.test.ts`) — all required, and LABELLED

Follow the file's existing fixture conventions.

**Every criterion is labelled with what it can prove.** This is not bookkeeping: a criterion that
cannot fail on pre-fix code is *not evidence of your fix*, however green it is.

| # | criterion | kind |
|---|---|---|
| 1 | all watchers `superseded` → **fires the NEW row**, discriminated by its distinguishing detail (see the warning below) | **BEHAVIOURAL** |
| 2 | one `current` watcher among several `superseded` → does not fire | preserved / scope-pin |
| 3 | zero watchers → does not fire | preserved / scope-pin |
| 4 | an **unresolvable** watcher id → not counted as gone (one unresolvable, nothing else ⇒ no row) | preserved / scope-pin |
| 5 | verdict `unknown` (cause `probe-unavailable`) → not counted as gone | preserved / scope-pin |
| 6 | the existing **paused-trigger** row still fires exactly as before | **PRESERVED-PROPERTY** (regression guard — never evidence of the fix) |
| 7 | a **non-paused** node with all-`superseded` watchers → **fires** | **BEHAVIOURAL** |
| 8 | `activityCredibility` absent ⇒ no row (the wiring-detection property) | preserved / scope-pin |
| — | the new types compile | **NEW-API** — cannot fail first, declared exception |

> ### ⚠ CRITERION 1 HAS A TRAP AND IT HAS ALREADY CAUGHT US ONCE
>
> **Measured on this tree, before implementation**: a first draft of criterion 1 used a fixture
> with `pausedBy: "self"` and no declared state — and it **PASSED on pre-fix code**. That fixture
> is the trigger for the **existing paused-trigger row**, so the assertion *"an
> `inert-subscription` row exists"* was satisfied by a **different detector firing for an
> unrelated reason**. It could never have failed, and it would have shipped green as proof of a
> fix it did not test.
>
> **Both rows share `kind: "inert-subscription"`, so filtering by `kind` cannot tell them
> apart.** An assertion over the *set* is not evidence about the *member* you added.
>
> **Therefore**: criterion 1 must assert on the **new row's distinguishing content** (the
> dead-recipient wording / the composition counts / its evidence value), **not** merely that a
> row of that kind exists. This is why "the detail must be distinguishable from the
> paused-trigger row" in T-1 is a **testability requirement**, not a matter of tone.
>
> Verified pre-fix result for criterion 7 (the honest behavioural one):
> `AssertionError: expected [] to have a length of 1 but got +0`.

**Before you implement**: run criteria 1 and 7 against the **unfixed** tree and **watch them
fail**. Do not reason about it — run it, and paste the failure output into your report. If either
passes, it is testing something already true; rewrite it before writing any production code.

**Mutation gate — MANDATORY, and the reviewer will check this hardest.** For criteria 1 and 7:
remove or invert the new guard, re-run the targeted test, confirm **RED**, restore, confirm
**GREEN**. Record the exact command, the observed failure text, and the restore. A green test is
a claim; the mutation is the proof.

## T-3 · The sweep must actually run this detector (`anomaly-sweep.ts`)

**This is why the fix matters.** `AnomalySweepDeps` (`:17-30`) has **no watchdog store**, and
`tick()` calls `detectAnomalies` **without** `watchdog` (`:56-62`). So `inert-subscription` has
**never fired in the daemon** — it appears only when a human runs `pij anomalies`. A `#154` fix
that never reaches the alert path is not a fix.

- Add **optional** deps for the watchdog projection **and** the `activityCredibility` function,
  and pass both through to `detectAnomalies`.
- **Optional by construction**: absent ⇒ behaviour **byte-identical** to today, so no existing
  caller or test changes meaning.
- Prefer accepting the already-projected `WatchdogSubscriptionInputs` (or a supplier returning
  it) over importing a store adapter — keep the sweep as free of I/O plumbing as it is now.
- Wire it at `daemon.ts:354` — see **T-5**. The prime granted that single constructor site.

## T-4 · Tests for T-3 (`anomaly-sweep.test.ts`)

| # | criterion | kind |
|---|---|---|
| 1 | sweep **with** a watchdog projection + credibility fn containing an all-gone subscription → emits an `inert-subscription` alert | **BEHAVIOURAL** |
| 2 | sweep **without** them → behaves exactly as today | **PRESERVED-PROPERTY** |
| 3 | **two consecutive ticks** with the same condition → alerts **ONCE**, not twice | **BEHAVIOURAL** (storm guard) |

**Criterion 3 is not optional.** The sweep runs on a repeated tick, and the latch keys on
`kind:node:evidence` (`anomaly-sweep.ts:42-43`). A row whose evidence is constant alerts once and
then goes silent forever; a row whose evidence changes every tick is a notice storm. Pin the
no-op row explicitly: tick twice with an unchanged condition and assert exactly one alert. (A
sibling stream shipped a plan that would have re-notified every dead descriptor on every 600ms
tick precisely because the persistent-absent transition was never written down.)

**Before you implement**: run criterion 1 against the unfixed tree and watch it fail. Paste the
output.

## T-5 · Wire the sweep at its construction site (`daemon.ts:354`)

**Granted explicitly by the prime as an exception to the file boundary — two lines, no logic.**
`daemon.ts` otherwise remains forbidden, and two other streams hold declared regions in it
(`s092` bootstrap/lock path, `s095` at `:639-648`). **Touch only the `new AnomalySweep({...})`
argument object at `:354`.** Change nothing else in that file — not an import you do not need,
not a formatting pass, nothing.

Pass the watchdog projection and the `activityCredibility` function through, so the detector is
actually reachable in the daemon. Without this the fix is correct, tested, and inert in
production — which is the exact defect (V-3) this phase exists to fix.

---

## Gates — run ALL of them, not first-fail

```bash
cd /Users/jordanknight/pi-hacking/pij-worktrees/s097-silent-detectors
just typecheck
just lint
npx vitest run .pi/extensions/pij/core/anomalies.test.ts .pi/extensions/pij/core/daemon/anomaly-sweep.test.ts
```

`noUncheckedIndexedAccess` is **ON** — guard every index access. `.js` extension on all relative
imports (NodeNext/ESM). **No `any`.** Tagged-union returns over throws. Constants live next to
the data they constrain.

## Report back

- the diff, file by file
- the **mutation evidence** for T-2 (command, RED output, restore, GREEN) — not optional
- anything in this spec that was wrong, ambiguous, or that you had to decide for yourself
