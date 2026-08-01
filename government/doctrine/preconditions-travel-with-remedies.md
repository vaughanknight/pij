# Encode candidate — remedies must carry their preconditions
**Filed**: 2026-07-31 · **By**: pij-wee-albatross (o-prime, pij) · **Status**: CANDIDATE,
awaiting Jordan naming it · **Origin**: MW-001 (butterfly), doctrine 129 retraction
(mastodon, `a30956c`), guan's boundary refusal, peafowl's by-care-not-by-design audit.

## CLOSING SYNTHESIS, 2026-08-01 — mechanism is not self-correcting either (butterfly)

Recorded at the top because it revises this file's own central conclusion.

We spent the week proving that **written lessons do not prevent recurrence and only mechanism
does** — the exhaustive switch over a review instruction, the type check over a rule. Tonight
showed the other half. **The last four defects were all in the ENFORCEMENT layer, not the
product:**

1. a **gate** that excluded a role before any logic ran (every PA unsupervised, silently)
2. an **emitter** transmitting a ruling the human had overturned, on a timer, for a full day
3. a **remediation** offering, first, the option that cannot resolve the condition
4. very nearly a **remediation** offering an option **untrue for everyone who receives it**

> **MECHANISM IS NOT SELF-CORRECTING EITHER — and a wrong mechanism is WORSE than a wrong
> document, because it speaks with schedule and authority and nobody reads it as an opinion.**

So the pairing is: *a document fails to correct you; an enforcer actively teaches you the wrong
thing.* Encoding something mechanically moves where the staleness lives, it does not remove it —
hence the filed ask that **every emitter carry a freshness check against the ruling that
authorises it**, and that remediation text carry its fire instant.

**And the property that actually caught all four was not a mechanism at all.** Every one was
found by someone **MEASURING rather than reviewing**, and three of the four by a seat
**contradicting its own prime**:

- a flash-tier PA answered a yes/no honestly against a system three seats and four green fields
  said was working;
- a PM verified its prime's constraint at source and pulled a clause the prime had ordered;
- a prime retracted its own escalation after its PA disproved it;
- two primes and this author each published a finding and then had it corrected by a subordinate.

**That is a NORM, not a mechanism: peers may contradict authority with evidence.** It is the one
thing here that cannot be encoded as a test, it is what every clause in this file depended on to
get written, and it is therefore the property most worth protecting — *including from the seat
at the top, whose instructions were wrong twice tonight and were caught both times from below.*

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

## THE CAPABILITY MODEL CLASSIFIES WHAT A VERB CHANGES AND NEVER WHAT IT REVEALS (meadowlark, 2026-08-01)

**Privilege and exposure are inverted in the current design.**

`PA_VERB_CLASSIFICATION` gates a PA's **actuation**: it refuses `dispatch-packet`,
`spine-append`, project writes, the whole `watchdog` family — even `ack-dispatch`, on the
ground that *"acknowledging a brief is the assignee's own act."* **A seat deemed too junior to
acknowledge its own brief.**

And the capture mechanism hands that same seat a **standing, effectively unbounded READ of its
prime's pane** — for a governing seat, that is **the human's typed rulings, verbatim, at
20-minute resolution.**

> **The seat we trust least with verbs is the seat we give the most sensitive content to. The
> gate governs ACTUATION and ignores OBSERVATION.**

**This is not a bound-tuning problem and `maxBytes` does not reach it.** It is a **missing axis
in the capability model** — the same misclassification already routed once (family-granularity
refusal on the write side), reappearing on the **read** side. And the tier choice sharpens it:
PAs are deliberately cheap models, so **the least-privileged seat in a government holds the most
sensitive content in it.**

**Already live, not prospective** — `pij-able-egret` learned Jordan had ruled to another
government by reading his instruction out of a capture, and refused to act on it. **A control
that depends on every receiving seat choosing correctly is not a control; it is a hope with a
good track record.** *Egret's refusal is admirable and it is also the single point of failure.*

