# Phase 4 tasks — `#114` · a seat that declared parked and then died is reported by nobody

**Stream**: s097 silent-detectors · **Depends on**: Phase 0+1 (the `activityCredibility`
injection lands there and is reused here).

**Files you may write**: `.pi/extensions/pij/core/anomalies.ts` ·
`.pi/extensions/pij/core/anomalies.test.ts`

---

## The defect — two correct rules whose intersection has no owner

`pij-certain-boa`, a worker with `semanticState: hold`, was confirmed dead: pid gone, terminal
`unrequested-by-pij`/`pid-missing`. **`pij anomalies` returned zero rows for it out of 5.**

Suppressed twice, by two individually-correct guards:

```ts
// anomalies.ts:406 — status-stale's park exemption
if (descriptor.semanticState !== undefined && descriptor.semanticState !== "ready") continue;
// intent: re-nudging a deliberate park punishes seats that did the right thing

// anomalies.ts:255 — isTerminallyObserved
return node.terminal !== undefined;   // once terminal, "it stopped polling" is not news
```

Each is defensible alone. Composed, **there is no rule whose job is "a parked seat died"**, and
you would have to reason about both exemptions together to notice.

**The platform documents the coverage it does not have.** `watchdog.ts:217-222`, on
`mutesWatchdogNudge`:

> MUTING IS NOT UNWATCHING. […] eligibility, liveness classification, the stall detector, and
> the dead/provider-failure axes are all untouched, **because a parked seat can still die and
> that must still be noticed.**

`#114` is the measurement that this promise is not kept.

## Ruling (prime, 2026-08-08) — do not bend either suppressor

> **Two correct rules whose intersection has no owner is a MISSING DETECTOR, not a broken one.**

Loosening `:406` alarms seats that correctly declared. Loosening `:255` re-flags every dead seat
forever. **Add a new row kind.** Its meaning stays narrow: *a seat that declared a parked state
and then died is reported by nobody* — the parked declaration is what makes its silence look
intentional forever.

---

## T-1 · The new row

Add a new member to `AnomalyKind`. **Name it for what it observed, not for a death** — see T-2.

Fires when **all** hold:

1. the seat's declared `semanticState` is **parked** per **`mutesWatchdogNudge`** — the
   canonical, exhaustive-by-construction predicate, already imported by this module. **Do not
   hand-roll `!== "ready"`**: that check is *broader* than the real park predicate (it also
   exempts `done`/`failed`/`cancelled`, which `mutesWatchdogNudge` deliberately does **not**
   treat as parked — *"a terminal claim is something to be VERIFIED, not a reason to stop
   watching"*).
2. `activityCredibility(...)` returns **`verdict: "superseded"`** — reuse the injected predicate
   from Phase 0+1. Do not re-derive terminal logic.
3. the cause is **not `close-requested`** — a pij-requested close is the operator's own
   deliberate act and is never news. `agent-absent` and `dissolved` are.

**`unavailable` needs no special handling here** — the contract already maps it to
`verdict: "unknown"` (cause `probe-unavailable`), which fails condition 2. That is the point of
consuming the predicate rather than reading `terminal` directly.

**Neither existing suppressor is modified.** Do not touch `:255` or `:406`.

## T-2 · The row must report an OBSERVATION, never assert a death

**This is the single most important requirement in this phase, and it is not stylistic.**

`terminal` is currently written by a **blind probe and never re-probed**. Measured on the live
fleet at 04:2xZ today:

- **31** registered seats match parked + terminal + not-requested.
- **2 of those 31 read `liveness: active`** — their agent is running **right now**.
- One of them (`pij-unwilling-butterfly`) has `lastEventAt` **still advancing every ~13s** while
  carrying a terminal record stamped 5 hours earlier.

So the input this row is built on is **wrong about ~6% of its population**, in the direction of
falsely declaring death.

Therefore the `detail` must say something like *"declared `hold`, and pij's last observation of
it was `pid-missing` at `<observedAt>`; nothing has re-checked since"* — **not** *"this seat is
dead"*. Render `credibility.reason` and use `credibility.asOf` for the age (that field exists so
you do not re-derive it). **Never parse `reason`** — branch on `cause`/`verdict` only.

The remedy line must tell the reader to **verify liveness before acting**, and must not offer an
irreversible action. `superseded` is a rendering verdict, **not a teardown authority**.

## T-3 · The 31-row first-run burst — an optional watermark, decided at the edge

On its first run this row would emit **31 alerts at once**, 25 of them from a single tmux crash
last night. The sweep alerts once per unseen `kind:node:evidence`, so it is a bounded migration
event rather than a recurring storm — but 31 simultaneous alerts on a board **whose credibility
is the entire point** is not acceptable as a default.

**Do not solve this by narrowing the detector** — a time-gate would suppress exactly the
long-silent deaths this row exists to find (`boa` went unnoticed for days; that is the case, not
the noise).

Instead add an **optional input**:

```ts
/** When set, only terminal observations at or after this instant produce a
 *  parked-death row. ABSENT = report every one, which is the correct default;
 *  the watermark exists so an operator can adopt the row without a backlog
 *  burst, and it is a ROLLOUT decision made at the edge, not a change to what
 *  the detector considers true. */
readonly parkedDeathSinceMs?: number;
```

The detector's semantics are unchanged when it is absent. **Do not wire a default anywhere** —
the orchestrator handles adoption.

## T-4 · Tests — LABELLED

| # | criterion | kind |
|---|---|---|
| 1 | parked + `superseded`/`agent-absent` → **fires the new kind** | **BEHAVIOURAL** |
| 2 | parked + `superseded`/**`close-requested`** → does not fire | preserved / scope-pin |
| 3 | **unparked** (`ready`) + `superseded` → does not fire | preserved / scope-pin |
| 4 | parked + `verdict: "current"` → does not fire | preserved / scope-pin |
| 5 | parked + `verdict: "unknown"` (`probe-unavailable`) → does not fire | preserved / scope-pin |
| 6 | `done`/`failed`/`cancelled` are **not** parked → does not fire | preserved / scope-pin |
| 7 | `parkedDeathSinceMs` set after the observation → does not fire; set before → fires | **BEHAVIOURAL** |
| 8 | both existing suppressors still suppress everything they did (`status-stale` + `isTerminallyObserved` regression) | **PRESERVED-PROPERTY** |
| 9 | `activityCredibility` absent ⇒ no row | preserved / scope-pin |
| — | the new `AnomalyKind` member compiles | **NEW-API** |

### Pre-fix verification — and a subtlety about how to do it here

Criterion 1 **cannot be written pre-fix in its final form**, because the new `AnomalyKind`
member does not exist (a NEW-API compile-time exception).

**Verify it pre-fix in the set-level form instead**: assert that `detectAnomalies` returns
**≥1 row** for the boa-shaped descriptor. Pre-fix that returns **zero** — which is exactly the
`#114` measurement — so it fails honestly.

**Then ship the member-level form.** A set-level assertion is safe as *pre-fix evidence* here
only because the set is provably **empty** pre-fix; it would be worthless as a shipped
assertion, because any future row for that seat would satisfy it. This is `F-603` applied
deliberately rather than accidentally — see the ledger.

**Mutation gate** on criteria 1 and 7: break the guard, RED, restore, GREEN. Paste the output.

---

## Gates

```bash
cd /Users/jordanknight/pi-hacking/pij-worktrees/s097-silent-detectors
just typecheck
just lint
npx vitest run .pi/extensions/pij/core/anomalies.test.ts
```

## Report back

diff · pre-fix failure output · mutation evidence · anything ambiguous you decided yourself.
