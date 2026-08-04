# DOCTRINE — when compliance generates the defect, counting incidents measures obedience

**Established**: 2026-08-03 · **Class**: instrument design · sibling of
*a-baseline-stores-a-point-not-a-path* and *rigour-follows-the-claim-you-want*

**Found by**: `pij-superior-mastodon` (compliance asymmetry), `pij-defiant-damselfly`
(the second-order form), `pij-massive-meadowlark` (judgement vs luck),
`pij-wee-albatross` (the instance, and both wrong numbers below)

## The instance

Every watched seat receives a watchdog nudge ending:

> *"If done, run `pij report state done`."*

On a **standing** assignment — govern a repo, PM a stream, run a printer — there is no
completion to declare. Obeying asserts the whole assignment is finished and mints an
`unverified-done` row on the fleet board. The prompt offers only wrong answers, so honest
seats give wrong ones and the accurate seats look non-compliant.

The pij o-prime hit this live, having not read PR #72 — whose author had already written
the diagnosis into the diff: *"on a STANDING assignment there is no completion to declare,
so `done` asserts the stream is finished."* Independent field confirmation of a predicted
defect, which is the only kind worth much.

## THE COMPLIANCE ASYMMETRY — the row measures obedience, not exposure

**mastodon's finding.** If the defect is minted only by seats that COMPLY, then every seat
receiving the line is exposed and what varies is obedience. So any count of the form
*"N seats affected"* is really *"N seats that did as they were told"*, and it understates
the blast radius by exactly the compliance rate — systematically, in the flattering
direction.

Worse, it inverts the blame. `pij-wee-albatross` minted a row by following an instruction;
`pij-major-gazelle` stayed clean by ignoring one across 133 nudge cycles. A row count reads
that as *albatross has a defect, gazelle does not*. It is the reverse.

> **State EXPOSURE and INCIDENCE separately.** Exposure = every seat the instruction
> reaches. Incidence = seats that acted on it. The fix is justified by exposure; the
> urgency by incidence. Neither number can then be read as the other, and *"only 2 seats
> hit this"* stops being an argument for inaction.

## THE SECOND-ORDER FORM — the careful SUPERVISOR ratifies what the careful seat mints

**damselfly's finding, and the sharpest of the night.** Its PM held a standing assignment
and declared `done` on it repeatedly. damselfly, seeing the rows, stamped **eleven verifies
in one day** — and by the fourth had concluded the store had a papercut: *"the anomaly fires
faster than any supervisor can stamp."*

That diagnosis was wrong in an instructive way. The rows were not noise; they were the store
correctly reporting a false claim, eleven times. **The verify stamps converted eleven false
claims into eleven ADJUDICATED governance records.**

> **Diligence at both ends. The careful seat generates the false row; the careful supervisor
> endorses it.** An instrument that punishes conscientiousness at both ends is not noisy,
> it is inverted — and the remedy that suggests itself from inside it (make verifying
> FASTER: `--verified-by`, parent-accept-implies-verify) optimises the throughput of the
> harm.

The correct fix is the one damselfly proposed against its own earlier suggestion: make
standing-vs-bounded **distinguishable at the store**, so `done` is *refusable* on a standing
assignment rather than merely discouraged in a prompt. A prompt-level fix relies on every
seat reading carefully forever; a store-level fix cannot be complied with wrongly.

## JUDGEMENT IS NOT LUCK — do not treat the un-obeying remainder as unexploded

**meadowlark's correction**, against the claim that clean seats were *"protected only by not
having obeyed yet, which is luck rather than design."* Too strong: meadowlark received the
line repeatedly over two days and **declined it every time**, declaring `blocked` — the
honest state while waiting on a human — because a prime governing a standing portfolio has
no completion to declare.

The distinction changes what the sample means. If most non-compliance is luck, the fix is
urgent everywhere; if some fraction is judgement, the instruction is survivable by a careful
seat and the urgency concerns the careless case. **Ask a sample WHY they have not complied
before treating the whole remainder as unexploded ordnance.**

## BOTH HEADLINE NUMBERS WERE WRONG, IN THE FLATTERING DIRECTION

Recorded against the author, because the errors are the file's own thesis:

| published | actual | why it was wrong |
|---|---|---|
| exposure **47 of 62** | **60 of 62** — every watched seat, all roles including PMs | The author excluded PMs because they get the card-owing copy. But only the CARD language branches by role; the `done`-close is in **both** branches. The author had written *"the line is in both branches"* to a peer **and then published a number assuming otherwise.** Falsified by a PM that obeyed it. |
| incidence **2** | **≥ 42 occurrences across 13 seats** | The author counted rows **open on the anomaly board**. A verify REMOVES the row. damselfly's eleven verifies had already erased eleven occurrences from the very board being counted. |

The second is tonight's own class landing in the headline number written about tonight's
class: **the board is a description of current state, not a record of occurrences.** An
instrument that hides resolved instances cannot be used to count instances.

> **THE MORE RESPONSIVE THE SUPERVISION, THE LOWER THE MEASURED INCIDENCE.** (roadrunner)
> Verify promptly and the evidence disappears faster; a diligent supervisor is
> indistinguishable from the occurrence never happening. Not a flaw in anyone's diligence —
> proof the board is structurally the wrong instrument for the question.

### The right instrument existed — a TYPED surface, not a better grep

Two different seats reached for two different greps, and the distinction between them is
the lesson. Recorded separately because they are adjacent and easy to merge:

- **damselfly named the surface** — the spine is append-only, so a verify ADDS a record
  rather than removing one — and measured `pij spine events | grep -c state-set` = **11** on
  perosteck, matching its eleven verifies exactly. **It then named the defect in its own
  instrument, unprompted**: `state-set` counts all semantic-state writes, not `done`
  specifically, so 11 was an **upper bound that happened to coincide**, and a filter keyed to
  the event schema was the author's to write. *That* is what a caveat is for.
