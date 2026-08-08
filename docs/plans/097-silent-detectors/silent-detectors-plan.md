# Silent Detectors — the anomaly board's uncovered complements
**Mode**: Full
**Plan Version**: 1.0.0
**Created**: 2026-08-08
**Status**: READY
**Stream**: `silent-detectors` (s097) · **Wave**: `w1-hardening` · **Prime**: `pij-continuing-ermine`
**Spec source**: unified (this file)

ℹ️ No `research-dossier.md`. Evidence is direct source verification in this worktree; every
citation below was re-derived from the file rather than copied from its issue, because **three
of the five issues carry drifted line numbers** (§ Citation drift).

## Business Specification

### Summary

Five open issues (`#114`, `#141`, `#154`, `#156`, `#125`) all report the same experience against
`core/anomalies.ts`: **a detector returned zero rows for a condition it was named for.** They are
usually read as five bugs in five detectors. They are not.

They are **three missing facts and one open measurement**. Every one of the individual guards
involved is *correct on its own terms* — none of them is a coding error, and per-rule review
passes each one. The defects live in the **intersections and complements** those correct rules
leave behind, which is precisely where per-rule review cannot look.

| # | detector | the complement nobody owns |
|---|---|---|
| `#154` | `inert-subscription` | a subscription whose **recipient** is dead (only the *trigger* is ever interrogated) |
| `#114` | *(none)* | a seat that **declared parked and then died** — suppressed twice, by two correct rules |
| `#141` | `status-stale` | **discipline vs availability** — the disambiguator exists, computed, and is off-channel |
| `#156` | `axis-disagreement` | a **standing** assignment's resting state, read as a lost dispatch |
| `#125` | `status-stale` | responding to the sensor satisfies the sensor's own activity test |

### The three facts

**Fact A — liveness is only ever a *suppressor*, never a *subject*.** (`#154`, `#114`)
`isTerminallyObserved` (`anomalies.ts:255`) exists solely to *skip*, and `inert-subscription`
resolves its watchers no further than `.length` (`anomalies.ts:340`). Nothing in the module
takes "this seat/watcher is dead" as the thing being *reported*.

**Fact B — the availability signal exists, is already reduced to a verdict, and is off-channel.**
(`#141`) `consecutiveSilentFires` is computed in the daemon and turned into `suspect`/`stalled`
at `watchdog.ts:201-202`. `WatchdogNodeView` (`anomalies.ts:132`) — the projection this module
already accepts — simply does not carry it. **The gap is channel, not computation.**

**Fact C — "standing vs bounded" is not a fact any record carries.** (`#156`) It is inferable
only from the deterministic id shape, which `axisRemedy` already does — but as a *text* branch,
not a *guard*.

**And one open measurement** (`#125`): what actually advances `lastEventAt` is unknown. Five
seats have proposed five mechanisms; the issue's own author instructs the next reader not to
trust any of them. It partly gates `#141`, since both rest on what that field means.

### Goals

- A subscription whose watchers are **all dead** produces a row (`#154`).
- A seat that **declared a parked state and then died unrequested** produces a row (`#114`).
- A `status-stale` row **states which failure it is** — discipline or availability (`#141`).
- A **standing** assignment's resting idleness **stops firing** `axis-disagreement`, while a
  bounded one idle past threshold **still fires** (`#156`).
- The `lastEventAt` emitter is **measured and written up**, not modelled (`#125`).
- Every fix ships with a test that **fails without it**.

### Non-Goals

- **Not** a change to `core/watchdog.ts` or `core/daemon/watchdog-manager.ts` — stream `s096`
  owns those. `consecutiveSilentFires` is **surfaced**, never recomputed.
- **Not** the `#156` store-level `standing`/`bounded` field. That issue stays **open**; this
  plan ships the tactical predicate in a shape that makes the real fix a one-function change.
