# Plan 075 — task-set open/close asymmetry

**Stream**: s075 · **PM**: pij-unwilling-butterfly · **o-prime**: pij-wee-albatross
**Base**: main @ `fdf1687` · **Branch**: `s075/task-asymmetry`
**Brief**: `government/briefs/s075-task-asymmetry-brief.md` (sha verified at ack)

---

## 1. What the brief said, and what is actually true

The brief states the obligation "can only be cleared by the assignee running
first-person `pij report state`". **That is not what the code does.**

| claim | measured |
|---|---|
| the assignee can clear the obligation | **Nobody can.** `closeAssignment()` is a pure primitive whose own comment reads *"No caller exists today"* — no verb is wired to it |
| `report state done` discharges the assignment | It appends a `state-set` event and a `states[]` ref. It **never writes `closed`** |
| the ledger reflects work completed | **91 assignments in `~/.pij/assignments`; 91 open; 0 closed.** The `closed` field has never been written in production |

**The mechanism that hid this**: `anomalies.ts:178-180`

```ts
function isSemanticActive(chain: ChainState): boolean {
	return chain.state === undefined || chain.state === "ready";
}
```

Any declared state makes a seat non-active, so **`done` and `waiting` silence
`axis-disagreement` identically**. `report state done` *masks the detector*; it
does not *discharge the record*. The ledger has never been discharged once, and
it reads as healthy because the symptom is suppressed for an unrelated reason.

**This is the day's recurring shape at the ledger layer** — a silence that reads
as resolution (fourth instance: D-037 unexecuted comment, INS-001 unmeasured
"should", D-039 uncontested precedent, this).

So the mission is not "add the missing half of a lifecycle". **The lifecycle has
no far end at all.**

## 2. The two separations

1. **A real close** — wire an authority-scoped verb to the existing primitive.
2. **Masking vs discharging** — a declared state and a closed obligation are
   different facts and must stop being interchangeable.

Separation 1 is this stream. Separation 2 is **scoped out below** (§5) for a
reason that is itself load-bearing.

## 3. The authority rule (approved by o-prime, satisfies the third-party constraint)

> **You may close in the direction of your own authorship.**

| closer | reasons permitted | why it is legitimate |
|---|---|---|
| **assignee** (`assignment.nodeId`) | `done`, `failed` | first-person testimony about its own work — the thing the asymmetry existed to protect |
| **opener** (`assignment.opened.actor`) | `cancelled`, `superseded` | retracting a request it authored; it is not asserting anything about the work |

Everyone else: **`E-OWN`**, mirroring the ownership discipline `ack` already uses
(`cli.ts:3893`).

**No third party can ever launder a `done`** — the constraint is satisfied by
construction, not by policy, because `done` is unreachable from the opener's
authority set.

The four existing `ASSIGNMENT_CLOSE_REASONS` (`done | cancelled | failed |
superseded`) partition exactly along this line, which suggests the vocabulary was
designed for this split and only the wiring was never finished. **No new reason
values are needed.**

## 4. Answers to the o-prime's two required questions

### 4.1 Disposition of the 91 open records — **leave and mark; no backfill**

**Decision: do not close them, do not migrate them, do not script them.**

Grounded in existing repo doctrine rather than invented: JC-2 **D5-b's rejected
backfill**, and D5-d's *"the population converges by use, never by script"*
(`docs/plans/074-pij-rail-v2/tasks/phase-2-orchestration-role/tasks.md:88`).
A close is **testimony** — it carries an actor, a timestamp and a reason. Writing
91 of them would manufacture 91 facts about events that never happened, which is
precisely what D5-b rejected. The same argument that stopped a seat
self-designating `worker` stops this.

**Consequence, stated plainly so it is not a surprise later**: after this ships,
the ledger still shows ~91 permanently-open rows. That is honest — they *are*
open, and no one ever discharged them. The population converges as new work is
opened and closed under the new verb.