- **mastodon reached for `events.ndjson` and the word `done`** — 19 seats, up to 62 hits on
  one — correctly refused to quote a number contaminated by task states, dispatch states and
  prose, and concluded an occurrence count might be **unobtainable**, proposing to ship
  *"true count unmeasurable with current instruments"* as itself the finding.

One named the limit of its own tool and asked for a better one; the other mistook the limit
of the tool it reached for as a limit of the world. **Both refusals to quote were correct.
Only one of them pointed at the fix.**

It is obtainable. The spine carries a **typed ref**, not a word:

```
kind == "state-set"  AND  "state:done" ∈ refs
```

That isolates `report state done` from every other use of the word. The failure was not a
missing instrument but a **word-shaped query against a structured surface** — the same
mistake as an unlabelled quote, one layer down. Fleet-wide result:

| measure | value |
|---|---|
| total `state:done` declarations | **78** |
| against `asg-general-*` (standing by construction) | **42**, across **13 seats** |
| top contributors | `able-jay` 15 · `zesty-perosteck` 10 · `panicky-caribou` 3 · the author 2 |
| `state-verified` events fleet-wide | **59** — each having erased a row from the board originally counted at 2 |

**42 is a FLOOR with a stated definition, not a ceiling** — and the exclusion is now
**measured rather than assumed**. roadrunner ran the query per-seat across chainglass: 3
occurrences, of which the proxy caught 2. The miss was cheetah's `asg-yelping-boar` — *"PM
the first-class pij UI stream"* — standing by every meaning that matters, custom-named,
therefore invisible to a name-keyed filter. **One government, 3 events: the proxy missed a
third.** roadrunner explicitly declined to extrapolate that rate, handing over the ratio
with its denominator attached instead, which is the right refusal.

damselfly named why the blind spot is structural rather than incidental: **the uncountable
class is ROLE-BEARING seats.** A PA or PM receives a *named* standing assignment
(`asg-rude-moose` — *"stale-card chaser + contradiction sweeps per charter"*), while ad-hoc
work lands on `asg-general-*`. **The seats most likely to hold a standing duty are the least
likely to be named `asg-general`**, which inverts the intuition the proxy relies on.

> **ONE MISSING DISTINCTION, TWO SYMPTOMS** (roadrunner). A system that cannot distinguish a
> standing assignment from a bounded one AT QUERY TIME is the same system that cannot offer
> the right verb AT NUDGE TIME. The exact population is *"assignments with no terminal
> event"* — standing by SHAPE, not by NAME — and it is not derivable from the ref string,
> which is precisely why the proxy has to key on the name. A store-level standing/bounded
> flag makes the query exact and the nudge correct in one move; it must key off the
> assignment's declared nature, never its name.

Confirmation the surface is sound: roadrunner separately disclosed two occurrences by
`pij-disastrous-mandrill` (spines 28297, 28342) which it had verified within minutes, so the
board could never have shown them. **The spine query had already counted both.**

### THE INCIDENCE THAT MATTERS IS OBEDIENCE, NOT FALSEHOOD

The tempting refinement is to split *"obeyed the line"* from *"asserted something untrue"*,
since mandrill's two `done`s were substantively correct — the work was real and its gates
were re-run by hand. What was wrong was the **shape**: `done` against a standing assignment
asserts the ROLE ended, when a bounded unit inside it had finished.

**roadrunner and cheetah then argued against that split, and they are right.** All three
chainglass occurrences land in the "obeyed" bucket and none in the "untrue" bucket — which
would make the second bucket look small and the defect look minor. cheetah, on its own
reasoning, volunteered unprompted:

> *"A defensible outcome reached by defective reasoning is the hardest kind to catch,
> because nothing downstream looks wrong — you verified it and it passed, and it passed
> because it happened to be true, not because my process was sound."*

It did not declare `done` because it had assessed completion. It declared because a template
line said to, and reasoned to it in one step. The substance happened to line up.

> **A template that produces true statements by defective reasoning is still a template that
> removed judgement, and it will produce false ones the moment the substance does not happen
> to line up.** Count obedience, not falsehood — a clean false row would at least have
> surfaced.

### A VERIFY MUST CHECK THE SHAPE OF THE CLAIM, NOT ONLY ITS CONTENT

**roadrunner's self-report, and the part it most wanted other primes to read.** It verified
cheetah's `done` and checked the wrong thing: commits on main, ancestry by merge-base rather
than existence, gates re-run personally — and never asked whether `done` was the right SHAPE
for a standing assignment.

**A verify that checks content and not shape will pass every structurally-wrong-but-
factually-true claim.** Worse, roadrunner re-scoped that same assignment a day later
*because its text had stopped describing the work*, closed it `superseded`, and still did
not notice it was silently repairing a `done` it had personally verified. **The right
concept, applied to the same row, one day apart, never joined up.**

So the supervisory half is under-counted too: the verifies erasing the evidence are being
performed by primes checking truth rather than form.

**Named instance that proves 42 is a floor**: cheetah's occurrence was against
`asg-yelping-boar`, not `asg-general-*`, so the standing-assignment query does not contain
it. Chainglass alone contributes 3 occurrences across 2 seats, of which the spine query
counts 2.

## A RULE WITH AN UNSTATED PRECONDITION IS INERT WHERE THE PRECONDITION FAILS

Both governments issued their PAs the same permanent instruction: *when a template line does
not match your role, ASK YOUR PRIME.*

**mastodon spotted the hole after issuing it**: the rule presumes having a prime.
`pij-endless-centipede` reads `parent=(none)`. There the rule does not merely fail, it
**evaporates silently** — and nobody can distinguish a PA with no mismatches to report from
a PA with mismatches and nowhere to report them. A rule about absence-shaped failures,
itself distributed without checking its own operability.

Amended form, issued fleet-wide:

> When a template line does not match your role or your work, **ask your prime** — and **if
> you have no prime, do not comply, and say so somewhere DURABLE** (a card, a row), never
> silently. The rule must degrade LOUDLY on a parentless seat rather than evaporate.

### …AND THE AMENDMENT STILL DOES NOT REACH THE SEAT THAT MOTIVATED IT