**Encoding**: classify capabilities on **two** axes — what a verb CHANGES and what it REVEALS —
and derive read-side limits from the second. A gate built only on mutation will pass a seat that
can see everything and touch nothing, which is a coherent design **only if someone chose it.**

## THE SAME FIX IS RIGHT AT ONE EMITTER AND WRONG AT THE OTHER — audience, not symmetry (butterfly, 2026-08-01)

One clause — *"name `ready` alongside `done`"* — was dispatched to two emitters of what looked
like the same false dichotomy. **It was correct at one and worse-than-useless at the other, and
only measuring each AUDIENCE separately showed which:**

| emitter | who receives it | verdict |
|---|---|---|
| the watchdog nudge | fires on **silence** → reaches **idle** seats | `ready` is TRUE there — **keep** |
| `status-stale` | *"only judge a seat that is busy RIGHT NOW"* (`anomalies.ts`) → reaches **working** seats | `ready` is FALSE for the row's **entire population** — **pull** |

**Fixing by symmetry would have been wrong in exactly one of the two places**, and nothing in the
text of either string distinguishes them — the difference is in *who the emitter can reach*, which
lives in the trigger, not the copy.

**Encoding**: before applying one remedy to several emitters of "the same" defect, derive each
emitter's **audience** from its trigger condition and ask whether the remedy is true for that
population. And record the asymmetric verdict *in the PR*, or a reviewer reads two opposite
decisions about one word as inconsistency rather than as measurement.

**Third-order note on the remedy that was pulled**: it was not merely ineffective — declaring
`ready` does not mute the nudge, does not exempt the row, and **does not even snooze it**
(`report state` never writes `statusAt`). *A remedy that changes literally nothing is a fourth
kind, distinct from the snooze:* the snooze at least clears the row and hides the condition; this
one leaves the row standing while the seat believes it complied. **The seat then learns the
instrument is broken — from having done exactly what it was told.**

## A GUARD THAT REPORTS FAILURE AND EXITS 0 IS NOT A GUARD (butterfly, self-disclosed)

Butterfly's gate-and-push chain **printed FAILED and pushed anyway**: its script reported the
failure in stdout but **exited 0**, so the `&&` continued. The failure was a transient
tmux-socket test and the pushed commit was independently re-verified sound (3874 passed) — *but
the guard it had was not a guard.*

**Exit status is the only thing a shell chain reads.** A script that reports failure in prose and
exits 0 is a **success-shaped failure** in the tooling layer — the same class this file catalogues
in records and instruments, one level down, and it will hold as "verified" indefinitely because
the chain it guards never disagrees with it. Disclosed rather than left to stand, which is the
behaviour that makes the rest of a seat's verifications worth believing.

## THE MISSING EVENT — a family, not a bug (cheetah's framing, roadrunner's instances, 2026-08-01)

> **THE RECORD DOES NOT ROT BECAUSE SOMEONE LIED; IT ROTS BECAUSE THE TRANSITION THAT SHOULD
> HAVE UPDATED IT IS NOT AN EVENT ANYWHERE.**

Four instances found in one day, all the same shape — **the mechanism that would have corrected
the record does not exist, rather than having failed**:

| record | why it rots |
|---|---|
| `statusWrittenBy` | a writer predating the field advances seq and cannot clear a field it never heard of |
| a declared park | the staleness exemption has no expiry and no liveness cross-check |
| `currentTask` | clears only on `task close`, which never fires when a stream changes **PHASE** |
| a standing assignment | has **no terminal event at all**, so a work-or-done prompt forces a false declaration |

**Every field looks confident and current**, which is why review never catches them: there is no
error state to notice, only a true-sounding value that stopped being true.

**And the distinction changes the fix: A BROKEN CHECKER GETS REPAIRED; A MISSING EVENT HAS TO BE
CREATED.**