**The real hazard albatross named, and the guard for it**: the danger is not the
close verb (see 4.2 — it changes no detector). The danger is a *future* detector
for "open assignment never discharged", which would fire **91 times on day one**
— ~100% of the population. That is F-17's credibility failure exactly: a detector
that loud is one operators learn to scroll past, and it would arrive pre-poisoned.

> **Recorded constraint for whoever builds that detector: it must be
> epoch-bounded — only assignments opened after the close verb exists may flag.**
> Retroactive accusation over a period when compliance was *impossible* is not a
> signal.

### 4.2 Projection / chainglass contract — **no touch in this stream**

`anomalies.ts:451` already reads:

```ts
if (assignment.closed !== undefined) continue;
```

**The detector already honours `closed`.** Closing an assignment therefore clears
`axis-disagreement` through the *existing* predicate — no change to the anomaly
logic, no change to row text, no new field, no change to `list`/`node`
projections.

**So the core fix is a contract non-event.** Nothing to carry to chainglass.

The masking/discharging distinction in §5 **would** be a projection change (new
row text or a new field on axis rows). That is exactly why it is scoped out of
this stream rather than smuggled in: it needs ratification first, per the 089
lesson, and I will not ship a producer change against an unratified consumer.

## 5. Deliberately out of scope (with reasons)

- **A discharge detector** — see 4.1; must be epoch-bounded, and needs the §4.2
  ratification. Not this stream.
- **Changing `isSemanticActive`** so `done` differs from `waiting` — this is the
  masking/discharging fix proper. It is a genuine defect (a `done` seat and a
  `waiting` seat are not the same fact) but it moves anomaly semantics and is a
  contract touch. **Flag to o-prime → chainglass before any code.**
- **Reopen** — `materializeGeneralIfMissing` already notes reopen is "Phase 2".
  Out.
- **PA hooks** — explicitly forbidden by the brief.

## 6. Work plan

| # | task | proof |
|---|---|---|
| 1 | `pij task close <assignment-id> --reason <r>` — parse, dispatch, authority gate, wired to `closeAssignment()` through the same guarded platform-write path `state-set` uses (journal → store → spine → clear) | unit + CLI tests |
| 2 | Authority gate: assignee→`done\|failed`, opener→`cancelled\|superseded`, else `E-OWN` | **mutation proof (dim-0, mandatory)**: remove the gate and show a third party closing a `done` |
| 3 | Spine event kind for the close (`task-close`), so the discharge is auditable | event appears with actor + reason + refs |
| 4 | Enrollment: `FAMILY_SUBCOMMANDS`, `ALLOWED_FLAGS`, `MAX_POS`, Command union, parse, dispatch, **USAGE** | **name every registry touched in the gate report** (the enrollment-checklist class is real — omitting USAGE is what made `role` undiscoverable in s074) |
| 5 | Double-close, unknown reason, unknown id, closed-then-close → `E-ARG`/`E-OWN` with the offender named | tests |
| 6 | Verify `axis-disagreement` clears on close via the existing predicate | test asserting the row disappears, **and** mutation: re-open the record, row returns |

## 7. Gates

`harness checks` (full, not `--quick`) before any merge ask. Mutation proof
mandatory on tasks 2 and 6. Merge permission is **per-PR from Jordan, asked
directly by me** — never standing (D-039).

## 8. Open question for Jordan (non-blocking; does not gate tasks 1-6)

`report state done` currently leaves the obligation open forever. Under this plan
a seat must run **two** commands to finish work — `report state done` *and*
`task close --reason done`. Should `report state done` **auto-close** the
assignee's own assignment?

- **For**: one action, one fact; removes a step nobody will remember.
- **Against**: `done` is already overloaded (it silences the detector); coupling
  a ledger write to a status write is the kind of hidden side effect that made
  this defect invisible in the first place.

My lean is **against** for now — explicit discharge is the point of the stream —
but it is Jordan's call and it changes the ergonomics materially. Asked directly,
per the per-PR/ask-directly ruling.
