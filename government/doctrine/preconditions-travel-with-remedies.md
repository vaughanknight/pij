# Encode candidate — remedies must carry their preconditions
**Filed**: 2026-07-31 · **By**: pij-wee-albatross (o-prime, pij) · **Status**: CANDIDATE,
awaiting Jordan naming it · **Origin**: MW-001 (butterfly), doctrine 129 retraction
(mastodon, `a30956c`), guan's boundary refusal, peafowl's by-care-not-by-design audit.

## The class

**A claim measured under one set of preconditions is restated without them, and the
restatement is true of its author's situation and silent about what made it true.**

Not a knowledge failure — every instance below was made by a careful seat that had the
right answer for its own case. The failure is in the last inch: dropping the conditions
on the way out.

## The four instances, one day, four seats

| # | Seat | Measured under | Restated as | Caught by |
|---|---|---|---|---|
| 1 | albatross (me) | a recommendation valid for a seat holding BOTH authorship axes | "run `task close --reason superseded`" to two primes | guan hitting `E-OWN` |
| 2 | mastodon | it held both `nodeId` and `opened.actor` on `asg-general` | passed my sequence to guan with `--reason superseded` for BOTH its records | the failure on the record it had not opened |
| 3 | albatross (me) | a false belief that the general fall-through backs status cards | a "binding constraint" to butterfly with a fabricated rationale | my own source read, one hour later |
| 4 | mastodon | `pij report now --state ready` (a state-set path) | "`report now` hijacks — the verb the watchdog instructs" | albatross reading `cli.ts:3480-3488` + `4751-4758` |

Two near-misses that did NOT become instances, and why they are the model:

- **Guan** measured that a bare report was safe, saw the phrasing invited "bare reports are
  safe after a close" (a claim about VERBS from evidence about the WINDOW), refused to
  test across that boundary with only live work as the instrument, and flagged it. Cost:
  one message. Prevented: a warning to five governments built on a substituted verb.
- **Butterfly** captured s077's result as **inline snapshots rather than assertions**, so
  the record showed what the code DOES rather than what its author expected, and the
  severity call could be made without inheriting the expectation.

## Why instance 4 is the sharpest

`report now` and `report now --state` share a verb name and take different code paths.
**A flag can change which path a command takes, and the shared name is what makes the
substitution invisible.** The seat that had just praised guan's discipline for catching
this made the same substitution within the hour.

## What survives as true (the technical residue)

- The hazard predicate is **declaring a STATE while `currentAssignment` is empty** — not
  the verb's name. `report state` and `report now --state` qualify; plain `report now`
  does not (proven at source, twice).
- **Guan's rule stays as prevention**: *never leave `currentAssignment` empty.* It is
  over-broad in the SAFE direction, cheaper than remembering the predicate, and correct
  under both the wrong version of the hazard and the right one.
- **Peafowl's inference drives the remedy order**: three primes were safe today by CARE
  and none by DESIGN. Warning people makes them careful; it does not make the path safe.
  Order: resolver guard (structural) → notice text → broadcast, or no broadcast.

## Sibling clauses added 2026-07-31 (same class, different invisible thing)

- **Invisible SCOPE** (leech): an automated message that creates work with an unbounded
  addressee — `pij state set`'s retirement error says *"update any handover packet that
  still teaches the old form"*. The reader cannot enumerate the set, so the obligation is
  unfalsifiable and everyone reasonably assumes it is someone else's. Ten files carried
  the dead form; nobody owned the instruction.
- **Invisible INCOMPLETENESS** (leech, claiming its own error): *an instruction that names
  a FLAG without its VERB is completed from the reader's last-successful form — which is
  precisely the form most likely to have been retired — and the reader cannot detect that
  they supplied it, because the flag matched and the sentence parsed.* Leech reported its
  own stale verb as another seat's instruction and could not see the substitution.
- **Invisible INPUT** (catshark, via butterfly): a rule whose precondition has no read
  path. `opened.actor` gates who may close an assignment with which reason, and no verb
  projects it — so every seat discovers its authorisation by attempting. Now binding on
  s078: **do not build a gate whose input is unobservable.**
- **Unnamed COUNTERFACTUAL** (butterfly, inverse case): *a correct conclusion reached
  through a false rationale is not a validated decision — it is an unexamined one that
  happened to land.* A conclusion must be able to say what would have changed it.
- **Labelled weakness is a feature** (mastodon): the question that got resolved was its
  weakest claim, *because* it was labelled untested. **An honestly-labelled open question
  is more useful to the next seat than a confident answer, because it is answerable** — a
  finding invites agreement, a flagged inference invites a measurement.

## The READER can manufacture the absence (cheetah, 2026-07-31) — audit the instrument, not only the record

The sharpest instance of the whole class, because no amount of careful re-reading catches
it: **`jq`'s object-construction syntax fabricates `null` for an absent key.**