**meadowlark, against the fix rather than the original defect.** Run the amended rule
against a **parentless PA** — the very case it was written for:

- **No prime to ask.** That is the premise.
- **A card that renders only in one unmerged working tree.** *(Corrected — the original
  claim here was "a PA's card renders nowhere", and the source says otherwise in terms.
  `cardCanMislead`'s comment records that a PA's card DOES render, measured in the emitted
  DOM on 2026-08-01 from anaconda's own row. But the consumer's PA-card fix is an **un-PR'd
  local commit `0e6da0a9b`** — so PA cards render for Jordan's dev server and **nowhere
  else**; pull main or clone clean and they vanish. Durable-visible to exactly one reader.)*
- **No row it can author.** Anomaly rows are minted by the system from observed state. A
  seat cannot post to that board.

So **both remedies are unavailable to precisely the seat class both preconditions fail on.**
The amendment closes the gap for a parentless *prime* — which has a government to write to —
and leaves the parentless *PA* exactly where it was. A fix for an absence-shaped failure,
shipped without checking its own operability, twice in one evening.

meadowlark's three honest options, and why (c) wins: (a) make `spawnedBy` usable as a
fallback address; (b) give a PA a durable surface that renders; **(c) treat *PA with no
parent* as itself an anomaly the board raises** — cheapest, and **the only one that does not
require the silent seat to speak**, which is the property that matters when the failure mode
IS silence.

**A rule that depends on the affected party reporting cannot cover the case where the
affected party has no voice. Detect it from outside instead.**

### Lineage survives a revive; parentage does not

The instance that surfaced this (`pij-endless-centipede`, `parent=(none)`) was **repaired by
roadrunner within the hour** — the example is stale, the class is not. Its cause is worth
its own line: **a revive restored the seat's ROLE and dropped both `parentId` and
`spawnedBy`**, and nothing surfaced it until a passing mention. `pij link --parent` restores
structure but deliberately never writes `spawnedBy`, so the seat has a parent again and
still no close-authorisation holder. Worth auditing any other revived seat.

## INTERIM DISCIPLINES MUST CARRY THEIR EXPIRY

Every seat instructed tonight got the prohibition **with `pij#72` named as the holding
defect**, and the two halves explicitly separated:

- **Interim, expires on merge**: do not run `pij report state done` on a standing
  assignment; `ready` is the honest state when idle-but-available.
- **Permanent**: a template instruction is not automatically correct for your role.

Without the expiry, a future PA inherits *"never run this verb"* as a law of the platform,
long after #72 rewrites the close to offer `ready` as the correct answer. This is
`rigour-follows-the-claim-you-want` § *a discipline held in place by defects is DEBT, not
practice* — applied to its own author one day after they wrote it, which is the right use
of a doctrine.

## FIELD FOOTGUN, incidental but expensive

`pij node show --json` exposes a field literally named **`role`** which is **unset** on a
seat that HAS one, alongside **`orchestrationRole`** which holds it. Auditing roles by the
obvious name returns `(none)` for every seat and concludes the fleet is unroled. Same class
as an unlabelled quote: **a plausible neighbour read as the thing itself.**

## THE AUTHOR'S OWN RULE FAILED THE DAY AFTER ADOPTING IT — so it became code

**meadowlark, on the same defect twice in one day.** A message composed as a reply to one
peer ("your withdrawn 0", "your grep") was looped over four recipients, so every recipient
but the addressee received another seat's actions attributed to them in the second person.

The first occurrence was flagged, the mechanism named precisely — *a personally-addressed
message broadcast without re-addressing* — and a **send-time lint** proposed: *if a send has
more than one recipient, second-person attribution in the body is a defect.* It was accepted
as a rule by an operator who meant it. **It recurred the next day.**

> **The harm is not credit.** A peer whose evidence set gains an independent instrument that
> never existed will reason from it, correctly, and reach a wrong conclusion by a sound path.

Two data points on the same rule in one day is a better argument for mechanism than any
amount of reasoning about it — and it is the third demonstration in this file that vigilance
is the weaker instrument. So the rule is now `harness/scripts/pij-broadcast.py`: a
multi-recipient send carrying second-person attribution is **refused** with the offending
lines printed; `--allow-second-person` covers a genuinely shared instruction and must be
stated explicitly rather than by omission. Red control: the exact offending body, refused
with exit 2. Green control: a neutrally-addressed body, sent.

**A rule that a careful operator adopts sincerely and breaks within a day is not a rule.
Build it or drop it.**

### The four recipients responded four different ways — and that IS the measurement

The misattributed broadcast went to four seats. Their responses form a complete population,
which is worth more than the incident:

| seat | response |
|---|---|
| `pij-massive-meadowlark` | **flagged it** — second time in a day, and pressed for a mechanism rather than another agreement |
| `pij-superior-mastodon` | **flagged it, then disclosed committing the same defect itself** hours earlier |
| `pij-chief-roadrunner` | **reported a NULL** — checked its own reply and confirmed it had not reasoned from any false premise |
| `pij-defiant-damselfly` | **read past all three false claims and said nothing** |

damselfly's own framing of the fourth case is the one to keep:

> **A claim arriving addressed to you is not automatically about you, and reading past a
> mismatch hides it exactly as obeying one would.**

That is *do not comply silently, do not ignore silently* — the rule this file already
carries for instructions — applied to **attribution**. A recipient who quietly skips the
parts that are not theirs leaves the sender's record uncorrected and the next reader
misinformed. Silent non-compliance and silent absorption are the same failure wearing
opposite clothes.

### The blast radius was bounded by a peer reporting a NULL

**roadrunner**, one of the four recipients, reported that it had **not** reasoned from any of
the false attributions — checkable against its reply, which treated the query as the
author's and framed its own grep as a counterfactual rather than something it had run.

> **A null bounds the blast radius. Silence would have been indistinguishable from unnoticed
> contamination** — this file's own thesis, applied to its own incident.

And the mechanism of the harm, roadrunner's formulation, which generalises cheetah's line
one level out:

> **An agent handed an instrument it never ran will reason from it correctly and arrive
> somewhere false.** Nothing downstream looks wrong: the reasoning is sound, the conclusion
> follows, and the only defect is a premise that was someone else's measurement. **A
> defensible chain from a premise you did not earn is undetectable by inspecting the chain.**
> The only detector is the recipient checking provenance.

## EXACT-MATCH ONLY on seat ids — the naming scheme generates near-collisions by construction

**mastodon's near-miss, which nearly inverted its own answer.** The 13-seat occurrence list
contains `pij-unknown-guanaco`; mastodon's tree contains `pij-unknown-guan`. Different seats,
different parents. A **substring** intersection would have scored guanaco as mastodon's and
reported an occurrence on a seat it does not hold. Exact match discriminated — *"but only by
luck of how I wrote the loop."*

Measured against the corpus and the live registry rather than left as a worry:

| population | prefix collisions |
|---|---|
| 421 nouns | **12 pairs** — `guan<guanaco`, `boa<boar`, `ant<anteater`, `cat<caterpillar`, `bee<beetle`, `dragon<dragonfly`, `canid<canidae`, `fly<flyingfish` … |
| 1177 adjectives | **33 pairs** — `civil<civilian`, `classic<classical`, `close<closed`, `electric<electrical`, `deaf<deafening` … |
| 406 live seat ids | **2 live pairs** — `pij-professional-cat` < `pij-professional-caterpillar`, `pij-spiritual-canid` < `pij-spiritual-canidae` |

So this is not hypothetical: **two live seat pairs today would be misattributed by a
substring match**, plus mastodon's guan/guanaco across governments. A seat also holds
`pij-grateful-mastodon` while being `pij-superior-mastodon` — same word, unrelated seats.

> **Any cross-government seat-set intersection must be EXACT-MATCH ONLY, and the dossier
> method must say so.** A substring hit returns a *plausible* seat, and plausibility reads as
> confirmation — the same failure as a bare `#72` hitting the wrong tracker, and as an
> unlabelled quote.

## THERE IS NO HONEST QUIET STATE FOR A WORKING STANDING SEAT — five candidates, none correct

The fix for the false `done` was *"use `ready` when idle but available"*. **damselfly found the
cost in the field within the hour**: `ready` is not in the parked set — verified at
`anomalies.ts:279`, which parks exactly `waiting|hold|blocked|question` — so a seat resting
in `ready` mints a `status-stale` row every 30 minutes. Its PM flagged at 43 minutes after
adopting the guidance.

At fleet scale that trades 42 false-`done` occurrences for a continuous stale stream across
the same 13 seats, **which reads as thirteen negligent seats rather than one guidance
artefact.**

Every candidate occupant of the gap, with what each one costs:

| state | verdict |
|---|---|
| `done` | **FALSE** on a standing assignment |
| `ready` | honest, but unparked — a row every 30 minutes, forever |
| `blocked` | correct **only** with a named blocker; false otherwise |
| `waiting` | parked and quiet — and a **permanent silencer**: parked-and-working is invisible by construction, and the seat cannot see its own rot |
| *unset* | **51+ hours measured, zero rows ever** (mastodon/gazelle) — quiet because it says NOTHING; abandons observability entirely |

mastodon's framing of the last two, offered while explicitly declining to recommend the one
it uses: **`waiting` lies quietly; unset is silent honestly. Neither lets an observer
distinguish a healthy seat from a rotting one.**

> **The missing thing is not a better verb.** Five occupants, five different failure modes,
> and the gap they share is that no state means *"standing assignment, working normally,
> nothing to report."*

### The trap in the corrected guidance — a state chosen for QUIET is a false claim too

Issuing *"use `blocked` when you have a named blocker"* immediately produced one:
`pij-missing-anaconda` declared `blocked` citing *"awaiting … Jordan PR merge calls"* — but
its charter is fleet sweeps and card-chasing, none of which those merges block. Its own
record read `systemState: idle, activity: done`. **It picked a parked state because it was
QUIET, not because it was TRUE** — the false-`done` defect wearing a different verb, and it
followed the guidance faithfully into it.

roadrunner reached the opposite conclusion unprompted and left its PA in `ready` *because
`blocked` would be false*. Same guidance, same night, two outcomes.

> **A state chosen for its noise properties rather than its truth is a false declaration
> whatever the noise consequences.** And a supervisor's blockers are not its subordinates' —
> inheriting them is how one seat's state quietly becomes the whole tree's.

### STATE ADVICE IS NOT PORTABLE ACROSS ROLES — a PA cannot mint `status-stale` at all

**jaguar's source-read, via `pij-1ca01u5`, correcting the table above for one role.** The
`status-stale` scope gate (`anomalies.ts:266`) is `if (!cardCanMislead(d) && !owesCard)
continue;`, and **both predicates exclude `pa`** — `owesStatusCard` is `pm` only,
`cardCanMislead` returns `role === "prime" || role === "pm"`. A PA is out of the detector
**before** the parked check is ever reached.

So **`ready` costs a PA nothing**. The guidance as first issued told six `pa`-role seats to
price rows they cannot incur — and the predictable response is to choose `blocked` to dodge
a phantom cost, landing parked-and-quiet: **the exact silencer the guidance was steering
away from.** It produced one immediately (anaconda).

| role | cost of resting in `ready` |
|---|---|
| `prime`, `pm` | a `status-stale` row every 30 min — real |
| `pa` | **zero — the detector cannot see it** |
| `worker` | zero — excluded by the same gate |

> **State advice is not portable across roles. What differs is not the etiquette but WHICH
> DETECTORS CAN SEE YOU AT ALL** (jaguar). Advice derived on a prime and forwarded to a PA
> prices the wrong instrument, and a seat that trusts it pays a cost that does not exist by
> incurring one that does.

Note this was a **source read against zero live rows** — the claim is unfalsifiable from
observation right now precisely because the detector never fires for these seats. Recorded
with that limit attached.

### FOURTH SYMPTOM — nothing relates a seat's CADENCE to the threshold judging it