- **Not** a patch for `#125`. Research and a findings document only.
- **Not** a loosening of either `#114` suppressor (ruled by the prime — see § Ruling A).
- **Not** any edit to `core/cli.ts` beyond the `WatchdogNodeView` projection build at `~:5527`.
- **Not** `#130` (whether an instrument should be scored on ever having surfaced anything) — a
  design question, deliberately held out of the wave.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `pij-control-plane` | existing | **modify** | Owns `core/anomalies.ts` — every detector changed or added here, plus the `anomalies` CLI verb's projection build |
| `pij-orchestration` | existing | **consume** | `mutesWatchdogNudge`, `generalAssignmentId`, `owesStatusCard`/`cardCanMislead` are read as the canonical predicates; none is changed |

### Testing Strategy

- **Approach**: TDD, per `.pi/extensions/pij/AGENTS.md` Pattern P8 — tests target the pure
  detector, never the wiring. `detectAnomalies` is already a pure function over injected
  inputs, so every case below is expressible as a fixture.
- **Rationale**: this plan adds **exemptions and detectors**, which are the two shapes with
  asymmetric failure. An exemption that quietly exempts everything, and a detector that fires on
  a healthy seat, both *pass* a test that only asserts the happy path. So every change ships as
  a **pair**: the case that must now fire, and the neighbouring case that must still not.

#### Every criterion is labelled, and only one kind is evidence of the fix

Adopted fleet-wide 2026-08-08 after three streams independently shipped, or nearly shipped,
criteria that could not fail:

| kind | requirement |
|---|---|
| **BEHAVIOURAL** | must **FAIL** on pre-fix code, and fail as a *failure*, not an error/crash |
| **NEW-API** | cannot fail first — it will not compile. Declared as a compile-time exception |
| **PRESERVED-PROPERTY** | must pass **before and after**. A regression guard, **never** evidence of the fix |

**The step is mechanical, not a judgement**: for each criterion, *run it against pre-fix code and
watch it fail*. Do not reason about it — reasoning about whether a test can fail uses the same
mental model that wrote the test, and is unreliable in **both** directions (one sibling stream
predicted a criterion could not fail first; it failed anyway).

**Measured recount for this stream**: of the 10 criteria in Phase 0+1, **3 are behavioural**,
1 is new-API, and 6 are preserved-property or negative scope-pins. *A table of ten green ticks
where three could ever have failed is worth three ticks.*

**And a criterion can be satisfied by a NEIGHBOUR** — see `F-603`. A first draft of Phase 1's
headline criterion **passed on pre-fix code**, because its fixture happened to trigger the
*existing* `inert-subscription` row, which shares the same `kind`. **An assertion over a SET is
not evidence about a MEMBER**, and any fix that *adds* a member to an existing set makes
set-level assertions uninformative **by construction** — knowable from the change shape before
the first assertion is written.

- **Mutation gate (absolute)**: for each fix, deleting the fix must make its behavioural test
  **fail**, demonstrated by running it. This is `#156`'s reviewer bar 2, adopted for all code
  items rather than just that one.
- **Tick discipline**: any change touching a repeated sweep pins the **no-op** rows — two
  consecutive ticks with an unchanged condition must alert **once**. The states nobody thought
  about are where the storm lives.

## Key Findings

### F-1 · `inert-subscription` never resolves a watcher id (`#154`)

`anomalies.ts:340` — `if (node.watchers.length === 0) continue;` is the only interrogation the
watcher list receives. `WatchdogNodeView.watchers` is `readonly SessionId[]` and is used
**only** for `.length` and `.join(", ")`. The detector therefore cannot know whether a recipient
exists.

**The fix needs no new input.** `detectAnomalies` already builds
`const byNode = new Map<string, SessionDescriptor>()` over `inputs.descriptors`
(`anomalies.ts:296-297`), and the `inert-subscription` block runs *after* it. Resolving
`byNode.get(watcherId)?.terminal` is a pure lookup over data already in hand — **no store read,
no projection change, no purity risk** (the s079 constraint that made `watchdog` an *input*
rather than a *probe* is untouched).

**Live instance in the issue**: `pij-continuing-ermine` — this wave's own prime — ran 42 hours
with its sole watcher (`pij-respectable-starfish`) terminal since `2026-08-06T01:31:59Z`.