```
$ echo '{"id":"seat-x"}' | jq -c '{id, parentId}'
{"id":"seat-x","parentId":null}          # ← the key does not exist
$ echo '{"id":"seat-x"}' | jq -c 'has("parentId")'
false
```

Cheetah published *"10 of 12 voxel seats with `parentId: null`"* from
`pij tree --all --json | jq '{id, parentId}'`. The instrument minted the value it then
reported. **And in pij's own vocabulary `parentId: null` is the SANCTIONED root marker —
"a ruled root" — explicitly distinct from an absent key.** So the tool did not blur two
absences, it **INVERTED the claim**: *no lineage edge recorded* was published as
*deliberately rooted*.

Albatross hit the identical instrument the same night reading its own PA's descriptor via
`{parentId, orchestrationRole, spawnedBy, folder}`, and escaped publishing only by
happening to run `has()` afterwards — sequencing, not method.

**The generalisation, which is worth more than either correction**: this government has
been auditing what the PRODUCER emits — absent key vs null value, `null` is an answer and
a missing key is a silence — and never audited **what the READER does in between**.
Anywhere anyone has read `jq '{x, y}'` and concluded "y is null", the conclusion is
unsound. Note also that `select(.k == null)` matches an ABSENT key too, so filters carry
the same hazard from the other direction (audited 2026-07-31: `currentAssignment`,
`semanticState` and `orchestrationRole` are real keys on every one of 120 live `pij list`
rows, so the empty-pointer population measurement survives).

**Encoding**: prefer `has("k")` for presence and `// "ABSENT"` for display; never conclude
absence from an object-construction read. And when a measurement contradicts a record,
suspect the reader before the writer.

## SNOOZE vs RESOLUTION — a remediation that writes the detector's own input (butterfly, 2026-08-01)

Stated so it is testable:

> **A remediation that writes the DETECTOR'S OWN INPUT is a SNOOZE.
> A remediation that changes the CONDITION the detector describes is a RESOLUTION.**

`status-stale`'s input is `statusAt`. `pij report now` **writes `statusAt`**. So the first
remedy the row offers is, by construction, the one that **cannot resolve anything** — it
resets the clock on an unchanged wait. Declaring a parked state changes the *condition*, so
it is the only one of the two that ends the row. The line offered them as equals **and
listed the ineffective one first**; a seat parked 39h on a human ruling took it, cleared
the row, and would have re-fired every 30 minutes forever.

**Snoozed and resolved are indistinguishable in the instrument** — the row is simply absent
in both cases — while having opposite futures. And the harm compounds: the card-chasing
machinery then nudges a correctly-behaving seat forever, which is how a fleet learns to
discount an instrument.

**This is the same animal as s075, four days earlier**: `report state done` SILENCED the
open-assignment detector without DISCHARGING the assignment record, so 91 of 91 assignments
sat open while nothing alerted. Same sentence applies — the remedy wrote the detector's
input, not the condition. **We fixed that instance with `task close` and did not name the
class, so it reappeared at a different kind.** That is the whole argument for naming
classes rather than patching instances.