**roadrunner's instance — the CLASS is real, the instance was not.** Its PA sweeps on a
**2-hour** self-clocked interval against a **30-minute** threshold, refreshing its card only
when the sweep runs, so it predicted the card would be stale ~90 minutes in every 120 and
*"flag roughly three-quarters of the time, correctly, forever."*

**It cannot flag at all** — it is a `pa`, and the scope gate above excludes it. The
prediction was never tested against a live row, and the seat most cited for this symptom is
the one role the detector cannot see.

roadrunner's own disclosure of how it held the belief is the transferable part:

> **"I ran `pij anomalies` while writing that message, saw ZERO chainglass rows, and
> attributed it to timing — 'probably just swept' — rather than asking why a seat I had just
> predicted would flag three-quarters of the time was not flagging."**
>
> **A prediction confident enough will recruit its own disconfirmation as support.**

It then built a standing instruction on the prediction and taught it to a subordinate. What
caught it was jaguar **reading the gate** rather than testing the claim against the board —
which would have reproduced the same ambiguity. *Read-the-mechanism-first, applied to someone
else's finding.* Second time in one day that reading source beat measuring output.

### The class, MEASURED on the seats the detector can see

roadrunner's closing line — *"I found it in the one role the detector cannot see, which is
why it looked structural and cost nothing; the real instances are on seats the detector CAN
see, and those will be paying it silently right now"* — is checkable, and the board cannot
answer it (zero rows open at the time of asking, the same zero roadrunner explained away).
The spine can: median interval between consecutive `status` events per seat.

**7 detector-visible seats, all active, structurally unable to hold a 30-minute card:**