### F-2 · The park exemption and the terminal exemption compose into a hole (`#114`)

Two guards, both correct, both cited by the issue:

- `anomalies.ts:406` — `if (descriptor.semanticState !== undefined && descriptor.semanticState !== "ready") continue;`
  (status-stale's park exemption: don't punish a seat that declared).
- `anomalies.ts:255` — `return node.terminal !== undefined;` (`isTerminallyObserved`: once
  terminal, "it stopped polling" is not news).

**The strongest evidence is in the platform's own source, not the issue.** `watchdog.ts:217-222`,
the doc comment on `mutesWatchdogNudge`, states the intended contract verbatim:

> MUTING IS NOT UNWATCHING. This suppresses one outbound nudge and nothing else — eligibility,
> liveness classification, the stall detector, and the dead/provider-failure axes are all
> untouched, **because a parked seat can still die and that must still be noticed.**

`#114` is the measurement that **this promise is not kept**: `pij-certain-boa`, `semanticState:
hold`, pid gone, terminal `unrequested-by-pij`/`pid-missing` — **zero rows out of five**. The
module documents the coverage it does not have.

### F-3 · A second, wider discrepancy at the same guard

`anomalies.ts:406` exempts on `semanticState !== "ready"`, which is **broader than the canonical
park predicate**. `mutesWatchdogNudge` (`watchdog.ts:231-249`) is exhaustive-by-construction and
deliberately treats `done` / `failed` / `cancelled` as **not parked** — *"a terminal claim is
something to be VERIFIED, not a reason to stop watching."* The status-stale guard exempts all
three anyway.

**Recorded, not fixed here.** It is a real divergence between two park predicates, but widening
`status-stale` is a scope change nobody has asked for and would fire on live seats. It belongs
in its own issue; § Phase 5 files it.

### F-4 · `axis-disagreement` has no assignment-kind guard (`#156`)

`anomalies.ts:604` — `if (idleMs <= threshold) continue;` is the last gate. There is **no**
check on assignment kind anywhere in the block. `axisRemedy` (`anomalies.ts:279-293`, landed by
`#149`) already computes `assignmentId === generalAssignmentId(nodeId)` — but only to choose
**wording**. `#149` changed what the row *says*, never *whether it fires*.

### F-5 · Citation drift — 3 of 5 issues

Verified in this worktree against `HEAD` of `s097/silent-detectors`:

| issue | cited | actual | drifted? |
|---|---|---|---|
| `#114` | `anomalies.ts:282` | `anomalies.ts:406` | **yes**, +124 |
| `#114` | `anomalies.ts:223` | `anomalies.ts:255` | **yes**, +32 |
| `#154` | `anomalies.ts:285-327` | `anomalies.ts:337-362` | **yes**, ~+52 |
| `#156` | `anomalies.ts:560-611` | `anomalies.ts:575-650` | **yes**, ~+15/+39 |
| `#141` | `watchdog.ts:186`, `:201-202` | exact | no |

Ledger row `F-600`.

## Rulings carried into this plan

### Ruling A — `#114` gets a NEW row kind (prime, 2026-08-08)

> Two correct rules whose intersection has no owner is a **missing detector**, not a broken one.

Neither suppressor is bent. Loosening `:406` alarms seats that correctly declared; loosening
`:255` re-flags every dead seat forever. The new row's meaning stays narrow: *a seat that
declared a parked state and then died is reported by nobody* — the parked declaration is what
makes its silence look intentional forever.

### Ruling B — `#156` ships tactical, as a named predicate (prime, 2026-08-08)

Not an inline id comparison. The call site must read as **the concept**, so that when the store
field lands, one function body changes and nothing else does — and so the fix **cannot claim more
than it delivers**.

### Ruling C — `#125` is research only (prime, 2026-08-08)

No patch. **Measure the emitter**; take no stated mechanism on trust. If the findings change
`#141`'s shape, report before implementing.

## External reviewer — `pij-defiant-damselfly` (o-prime, `ai-manu`)

Reported `#156` and **agreed to review this fix**. Bars set *before* work started:

1. **Key on the assignment being STANDING, not on the `asg-general` name pattern** — a
   name-keyed fix *"silently excludes standing work under a custom name, which my own PA has, so
   it would leave my seat exposed while appearing to fix the class."*
2. **The test must FAIL if the exemption is removed** — not merely pass with it present.
3. **A non-standing assignment idle past threshold must still fire** — *"the failure mode of this
   fix is a guard that quietly exempts everything."*

**Bars 2 and 3 are absolute and are met exactly.** **Bar 1 is met in spirit only** — the call
site keys on `isStandingAssignment(...)`, but today that predicate can only detect the
deterministic `asg-general-<node>` id, so **standing work under a custom assignment name remains
unprotected**. This limitation is stated in the PR body verbatim, not left to be discovered in
review. A reviewer who set a bar is owed the news of which part was not cleared.

## Independent validation — what it changed (2026-08-08)

The plan was reviewed before implementation by an independent reviewer (`gpt-5.6-terra`,
adversarial brief) and cross-checked against coordination from stream `s095`. **Two CRITICAL
findings were returned and both were re-verified from source by this author before acceptance.**
The plan below is the revised one; § Implementation Plan supersedes the original v1.0.0 phases.

| # | finding | verified | effect |
|---|---|---|---|
| V-1 | **`consecutiveSilentFires` is never persisted** — it lives only in `WatchdogManager`'s in-memory `RuntimeState` (`watchdog-manager.ts:54-57`). `WatchdogSidecar` (`core/types.ts:492-501`) has no such field, and `adapters/watchdog-store.ts:35-65` neither parses nor returns it. A manager restart zeroes it. | ✅ read both files | **Phase 2 is not implementable inside this stream's file ownership.** Escalated; **blocked** pending ruling. |
| V-2 | **`unavailable` means the observation itself failed**, not that anything died (`spawn-expectation.ts:88-107`); `unrequested-by-pij` means only *observed absence with no persisted pij close intent* — it does not distinguish a crash from a deliberate manual kill. | ✅ read source + `s095` coordination | Phase 4 excludes `unavailable` and **reports an observation, never asserts a death**. |
| V-3 | **The daemon sweep never builds the watchdog projection.** `AnomalySweepDeps` (`daemon/anomaly-sweep.ts:17-30`) has no watchdog store, and `tick()` calls `detectAnomalies` without `watchdog` (`:56-62`). | ✅ read both | **`inert-subscription` has never fired in the daemon** — it is CLI-only. New Phase 0. |
| V-4 | "Unresolvable watcher id = dead" is unsafe: watcher ids are **not** referentially validated (`core/cli.ts:2374-2377` validates only the *target*; the sidecar parser accepts any string). | ✅ read | Phase 1 treats unresolvable as **unknown**, a third bucket — never as dead. |
| V-5 | Phase 3 does not close `#156` — `status-stale` independently fires on the same standing seat. | ✅ the issue says so | Stated as an explicit non-closure. |
| V-6 | Several of this plan's own "actual" citations were slightly off. | ✅ | Corrected in § F-5 and throughout. |

**Descriptor scope was checked and is safe**: both call sites pass the *full* registry
(`core/cli.ts:5518-5523`, `daemon/anomaly-sweep.ts:52`), so `byNode` is never a scoped subset.

### V-7 · A live instance, and a sixth manifestation of Fact A

Reported by `s095` and **verified here by direct measurement**: `status-stale` fires every ~2
minutes against `pij-unwilling-butterfly` claiming it *"has been working for 1141min"*. The seat
is **dead** — `liveness: dead`, terminal `unrequested-by-pij`/`pid-missing` stamped
`2026-08-07T23:14:05Z` — and its descriptor still reads `state: working`.

**`isTerminallyObserved` is called at only 2 of the module's 10 detector sites** — `spawn-limbo`
(`anomalies.ts:507`) and `inbox-poll-stalled` (`:537`). `status-stale` does not consult it. Its
own doc comment (`:243-253`) says *"LIVENESS anomalies must never fire for one."*

**And the row can never age out**, which is the part that was not previously understood. Measured
live, 8 samples at 8s:

```
04:10:55.427  →  04:11:08.902  →  04:11:20.670  →  04:11:37.564  →  04:11:52.705
```

`lastEventAt` is **still advancing every ~13-16s on a seat whose pid is gone**, because
`observeActivity` (`daemon/loop.ts:158-176`) refreshes it whenever the daemon sees the **pane**
readiness `busy` and has **no terminal guard**. An orphaned busy pane keeps a corpse permanently
inside `status-stale`'s gate 1. **Fixing the consumer is this stream's job; the `loop.ts` guard is
not ours and is not touched** (reported to the prime).

`s095` has ruled it will **not** clean up the `state` field to make the row behave — that would
silence the detector without fixing it, and mask the same defect in every other consumer.

## Implementation Plan

Sequenced. **Phase 0 and Phase 1 land together and first** — a `#154` fix that never reaches the
alert path is not a fix (V-3).

### Phase 0 — the sweep must actually run these detectors (V-3)

- Add an **optional** watchdog-store dependency to `AnomalySweepDeps` and build the same
  projection the CLI builds, so `inert-subscription` fires in the daemon path.
- **Optional by construction**: absent ⇒ today's behaviour exactly, so no existing caller or
  test changes meaning.
- `anomaly-sweep.ts` was **not assigned to any stream** in the wave partition; claimed with the
  prime notified, as it is the anomalies subsystem.

**Tests**: sweep with a watchdog projection emits `inert-subscription` · sweep without one
behaves exactly as today.

### Phase 1 — `#154` · `inert-subscription` gains a recipient check

- Resolve each `watcherId` through the existing `byNode` map into **three** buckets:
  **live** · **terminal-observed** · **unresolvable** (V-4 — an unregistered id is *unknown*, not
  dead; watcher ids are never referentially validated at write time).
- Emit when **zero watchers are live**. That is exactly `#154`'s claim (*"every watcher is a
  terminated session"*), and it is the condition under which the subscription delivers to nobody.
- **Deliberate scope decision — partial degradation does not fire.** One live watcher still
  receives every notice; a row for "you have fewer readers than you configured" is a different,
  much noisier signal about subscription *integrity* rather than *delivery*. Recorded as a known
  gap rather than smuggled in (F-17: a detector nobody believes is worse than none).
- `watchers.length === 0` keeps its meaning — **unwatched by choice is healthy** — untouched.
- The `detail` must be **distinguishable from the paused-trigger row** and must **name the
  composition** (how many terminal, how many unresolvable). Its remedy is re-subscribing a live
  watcher, not resuming a pause.
- **Reports observations, not deaths** (V-2): a watcher counts as terminal-observed on the
  strength of a *record*, which 2 of 31 sampled seats currently carry while running.

**Tests**: all-watchers-terminal fires · one-live-watcher does **not** · zero-watchers does
**not** · unresolvable ids counted separately and never as dead · a watcher whose terminal
disposition is `unavailable` does **not** count as dead · paused-trigger row unchanged.

### Phase 2 — `#141` · **BLOCKED** (V-1)

**Not implementable as briefed.** `consecutiveSilentFires` is in-memory only; there is nothing
durable at the `cli.ts:5527` I/O edge to project. Making it durable requires
`watchdog-manager.ts` (stream `s096`) and/or `core/types.ts` (stream `s095`) — both explicitly
out of bounds for this stream.

Escalated to the prime with three options (hold for `s096` · ask `s096` to persist it · other).
**No code until ruled.**

When unblocked, two things carry over from Phase 5's research, and they change the design:

- **The row must not claim *discipline*.** `lastEventAt` measures *pane busy-ness*, not work, so
  a fresh value cannot distinguish "working and not reporting" from "draining a nudge queue" —
  which is the precise misdiagnosis `#141` itself reports. Unanswered nudges support
  **availability** positively; answered nudges support only *"reachable"*.
- Any surfaced counter must be **durable across a manager restart**, or the row will read
  "answered" for every seat after any daemon bounce.

### Phase 3 — `#156` · `isStandingAssignment` guard (tactical)