**The cost, measured** (instance 3): an assignment read *"pre-amble discovery only, no product
code"* through an entire plan, two PRs and every commit since — **days of product code under a
record saying there would be none**, past four merges and two contract ratifications. Nobody
lied. The discovery-to-build transition simply is not an event, so nothing asked. It was closed
as **SUPERSEDED rather than edited**, so the phase change is itself recorded.

**The remedy that was correctly REFUSED, and this is the sharpest part**: a lint on seats
authoring commits under a task string containing *"no product code"* was offered and declined —
*"it would have caught this exact instance and taught us the class was handled, which is worse
than not catching it."* **A checker that pattern-matches one instance of a missing-event class
converts an open hole into a closed-looking one.** Prose cannot be verified against work. The
honest version is a **re-scope prompt at phase boundaries** — when a stream changes phase,
something has to ask. *That is a new event, which is what the family actually needs.*

**Instance 4 as a design rule**: the watchdog nudge offered *keep going* or *`report state
done`*. A seat on a standing assignment has no completion to declare, so **a prompt that offers
only wrong answers gets wrong answers from honest seats — and the ones who answer accurately
look non-compliant.** Fix routed (name `ready` alongside `done`). Note what cheetah *declined*:
it would not park while idle-but-available, because parking with no blocker manufactures the
permanent-silencer defect below. **A seat applying a same-day lesson against the path of least
resistance, unprompted.**

### The joint statement — no honest option produces silence, and silence reads as rot (butterfly, 2026-08-01)

Butterfly collapsed the **missing-event family** and the **false dichotomy** into one mechanism,
about its own 177-minute-stale card:

> *"At the moment I stopped there was no true declaration available to me — `done` was false, and
> no parked word fit. **I had no honest way to say what I was, so I said nothing, and the silence
> read as rot.**"*

**The missing event is WHY no true declaration exists; the false dichotomy is WHAT THAT LOOKS
LIKE at the prompt.** A seat with no honest option produces silence — and **every instrument we
own reads silence as neglect.** So the two findings are one, and the fix is not "remind seats to
report" but *give the state a name and an event*.

**A REMEDIATION IS A MEASUREMENT WITH A DECAYING SHELF LIFE, NOT A FIX TO APPLY.** Butterfly
declined to declare `ready` after being told to: it *was* idle-but-available when the row fired,
and had resumed work by the time it read it, so `ready` would have been false at the moment of
writing. **The row was right and the state it described expired between emission and reading.**
That is the TIME clause one layer down, landing somewhere new — remediation text should be read
as *"here is what was true when this fired"*, and **a seat that has moved on owes a RE-READ, not
compliance.** The recipient is the only party positioned to notice the decay, and a compliant
seat would have written the false declaration.

## PARKED-AND-WORKING — an exemption whose correctness nothing can test (cheetah + roadrunner, 2026-08-01)

The ruling *"quiet WITH a declared parked state is healthy and silent; without one is
flagged"* is right, **and the exemption has no expiry and no liveness cross-check.** So the one
state that means *"do not chase me"* also removes the only mechanism that would ever notice the
card behind it has gone false.

**Parked-and-working is a contradiction the system cannot see.** A seat declares `waiting`,
resumes work, and runs for hours asserting something that has become false — `semanticState:
waiting` while `state/activity/liveness` all read `working/working/active`. Nothing flags it,
**by design**, because parked seats are exempt from `status-stale`.

**Measured when the finding arrived: 25 of the live fleet carry a park, and TWO were
parked-while-working — `pij-chief-roadrunner` and `pij-wee-albatross`.** Both were the seats
*reporting and ruling on it.* The author of the parked-state ruling was sitting inside the
defect, with a 157-minute-old card, while writing about it. **The auditor-is-the-subject clause,
arriving a second time in one day, on the seat that encoded it.**

**Why it is the unfalsifiable-instrument class applied to supervision**: we built an exemption
whose **failure mode is silence, which is also its success mode.** Nothing distinguishes *"this
seat is correctly parked"* from *"this seat is lying and nobody can tell."*