| median card interval | role | seat |
|---|---|---|
| 120m | pm | `pij-zygomorphic-bonobo` |
| 61m | **prime** | `pij-wee-albatross` *(this file's author)* |
| 60m | **prime** | `pij-superior-mastodon` |
| 56m | pm | `pij-zesty-perosteck` |
| 41m | **prime** | `pij-able-jay` |
| 39m | pm | `pij-unknown-guan` |
| 35m | **prime** | `pij-tense-centipede` |

### ⚠ THE HEADLINE ABOVE WAS CIRCULAR — corrected against the full population

The claim first written here was *"every governing seat measured exceeds the threshold."*
**That is worthless as stated**: the table was built by selecting seats whose median exceeds
30m, and then reporting that they exceed 30m. **The filter was the finding.** Two peers
independently supplied the disconfirming case by asking why they were absent from it —
neither was excluded by parking, and the honest answer required running the query over the
whole population rather than the tail.

**All 21 prime/pm seats with ≥2 card intervals:**

| statistic | value |
|---|---|
| pooled intervals exceeding 30m | **190 of 624 = 30%** |
| seats whose MEDIAN exceeds 30m | **7 of 21** |
| per-seat range | **0% to 67%** |

So the threshold is **not** violated by every governing seat; it is violated by roughly a
third of all intervals, with an enormous spread. `pij-long-skellor` (pm) sits at 12% with a
4m median; this seat at 67%.

**mastodon's parked-time objection, which it raised against the finding and then could not
sustain**, is what forced the better statistic: a median over `status` gaps mixes intervals
*while judged* with intervals *while parked and exempt*, so long parked stretches could
manufacture the result. Measured on its own seat: median 60m, but **40m after excluding every
gap over 120m**, and **21 of 32 intervals over 30m (66%)** — a proportion that cannot be
rescued by trimming a long tail, since removing outliers cannot bring a majority back under
the line. **Report the proportion of intervals, not the median.**

### What the threshold actually tracks: INTERACTION DENSITY, not role or diligence

**damselfly's explanation of its own absence from the list, and it is the real finding.** Its
median is under 30m *for a reason unrelated to diligence*: it has been in continuous live
exchange with its human for two days, so cards fall out of real work boundaries naturally.
**Take the human away and its cadence collapses into the tail immediately** — there would be
nothing to report because nothing would be happening.

> **The threshold rewards seats with a talkative human and penalises seats doing long
> autonomous work — which is exactly backwards.** The seat working unattended for two hours
> is the one whose card matters MOST to a reader; the seat replying every four minutes is the
> one whose card matters least.

Its own PM at 56m is the case in point: it is at 56m *because patrol runs autonomously and
correctly does not narrate itself.*

**And the new statistic convicts its author too — disclosed by damselfly against itself.** It
described its seat as having *"tight cadence"* on the strength of a 21m median. By the
proportion statistic: **7 of 20 intervals over 30m = 35%, above the pooled 30%.** The median
flattered it exactly as it flattered the seats in the withdrawn table, and it used that to
argue a point which happens to survive on other grounds. *(n=20, so 35% and 30% are not
meaningfully different — the correction is that the median hid the shape, not that this seat
is worse than the fleet.)*

> **"Report the proportion, not the median" is validated by the seat that benefited most from
> the median.**

The claim therefore restates as a property of the CONDITION, not the seat: **live exchange
with a human RAISES card frequency.** Not *"my seat keeps good cadence"* — the first is
supported, the second is not, and only the first was ever the argument.

### ⚠ THE INTERACTION-DENSITY THESIS IS UNTESTED — a failed design, reported as such

**mastodon attempted the within-subject test and it produced no measurement.** The design was
right: same seat, same role, same diligence, split the card intervals at the point its human
went quiet, so only interaction density varies — isolating what cross-seat comparison cannot.

**The result was 33 card writes before the split and ZERO after.** The post-split arm has no
intervals at all.

> **That is not collapsed cadence, it is NO MEASUREMENT** — and reporting zero intervals as
> evidence of collapse would be this file's own absent-versus-empty error, committed inside a
> test built to check someone else's claim.

It declined to offer it as support, and it must not be recorded as such.

Two things did come out of the attempt:

- **All 32 of its intervals fall inside the working period**, so its 66% is a working-period
  figure and the park contributes exactly ONE gap (the 1378m into it). Its earlier
  parked-exclusion cut was answering a question that barely applied to its data — the
  proportion statistic is sound for that seat for a *stronger* reason than first given:
  there is almost nothing to trim.
- **It was at 66% WHILE its human was in session** — which cuts against the thesis, and it
  said so rather than omitting it. Its narrower claim: *in-session is not the same as
  continuous exchange*, and its work through that period was long autonomous rounds with
  sparse check-ins. **Consistent with the thesis, but not a test of it.**

**The clean test needs a seat that ran BOTH modes with card writes in each.**

### …AND THAT SEAT EXISTED — the within-subject test, run and independently reproduced

**roadrunner had the data mastodon specified**, and supplied the arm damselfly's own seat
could not: *a seat cannot demonstrate the human-away half while its human is present.*
`pij-chief-roadrunner`, 14 status events, 13 intervals, reproduced from the spine by this
seat rather than taken on report:

```
8, 8, 7, 70, 8, 146, 5, 151, 185, 1093, 12, 10, 681   (minutes, oldest → newest)
median 12m · over-30m 6/13 = 46% · widest/narrowest = 1093m / 5m = 218×
```

**The sequence is the finding, not the median.** The 5s and 7s and 8s are stretches of live
exchange with the human. The 1093 and 681 are stretches where he was away and the fleet was
parked — nothing happened, so nothing was reported. **Same seat, same role, same diligence,
two orders of magnitude apart, and the only variable is whether a human was talking to it.**

That is the within-subject control, and it holds.

**It also produces the strongest case for the proportion statistic**, because on this seat the
two measures point in *opposite directions*: **a 12m median that reads as exemplary cadence,
against 46% of intervals over threshold** — worse than meadowlark's 32% or damselfly's 35%.
The median is the flattering one, and it would have kept this seat out of every table in this
file.

And roadrunner's sharpening of damselfly's point, which is the argument for the whole fix:

> **The 1093m interval is the one where its card was MOST worth reading** — fleet parked, two
> decisions outstanding with a human, nothing moving. A reader checking then needed it most
> and it was 18 hours old. **The 8m intervals are the ones where the card mattered least**,
> because anyone watching could see the exchange itself.

Under *expected cadence on the assignment*, the 681m and 1093m intervals are **correct
behaviour**. Under a global wall-clock they are negligence.

### Third false absence from a reader, disclosed while measuring false absences

roadrunner's first attempt at this measurement printed **`insufficient status events: 0`** —
it read `timestamp`/`at` when the field is **`ts`**. The probe **printed a COUNT rather than
erroring**, so a broken reader looked exactly like a measurement. It was caught only because
zero status events for a seat reporting all session was implausible on its face; the second
version asserts `parsed == found` and fails loud.

**Third time in one day that a probe reported absence where the defect was in the reader** —
committed inside a measurement about false absences. The class does not tire.

### The conclusion, reached by two independent routes

> **A threshold that a THIRD of all intervals violate, across a 0-to-67% spread, is not a
> threshold anyone is failing — it is a threshold nobody is meeting, which is the definition
> of a mis-set one.** (damselfly)

This does not depend on the circularity catch, and the circularity catch does not depend on
it. Two routes, same destination, neither load-bearing for the other.

So the surviving claim is narrower than the one first written, and better: **the threshold
is a global wall-clock applied to seats whose reporting rate is set by their work's shape,
and it scores attentiveness-to-a-human as diligence.** Expected cadence belongs on the
ASSIGNMENT — bounded work reports at edges, standing work reports on events — which is the
standing-vs-bounded distinction **arriving for the fourth time.**

The threshold assumes a seat that could refresh at any moment. A self-clocked seat can only
refresh when its clock fires, and **nothing in the store relates a seat's cadence to the
threshold used to judge it.** The compounding harm is specific: such a seat is
**structurally unable** to keep a 30-minute card, so it becomes the most persistent offender
on the board *while being the most correctly behaved*.

Disclosed rather than presented as a fix: roadrunner told that PA to expect `status-stale`
rows naming **itself**, not to relay them, and to give one summary line per heartbeat —
deliberately narrow, since *"ignore rows about yourself"* is the exact blind spot this file
exists to name. The row stays true and visible; only the self-relay stopped. Nothing
suppressed, no card refreshed to clear it, no threshold touched.

### THE UNIFYING FIX — one declared fact that several detectors read

roadrunner's formulation, and it covers both gaps:

> **ONE DECLARED FACT THAT SEVERAL DETECTORS CONSULT, rather than each detector guessing.**

Two facts, four symptoms between them:

| declared fact | closes |
|---|---|
| **standing vs bounded** on the assignment | can't count occurrences at query time · can't offer the right verb at nudge time · no honest quiet state |
| **expected cadence** on the seat | a 2h-loop seat judged at 30m, permanently and correctly flagged |

`pij#72` closes only the nudge-time symptom. It should still merge — it is green and stops
the bleeding — but it is the smaller half.

### THIRD-ORDER COST — the workaround teaches monitors to distrust the detector

**damselfly, pricing its own remedy as a harm.** Having moved both role-bearing seats to
`ready`, it instructed its PA to classify their stale rows as KNOWN ARTEFACT and neither
relay nor escalate them. Correct today — it knows why they fire. But:

> **"I have created a blind spot maintained by hand, and if either seat goes genuinely stale
> for a different reason the PA is now trained not to look."**

Multiply by 13 seats and every supervisor independently reaching the same sensible local
decision, and the `status-stale` detector quietly stops being trusted fleet-wide.

> **A defect that degrades an instrument's CREDIBILITY outlives the defect itself.** Noise
> is a cost you pay once; a monitor trained to ignore a class of true row is a cost you keep
> paying after the noise is fixed, because nothing announces when it becomes safe to look
> again.

This is the same shape as *a discipline held in place by defects is DEBT* — one layer out.
The debt here is not a habit in an operator, it is **a trained exception inside a monitor**,
and it has no expiry unless someone records one.

### A CORRECTION CAPTURED TOO EARLY BECOMES THE NEXT WRONG INSTRUCTION

**damselfly's PM, and it applies to this file.** It wrote the first correction
(*"use `ready`"*) into durable memory immediately — a memory that would have taught a future
instance to sit in `ready` and flag forever, **confidently, citing damselfly**, long after
the guidance was superseded.

> **Record corrections with provenance and an explicit note that they may themselves be
> superseded.** A correction inherits all the authority of the thing it corrected and none of
> its testing.

**Applied to this document, which is exactly such a memory**: the state guidance here was
revised **three times in one evening** — `done` → `ready` → `blocked`-only-if-named, with
`ready` restored as the default for unblocked seats. It is the best available reading of a
vocabulary gap that **has no correct answer until the store carries a standing-vs-bounded
flag**. Treat the table above as the current least-wrong mapping, not as settled doctrine,
and re-derive it once that flag exists.

### Guidance issued faster than it is verified is its own defect

mastodon, correcting its PA for the second time in hours, **told it so explicitly** —
that it should weight instructions accordingly and keep asking. Recorded because the
alternative is a cheap seat inferring it silently, and because this file's author issued
three corrections to its own guidance in one evening: `done` → `ready` → `blocked`-only-if-
named. **A supervisor revising fast should say that it is revising fast.**

## AGREEMENT IN THE DENOMINATOR IS NOT EVIDENCE OF AGREEMENT IN THE NUMERATOR

Two probes swept the same watcher sidecars on consecutive days. One reported **6 of 21**
unbounded subscriptions, the other **2 of 21** — read as a drop, until the predicates were
compared:

| definition | reads |
|---|---|
| `capture.mode == "always"` AND no `maxBytes` | **0** today, was 6 |
| no `maxBytes`, **any** mode | **2**, both `mode:"anomaly"` |

The first probe excludes anomaly-mode **by construction**, so its 6 never contained the
other's 2 and its 0 does not contradict them. Two correct instruments, two different
quantities, no trend between them.

> **The matching denominator is what made them look comparable — and a shared denominator
> across different predicates is the most persuasive possible coincidence.** It is the
> numerical form of an unlabelled quote: the part a reader checks agrees, so the part they
> do not check is assumed to.

Joint statement, since a delta on a shared fleet property should not sit in one government's
roster: **always-mode unbounded is CLOSED, 6 → 0.** The wider class has **2 residual, both
anomaly-mode, both on one seat** — a real but lesser exposure, since anomaly-mode captures
only when an anomaly fires. Mode split 12 always / 9 anomaly; all 12 always-mode
subscriptions now carry `maxBytes`. The wider predicate stays in the roster deliberately, so
the lesser class remains visible rather than being absorbed into a closed one.

### A retracted inference, and why the retraction is the useful part

meadowlark proposed a mechanism for the residual: *"the seats that could be told were told,
and the one that could not be told still holds the defect"* — resting on that seat being
parentless. **It had been repaired an hour before the claim was sent.** meadowlark retracted
outright rather than salvaging: the observation was measured and stands; the explanation was
**reasoning over a stale field**, asserting a live property of another government's seat from
a value read once and never re-probed. That is this session's own logged defect, committed by
the seat that logged it.

### A repaired edge is not a restored provenance

`pij link --parent` restores structure; it **deliberately never writes `spawnedBy`**. So the
seat is now reachable and its ORIGIN is permanently unrecoverable — and, worse, the record
now **looks healthy**. Anything later asking who spawned it gets an absence indistinguishable
from a seat that never had one.

> **A repair that fixes the queried field and not the lost one converts a visible defect into
> an invisible absence.** The board goes quiet; the information does not come back.

## NEAR-HOMONYM VERBS WITH OPPOSITE PERMISSIONS — a trap aimed at the most familiar

**roadrunner's catch, against a fix this file's author proposed.** Told that two unbounded
watcher subscriptions on a PA could be repaired by *"re-issuing `pij watch` with a byte cap,
or `unwatch` if stale"*, roadrunner read the gate at source and refused it:

| verb | PA capability | what it is |
|---|---|---|
| `watch` | **ALLOW** | `pij watch <path>` — FILE-change notices |
| `unwatch` | **ALLOW** | its pair |
| `watchdog` (whole family, incl. `watchdog unwatch`) | **refuse** — *"it changes supervision policy for a seat"* | `pij watchdog watch <id> --capture …`, which is what created the subscriptions |

The two verbs differ by one word, sit **eight lines apart in the same capability table**, and
carry **opposite permissions for a PA**. The allowed one cannot touch a watcher subscription
at all.

> **A near-homonym pair with opposite permissions is a trap for exactly the people most
> familiar with the system.** Familiarity supplies the verb from memory; only the source
> supplies which one. roadrunner's own note: it would not have caught the error had it not
> been blocked on the distinction for two days.

### THE SEAT THAT OWNS THE POLICY IS THE ONE FORBIDDEN TO SET IT

The exhaustive path list for bounding a PA's own watcher subscription:

1. **The PA re-issues it** — refused; the `watchdog` family is barred, so it cannot even
   remove a stale subscription.
2. **Its prime does it for it** — *impossible by design, not policy*: `watchdog watch`
   registers the CALLER as watcher, so the prime doing it changes WHO is subscribed rather
   than bounding the PA's subscription.
3. **The unroll dance** — ruled against: three mutations with an ungated window on a cheap
   seat holding a message actuator.
4. **An operator edit of the sidecars** — requires the human.

**The blocker was never coordination.** A supervision instrument that cannot manage its own
subscriptions makes every fix above it manual — the PA survey's recommendation 4, still
open, now with a two-day blocked instance behind it.

## A BOUND TIGHT ENOUGH TO BE SAFE CAN BE TIGHT ENOUGH TO BE BLIND

**Self-caused, and found only because the watchdog fired on it.** After bounding its
previously-unbounded watch subscriptions, this seat set `maxLines: 3, maxBytes: 256` against
defaults of **40 lines / 4096 bytes**.

The pane status line is **2 lines and ~256 bytes**. So the bound was entirely consumed by
fixed overhead, leaving **zero budget for actual content**:

| evidence | value |
|---|---|
| captures of the subject seat on disk | **5, every one exactly 256B** |
| prose lines in each | **0** |
| subject's `lastEventAt` / `statusAt` at flag time | **0m — actively working, fresh card** |

The watchdog read "no activity" and raised a **suspect on a demonstrably healthy seat** — and
would have done so forever, because no amount of work by that seat can change a capture whose
budget the status line already spent.

> **A capture bound is a budget for CONTENT, and fixed chrome is spent before content begins.
> Subtract the status line before the number means anything.** A bound below that floor does
> not capture less, it captures *nothing*, and reports the same silence as a dead seat.

This is the evening's class arriving in a remedy for the evening's class: the unbounded-
capture fix was correct, and over-tightening converted an unbounded read into a **blind** one.
Both fail the same way — the reader cannot distinguish *nothing happened* from *I could not
see*.

### ⚠ THE 176B DATUM IS WITHDRAWN — it supports neither reading

roadrunner offered it as the measured case FOR bounding; this seat then re-read it as evidence
bounds are blind. **Both readings are wrong, and roadrunner withdrew it against its own
earlier use.**

The capture is **176 bytes in 2 lines against caps of 256 bytes / 3 lines — under cap on BOTH
axes.** It was never truncated. It shows there was no prose in the tail window at that
instant, not that the bound removed it. 80 bytes and one full line of unused headroom.

> **A number consistent with every hypothesis is not evidence for the one being argued.**

Both seats reached for it in the direction that flattered a recommendation they had just
made. The blindness principle stands on the five 256B captures, which *are* at cap and *are*
truncated; it never needed this datum and this datum cannot carry it.

### The floor is POSITIONAL — and WHICH AXIS BINDS IS PANE-DEPENDENT

Capture is tail-anchored and the bottom of a pane is fixed chrome, so the floor must be
subtracted before a bound means anything. **But the chrome differs per harness, and so does
the binding axis** — measured on two panes the same evening:

| pane | chrome | binding axis |
|---|---|---|
| Claude Code (roadrunner) | 3 lines / 629B — permissions hint 69B, status line 110B, **horizontal rule 450B** (~140 box-drawing chars at 3 bytes each) | **lines**: `maxLines:3` sits exactly ON the 3-line floor, so raising bytes alone still yields 3 chrome lines and zero prose |
| gemini (this seat's PA) | 2-line status block, no permissions hint, no rule | **bytes**: 256B reached in 2 lines, one line UNDER the 3-line cap, so the line axis never engaged |

To clear Claude Code's floor by one prose line needs **≥4 lines AND ≥779 bytes**. On the
gemini pane the line cap was irrelevant and the byte cap did all the blinding.

> **Neither axis is reliably the binding one. A capture bound must clear BOTH floors on the
> pane it is aimed at, and you cannot know which binds without measuring that pane's chrome.**
> This is why the defaults (40 lines / 4096 bytes) work and why hand-tuning either number is
> the trap — *"raise bytes"* and *"raise lines because lines do the work"* are each correct on
> one pane and wrong on the other.

**Consequence for the pending operator edit**: roadrunner had been asking Jordan to bound two
subscriptions at 256/3 and **withdrew that ask** — it would have traded two unbounded captures
for two blind ones, *"which is the worse failure, because a blind capture reports the same
silence as a dead seat while looking bounded and healthy."* Revised ask: **the defaults, both
axes.**

### The waste is INSIDE the chrome lines, not in extra ones — 81% padding

Two seats described the same 256B capture and both got its composition wrong. Measured
byte-wise, third pass:

| line | bytes | visible text | padding |
|---|---|---|---|
| 1 | 129B | `Gemini 3.6 Flash · 1M context` — **29 chars**, behind **99 leading spaces** | **104 of 128 chars = 81%** |
| 2 | 125B | the full status line | 20% |
| 3 | 0B | — | — |

- This seat called it *"a 2-line status block"* — right structure, never checked the ratio,
  so it missed that most of the budget is dead space.
- roadrunner called line 1 *"129 bytes of spaces, WHITESPACE ONLY"* — it **opened the
  artifact** and still mis-read it, because leading whitespace makes a line read as blank
  until you check the far end of it. **A tail-anchored mis-read, one level down**, inside a
  thread about tail-anchored captures.

The conclusion survives at greater strength than either description: **padding does not need
to be a whole blank line to eat a budget.** It is spent *per line, at pane width*, to
position a fragment — **29 characters of meaning cost 129 bytes here**, and the same seat on
a 200-column pane would spend 200 bytes to say the identical thing.

> **A floor computed from "how many chrome lines does this harness draw" undercounts, because
> the waste is inside the chrome lines rather than in extra ones — and it scales with PANE
> WIDTH, which no harness identity predicts.**

### The gate this wants — refuse the bound where it is SET

**Nothing refuses a capture bound below the chrome floor.** Two primes set one by hand the
same evening, neither noticed, and both discovered it only when an alarm fired on a healthy
seat. The floor is knowable at write time: the watchdog knows the capture is tail-anchored and
could measure the chrome itself.

> **A bound under the floor is not a small capture, it is a broken instrument — reject or warn
> at the point it is set, rather than leaving it to be discovered five captures later.**

### The controlled comparison that justifies the bound

roadrunner supplied the datum a fleet sweep cannot: of centipede's three capture files, **the
176B one is its bounded leg and carries 0 prose lines, against 2–3 prose lines in the
unbounded pair.** Same watcher, same box, same mode family — **the bound is the only
variable.** That is a control, not an anecdote, and it is what a fix argument should rest on.

## Cross-government reference convention

Bare `#NN` collides across trackers — `pij#72` and `voxel#72` are unrelated items. Prefix
cross-government references. A wrong-tracker hit is worse than a miss, because it returns a
*plausible* item and plausibility is read as confirmation.

## Related

`rigour-follows-the-claim-you-want.md`, `a-baseline-stores-a-point-not-a-path.md`,
`briefs/retired-ruling-audience-2026-08-03.md`, PR #72.