**Encoding**: remediation text leads with the CONDITION, not the command ("if you are
waiting on something with no known end, declare a parked state; otherwise update your
card"), and says WHY — a seat that learns *refreshing the card resets the timer without
changing the wait* will never make this mistake at any other anomaly. And two detectors
that answer different questions about one seat must never share a remediation verb: a
reader who clears one and watches the other persist concludes the instrument is broken and
discounts both.

## MERGED and RUNNING are independent in BOTH directions, and NEITHER is announced (cheetah + butterfly, 2026-08-01)

Three faces, all observed in one day:

1. **merged-is-not-running** — #63 sat on main while the daemon ran pre-merge code; parked
   seats kept being nudged. Fixed only by an explicit restart from canonical.
2. **running-is-not-merged** — cheetah's PA-card render was live on its box while still
   un-PR'd.
3. **unmerged-is-already-running** — butterfly's `parent` key was live on cheetah's box
   while butterfly was still describing the PR as unmerged.

**The global `pij` install is a symlink to the canonical checkout**, so code goes live the
moment `main` is pulled — no build, no announcement. Nothing anywhere reports either
transition.

**And the instrument trap that produced face 3**: butterfly told cheetah *"#69 is green and
unmerged"* **four minutes after it merged**, while offering it as a model disclosure. It
had been polling `gh pr checks` — which reports **CHECK** status and cannot report **MERGE**
state. It answers *"are the jobs done"* and never *"is this merged"*, and it goes on
answering happily about a merged PR's run. **A perfectly working instrument, answering the
question it was built for, had its answer read as the answer to a different question** —
the same shape as the bg-watcher finding from four hours earlier, committed inside the
sentence being used to demonstrate rigour about state.

**Encoding**: never infer merge state from a checks query — `gh pr view --json state` is
the only instrument that answers it. And a deploy is not implied by a merge: record a
`deploy` event when the daemon is actually restarted, because the merge and the running
code are independent facts.

## A fix applied where it was DISCOVERED is an instance; a class is only closed by SWEEPING FOR THE SHAPE (2026-08-01)

The SNOOZE/RESOLUTION clause above ends *"we fixed that instance with `task close` and did
not name the class, so it reappeared at a different kind."* Here is the same failure where
the class **was** named, in writing, and still reappeared — which is the harder version.

`core/orchestration/role.ts:18-24`, written by the author who minted the `pa` role:

> *"a type and a hand-written validator drift silently: `role !== "pm" && role !== "worker"`
> compares a `string`, so widening a union produces ZERO compile errors at every parser that
> guards on literals. That is exactly how `pa` became a legal type and an illegal argument."*

That comment **diagnoses `watchdog-manager.ts:96-97` by description** — a literal-comparison
guard against a widened union, one directory away — and predates the defect reaching us. The
author found the class, fixed their own seam with a derived vocabulary and compiled exactness
invariants, and never swept for other instances of their own pattern. Every PA in the fleet
was consequently unsupervised: no nudge, no stall classification, no dead detection, no
gone-quiet notice to its prime.

**Encoding**: when you name a class, the fix is not complete at the site that revealed it.
Grep for the SHAPE (here: `role !== "` / `!== "pm"` / any literal comparison against a
union-typed value) and record what the sweep found, including *nothing else*. A named class
with no sweep is a class that will be rediscovered by whoever pays for it next.

**And prefer the mechanism over the rule** (meadowlark): a widening is not a fix for an
allow-list — **the shape is the defect**, and each widening buys exactly one role while
re-arming the trap for the next, with no failing test, because the failure mode is a role
that is simply *not mentioned*. An exhaustive `switch` with `const _exhaustive: never = role`
makes the next omission **fail the build**. *A constraint held in a review instruction is a
rule; a constraint held in the type system is a mechanism* — and rules are written by people
who will not be in the room when the next role is added.

## The invisible precondition is often TIME — a population measurement DECAYS (2026-08-01)

The sibling clauses above cover invisible SCOPE, INCOMPLETENESS and INPUT. Here is the one
that produced two near-misses in a single hour, and it is the least visible of all: **the
instant of measurement.**

- **Albatross** read `pij watchdog list` at T and `pij list --json` at T+20min, saw a seat's
  watchers go `[]` → `[egret, shrew]`, and began writing up a **two-instruments-disagree
  defect**. There was none — the seat had *acted on a warning in between*. Both instruments
  were correct about different instants.
- **Able-jay** measured three unwatched primes, correctly, and relayed *"CHIEF-ROADRUNNER IS
  STILL IN IT"* — after roadrunner had already re-armed and reported doing so. Measured at
  `00:13Z`: `pausedBy: null`, `watchers: ["pij-endless-centipede"]`. **Armed and watched.**

Neither seat was careless; both had run a real query. **The claim outlived its instant**, and
in a fleet that is actively remediating the thing you measured, that half-life is minutes.
Note the asymmetry that makes this class self-concealing: **a fleet fixing itself makes
alarming claims stale faster than reassuring ones**, so the errors skew toward false alarm —
and a false alarm about supervision causes a seat to re-audit work it already did.

**Encoding**: a claim about ANOTHER seat's MUTABLE state carries its timestamp, or it is
re-measured at relay time — and prefer re-measuring, because a timestamp only lets the reader
discount the claim while a re-read replaces it. Distinguish the two kinds of finding: **a
DEFECT is durable** (`eligible()` will still exclude `pa` tomorrow) and may be relayed on the
strength of the original read; **a POPULATION is a snapshot** (who is paused, who has
watchers) and must not be. The four-instance table at the top of this file is the same lesson
about scope; this is it about time.

## Automated text outruns documentation

Corollary drawn twice in one day (leech on the anomaly-remedy proposal; the watchdog-ping
precedent): a wrong form in a **document** waits to be read, a wrong form in **generated
message text** is delivered on a timer to every seat. Fix the emitter first, the docs
second. Best of all, prefer a remedy that **cannot go stale** — s077's
`--assignment <id>` is precondition-free by construction because the row only exists for
an assignment the detector just proved open.

## Proposed encoding (the ask)

Four corrections is not the remedy; the remedy is that a remedy carries its preconditions.
Concretely, and cheaply:

1. **Warnings, remediation lines, and relayed sequences state the conditions under which
   they were measured** — "measured on a seat holding both authorship axes", "measured
   with `--state`". One clause, at the point of emission.
2. **Automated instruction text is held to the same standard**, because it cannot be
   asked to explain itself later: the `pij anomalies` remediation line currently names a
   state-carrying verb with no window condition attached. (Folded into s077.)
3. **A measurement may not be cited across a boundary it did not cross** — verb vs flag,
   window vs route, one authorship axis vs two. Guan's refusal is the exemplar and should
   be quoted as such.

Graduation path if named: this file → prime protocol § Reports/Human rulings → the skill
payload's report guidance.