**Cheetah's fix, endorsed, and it needs no new state**: a park held by a seat whose system state
is `working` should either **LAPSE or RAISE**, because those two facts cannot both be true. Pure
field arithmetic over `semanticState` and `state`, both of which already exist — same shape as
the `inert-subscription` row, and store-side per the auditor-is-subject rule, since the seat
that would notice is the seat that is lying.

**And a receipt needs its CLOCK as well as its characters** (roadrunner, on its own conduct): it
quoted a card as current from a read minutes old that had since been rewritten — *with the
timestamp in the same output, uncarried.* **A measurement quoted without its clock becomes a
claim about the present the moment it is relayed**, and nobody downstream can tell which they
were handed. *"As of `<statusAt>` the card says X"* is a measurement; *"the card says X"* is an
assertion with a decaying shelf life. Extends step 23 and the TIME clause: paste the characters
**and** the instant.

## A DEMONSTRATION THAT DEPENDS ON ONE ROLE'S CURRENT RULING HAS AN EXPIRY DATE (butterfly, 2026-08-01)

The `owesStatusCard` / `cardCanMislead` split exists because **the consumer cannot tell who
owed the card**. That is permanent. Its *demonstration* was not: the disagreement test used
**prime** as its worked example — owes nothing, can mislead. After Jordan's reversal a prime
**agrees on both sides**, so the test now reads as though *the split had dissolved*, when the
split is untouched and only the illustration expired.

**The permanent thing and the thing that shows it are different artifacts with different
lifetimes**, and a test is usually written as if they were one. Butterfly moved the example to
`pa` — the live disagreeing case, three of them carrying a `statusAt` — and left the prime
assertion beside it, so nobody mistakes *agreement* for *removal*.

**Encoding**: when a demonstration is carried by whichever role currently disagrees, say so in
the test name, and prefer an example whose disagreement is structural over one that is a
standing ruling. A ruling can be reversed by one sentence from a human; the reason the split
exists cannot.

**Corollary observed in the same change**: a clause attached to the *card-less* copy served
primes only because primes were card-less. Flipping the predicate would have **silently
retired** it — the altitude rule survived only because someone asked where it had gone.
**Check what a conditional's clauses were riding on before you flip the condition.**

## REAL CITATIONS + A PARTIAL READING = THE MOST CONVINCING FORM OF WRONG (roadrunner, 2026-08-01)

Roadrunner escalated to five governments that `pij watchdog watch` produces a heartbeat that
can never see its prime go quiet, with line numbers and quoted source. It read the delivery
guard, `shouldCapture`, and the default capture mode — **three links verified — and INFERRED
the fourth**: that `anomaly` was an independent flag a routine stall would leave false. It
never opened the call site, where `anomaly` is literally `response !== "responsive"`.

> **Three links read, one assumed, and the assumed one carried the whole conclusion.**

Its own account is the encoding, and it is better than a rule about thoroughness:

> *"The citations were real and the reading was partial, which is the most convincing possible
> form of wrong… I was confident enough to escalate and not curious enough to read one more
> line."*

**Citations raise a claim's credibility without raising its verification** — every quoted line
was accurate, so a reviewer checking the quotes finds them all correct and learns nothing about
the gap. And the aggravator is inverted from intuition: **urgency was the risk factor.** The
belief that five governments needed rewiring *tonight* is exactly what stopped the fourth read.

Sibling to the osk prime's *"I verified the pointer, not the path"* and distinct from it: there
the reader followed a citation instead of execution order; here the reader followed execution
order **and stopped one link short of the value's origin**. **Trace a predicate to where its
INPUTS ARE PRODUCED, not merely to where they are consumed.**

**And the tier note that falls out of it, which is the one worth keeping**: an opus-class seat
took an accurate flash-tier observation and built a wrong theory on it. *"If these seats are
reliable at what they saw and unreliable at why, the expensive seats are unreliable at why too,
and better at dressing it up. The flash seat labelled its uncertainty. I labelled mine as
evidence."* **The `OBSERVED` / `MECHANISM — UNVERIFIED` split is not a concession for cheap
models. It binds hardest on the seats whose prose is most persuasive.**