```ts
function isStandingAssignment(assignment: Assignment): boolean {
    // TODAY: only a general assignment is detectably standing.
    // FUTURE: a store-level standing/bounded flag (#156) replaces this body.
    return assignment.id === generalAssignmentId(assignment.nodeId);
}
```

- Guard `axis-disagreement` on it, at the block in `anomalies.ts:575-650`.
- `axisRemedy`'s existing text branch is refactored to call the **same predicate**, so the
  concept has exactly one definition. (Its behaviour is unchanged; `#149` stays landed.)
- The doc comment states the partiality explicitly — the code says what it cannot do.

**Tests** (reviewer bars 2 and 3, exactly): standing assignment idle past threshold does **not**
fire · **bounded** assignment idle past threshold **still fires** · removing the guard makes the
first test **fail** (mutation-verified, run and recorded).

### Phase 4 — `#114` · a new row kind for parked-and-died

- New `AnomalyKind`. Fires when **all** hold:
  - the seat's declared `semanticState` is **parked** per `mutesWatchdogNudge` — the canonical,
    exhaustive-by-construction predicate, **not** a hand-rolled `!== "ready"`;
  - the seat is **terminally observed**;
  - the terminal disposition is **not `requested`** — a requested close is the operator's own
    deliberate act and is never news. `unrequested-by-pij` and `unavailable` are.
- Neither existing suppressor is modified (Ruling A).
- Latching: evidence must not be a constant, or the sweep alerts once and never again — follow
  the `status-stale` precedent (`anomalies.ts:461-466`) and carry a value that changes as the
  condition worsens or recurs.

**Tests**: parked + unrequested-terminal fires · parked + **requested** terminal does **not** ·
**unparked** + unrequested-terminal does **not** (that is the watchdog's existing jurisdiction) ·
parked + live does **not** · the two existing suppressors still suppress everything they did.

### Phase 5 — `#125` · measure the `lastEventAt` emitter (research)

Deliverable: `docs/plans/097-silent-detectors/lasteventat-findings.md`. **No code.**

- **Measure first, read second.** A fixed-cadence multi-seat sampler is already running
  (25 live seats, 5s interval) recording `lastEventAt` against wall clock for seats doing no
  work, so a periodic tick is separable from turn-boundary advancement.
- Then locate and read the **emitter** — the write site — and reconcile it against the samples.
  A mechanism is only reported if the sample data and the source agree.
- Explicitly test the issue's four candidates, including the best-supported one, and `#115`
  (`lastEventAt` reading `null` while a transcript shows completed turns).
- **State confidence and the counter-evidence.** Five seats have produced five mechanisms here;
  a sixth confident narrative is the failure mode. Anything unresolved ships as *open*.
- Also file the **F-3 park-predicate divergence** as its own issue.

## Risks

| risk | mitigation |
|---|---|
| An exemption (`#156`) quietly exempts everything | Reviewer bar 3 as a standing test: a bounded idle assignment must still fire. Mutation-verified. |
| A new detector (`#114`) fires on healthy seats and burns the board's credibility | Narrow by construction: parked **and** terminal **and** not-requested. Four negative tests. |
| The `cli.ts` projection edit collides with stream `s093` | Confined to the projection build at `~:5527`; their regions are `~325`/`~4212-4253`. Prime notified when green, sequences the merge. |
| `#141` is built on a misunderstanding of `lastEventAt` | Phase 5 gates Phase 2's wording; report to prime if the measurement changes its shape. |
| A confident-but-false mechanism claim in `#125` | Nothing asserted that was not run. Unresolved ⇒ shipped as open. |

## Definition of Done

- A **green PR** per item, each with a test that **fails without the fix**, verified with
  `gh pr view <n> --json statusCheckRollup` (**not** `gh pr checks` — it reports superseded runs).
- `#125` delivers a findings document instead of code.
- `harness checks` green before any "done" claim.
- Ledger rows appended to `docs/how/fleet/ledger.md` in the `F-600`/`W-600`/`S-600` block.
- **No merge.** The prime holds merge order.