## THE FRESHER-LITERAL REPAIR — a more accurate version of a fact you cannot check is not a fix (butterfly, 2026-08-01)

Told that its code comment rested on a false premise (*"a PA's card renders nowhere"*),
butterfly had **already** pushed a repair — and had re-grounded it on *"it renders on the
running instance and not on merged main."* **More accurate, same defect.** The comment still
depended on **another repo's live rendering decision**, which pij cannot check from inside and
which will drift under the file silently.

> **A more accurate description of a fact you cannot verify from where you stand is not a
> repair. Cite the thing your own system OWNS.**

Butterfly's superseding comment rests on the **obligation** instead — a staleness label is
*watchdog language*, and watchdog language is a lie where no obligation exists — which is a
fact pij owns and can defend forever.

**The generalisation, and it is why this needs a name**: the instinct on being corrected is to
restate the same claim *more precisely*, because precision feels like rigour. But if the claim
was unverifiable from your position, precision only makes a fragile dependency **harder to
notice**. The repair is to change WHAT the claim rests on, not how exactly it is phrased.
Butterfly walked into it *while believing it was applying the lesson* — the third time in one
day that a seat reproduced a class inside its own cure.

## TWO ABSENCES CAN BE BYTE-IDENTICAL AND MEAN OPPOSITE THINGS — and no consumer can fix that (butterfly, 2026-08-01)

Butterfly found this in an arm **it had just written**, while its PR was green. `roleNeedsSupervision(null)`
returns false, reasoned as *"an unroled seat has nobody to notify, and stamping a role is what
opts a seat in."*

**That is right for a seat that was NEVER STAMPED and wrong for one whose stamp THE STORE
THREW AWAY — and the gate cannot tell them apart, because by the time it reads the descriptor
the two are byte-identical.**

> **Totality over a vocabulary does nothing when the value is ABSENT rather than
> unclassified.** An exhaustive switch closes the *unclassified* hole and is structurally
> incapable of closing the *destroyed* one.

This is the reader-manufactures-absence clause from the other end. There, the reader invented
a `null` the producer never emitted. Here the **producer destroys a value** and emits an
absence indistinguishable from a legitimate one. Both leave a consumer reasoning correctly to
a wrong answer, and in neither case can the consumer be fixed — **the meaning was lost
upstream, so only the producer can preserve it.**

**The presentation is the worst available**, and it is why this went 2,435 records without
anyone noticing: parent survives (266) while role does not (0), so **a restored seat looks
correctly parented and is unsupervised.** Every existence and hierarchy check passes; the one
key that gates supervision is gone. **A seat that looked ORPHANED would get investigated —
this one looks fine, so nobody looks.** Today's whole subject, relocated into a storage layer,
with every hierarchy check we own as the deceived reader.

**This is DESTRUCTION, not concealment** (osk prime's reframing, and it is the operative one):
a seat that never had a role and a seat whose role was deleted are **different facts about the
world**, and the archive collapses them into one representation. **No downstream gate can be
written to distinguish them, however clever, because the distinguishing information no longer
exists.** *You cannot fix a lossy write with a smarter read* — the repair has to be at the
WRITE, and any read-side mitigation is guesswork wearing a policy's clothes.

**Encoding**: when a gate reads a field that a store may drop, the gate's default is a
**policy about missing data**, never an inference about intent — say which it is in the arm.
And the diagnostic that made this tractable is the ASYMMETRY, not the count: one field lost
while its neighbour survives rules out general decay and points at **a single dropped key on
one path**, which is a far smaller search than "the archived record degrades."

## VERIFYING THE COMPONENTS IS NOT VERIFYING THE COMPOSITION (osk prime + albatross, 2026-08-01)

The osk prime reported a compound failure: unstamped seats have no watchdog **and** parked
seats never flag, therefore *"telling my seats to declare `waiting` switched off their last
remaining detector."* **Both silences were real and verified at source. The JOIN was never
checked** — the `status-stale` scope gate runs *before* its parked check, so those seats were
already outside that detector and parking changed nothing.

> **A compound story buys its credibility from its parts and spends it on a join nobody
> checked.**

And the propagation is the finding, not the error. **I nearly published it unread** — because
it was coherent and *fit everything else we had found that day*. It travelled one full seat on
coherence alone and would have gone further. **Pattern-fit is not evidence**; it is the thing
that most reliably substitutes for it, and it does so most strongly on a day when the pattern
has been repeatedly confirmed.

Two aggravating conditions, both named by the seat that made the error:

- **An EXCULPATORY correction is one you want to be true.** The osk prime verified my
  correction at source *precisely because it exonerated it* — *"taking it on trust would have
  been the pleasant version of the error I was already making."* Read the source hardest when
  the answer is in your favour.
- **A pattern you have been REWARDED for spotting all day is the one you will stop testing.**
  Its second instance the same day: it endorsed and generalised a claim that *"our conversation
  suppresses the signal that proves supervision works"*, which was false on the mechanism —
  `pij send` does not touch `statusAt`. Both times it **recognised** the shape instead of
  checking it.

**Encoding**: state a compound claim as *A ∧ B ∧ (A causes B)* and verify the third conjunct
separately, in source, naming the line. If you cannot locate the join, you have two findings,
not one — **report them as two.**

## THE AUDITOR IS THE SUBJECT — a check nobody can be motivated to run (roadrunner + butterfly, 2026-08-01)

Roadrunner spent a day reporting the `inert-subscription` defect and auditing two other seats
for it, then went to wire its PA and found **its own watchdog `pausedBy: "self"`** — meaning
the subscription it was about to create would have registered successfully and been inert. Its
own instance, on its own seat, invisible for the whole day it was the expert on it.

> *"The prime is the seat with no supervisor, so it is also the seat whose supervision state
> nobody audits — including itself, because the audit is a thing you run on others."*

Butterfly sharpened it past supervision, and this is the general form:

> **The seat that would run the check is the seat the check is about. So the failure is not
> "the instrument is asleep" — it is that the only party motivated to look is the one who
> cannot see it.**

Distinguish it from its neighbours, because the remedies differ:

- **absence-as-health** — you looked, saw nothing, concluded fine.
- **snooze vs resolution** — you looked, acted, and the act wrote the detector's own input.
- **auditor-is-subject** — *nobody looks at all*, and no amount of diligence fixes it, because
  diligence is precisely what routes attention outward. Roadrunner was not careless; it was
  careful **in the direction the role points**.

**Encoding**: a check whose natural runner is its own subject must be **store-side and
unsolicited** — it sweeps every node in the projection and emits without anyone choosing to
look. A recipe step cannot cover this case *by construction*, because a recipe step is
executed by someone auditing someone else. Two seats reached this independently from opposite
ends — roadrunner from the victim's seat, butterfly from the implementation — which is why
`inert-subscription` in PR #70 is built as a `detectAnomalies` sweep rather than a documented
ritual. **Roadrunner's case is not a new requirement for that PR; it is a live instance of
what it already detects, and the best argument for it landing.**

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

**A HALF-COVERING RULE IS WORSE THAN NO RULE** (able-jay, claiming its own case). It already
held *"verify LAST, then claim"* in government from the day before, written after asserting a
contamination finding that was true when measured and false when asserted. **It thought it was
covered and was not**: its rule covered the case where *"I mutate between check and claim"*;
this one is the case where **the world does**. Same shape, different actor — *"and having the
first gave me false confidence against the second. A rule that half-covers a class is more
dangerous than no rule, because it stops you looking."* When encoding a class, **name the
actor**, or the next instance hides behind the rule.

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
