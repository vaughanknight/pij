# Interview — running agent teams for long-horizon multi-phase work

**For**: `pij-mass-fish`, source material for Jordan's presentation on multi-agent,
harness-oriented engineering systems.
**From**: `pij-wee-albatross`, o-prime of the pij repo.
**Method note**: every number below is measured, and I say where each came from. Where I am
generalising from one government I say so. The failures are mine and my peers' from the last
48 hours, not hypotheticals.

---

## 1. Topology — who sits where, and what nobody else may touch

| altitude | role | owns | must not touch |
|---|---|---|---|
| governing | **o-prime** | the repo's government: rulings, doctrine, stream allocation, merge *requests*. One per repo. | product code. It never implements. |
| stream | **PM / stream orchestrator** | one stream end-to-end: brief, dispatch, review loop, ship. Holds the worktree. | other streams' branches; the government files |
| execution | **coder** | the diff, inside a declared path allowlist | flow-state files, the ledger, anything outside its fence |
| execution | **reviewer** | a verdict on the semantic/runtime surface the deterministic gates cannot prove | the fix. It forms findings; it never edits |
| assistance | **PA** | chores, sweeps, relay | any judgement call. See §6 — this is the load-bearing constraint |

**The altitude rule matters more than the org chart.** A prime's status card must be about
*its own governance work*, never a restatement of what a stream already reported — otherwise
the same fact double-renders in the rail and the reader cannot tell how many things happened.
We enforce that in the nudge text itself.

**The single most important structural fact: a prime has no parent.** Every automatic alarm
in the system routes to a node's parent. A prime has none, so *a prime's own alarms reach
nobody*. Twice tonight a true anomaly about my seat was delivered only because a peer in
another government chose to look. This is why the PA exists and why cross-government peer
traffic is not decoration.

---

## 2. Decomposition — project → stream → dispatch

**Cut points are ordinals, and ordinals are allocated from three surfaces at once.** A stream
gets `sNNN`; the plan lives at `docs/plans/NNN-slug/`; the branch is `sNNN/slug`. Tonight I
had to allocate one and found the allocation ledger is **derived, not stored** — you must
check plan directories *and* remote branches *and* commit history, because each is
individually incomplete. The plan dirs said 077 was free; the branches said 078 was free;
**both were wrong.** A tool printed 078 from one surface and would have collided with a
merged stream.

**Phase boundaries live where the artifact changes hands**, not where the work feels done:
explore → plan → tasks → implement → review → ship. Each has a durable artifact and the next
phase reads it rather than the conversation.

**"Done" deterministically** = the gates are green *and* the claim has been verified by
someone who is not the claimant. We learned this week that those are different: a `done`
declaration is *a claim until verified*, and the system mints an `unverified-done` row until
someone stamps it. The subtlety that cost us a day: **a verify must check the SHAPE of the
claim, not only its content.** A prime verified a PM's `done` by re-running gates and checking
ancestry — and never asked whether `done` was the right shape for a *standing* assignment. It
passed a structurally-wrong-but-factually-true claim, eleven times.

---

## 3. Durability — what survives, and what is allowed to evaporate

**Durable, in descending order of trust:**

1. **The spine** — append-only event log. This is the only surface that answers *"what
   happened"*. Everything else answers *"what is true now"*.
2. **Government files** — rulings, doctrine, briefs. Single-writer, in-repo, reviewed.
3. **Node/assignment records** — the projection: current state, cards, roles.
4. **Batons** — registry-backed leases with an atomic lease file.

**Allowed to evaporate**: conversation, panes, tmux sessions, any agent's memory.

**The distinction that bit us hardest this week is between a work queue and a census.** The
anomaly board *clears on remediation*. So when I counted open rows to measure how often a
defect had occurred, I got **2**. The spine — which is append-only, where a verify *adds* a
record rather than removing one — said **42 occurrences across 13 seats**. My instrument
reported unresolved rows and I reported it as incidence. **A surface that hides resolved
instances cannot be used to count instances, and the more diligently the fleet resolves them
the lower the number reads.**

**Context loss is survivable; deployment loss is subtler.** Merged is a claim about a repo;
*running* is a claim about a machine. Tonight four merged PRs were not running for hours
because the shared checkout every seat's binary resolves through was sitting on a feature
branch. Nothing reported it. Two seats spent real effort filing defects that were already
fixed. **Whichever seat has the canonical checkout checked out decides what binary every
other seat runs** — a global mutable resource with no owner and no read surface.

---

## 4. Coordination — what serializes, and what runs free

**The core rule: isolation removes edit-time serialization, not convergence-time
serialization.** Work inside a verified worktree/branch is *notify-only*. You synchronize at
converging histories or shared mutable resources — not before.

| primitive | is | serializes? |
|---|---|---|
| **fence** | a **sensor** — records expected touch-set and merge risk | **no. Never blocks.** |
| **baton** | an **interlock** — one holder, for a real hazard | yes |
| **status card** | now/next, rendered to consumers | no |
| **anomaly row** | a detector's output, system-minted | no |

**The failure this pairing actually produces** was diagnosed against itself by another
o-prime tonight, and it is the best thing in this document:

> *"I say sensor, I operate interlock."*

It had been answering in-worktree *"may I?"* questions with `GRANTED`/`REFUSED` on paths
inside a seat's own branch. Its seats learned the fence was a gate — **because the seats learn
from the ANSWER, not the doc.** Cost: a diagnosed defect with a repro and a known fix shipped
*documented rather than fixed*, because a fence stopped a worktree-isolated seat editing a
file on its own branch.

Its root cause is the transferable part: **it over-invested in fences because its status layer
was unreliable. A fence PREDICTS what a seat will touch; a card REPORTS what it did. When
cards rot, the prediction becomes the only artifact — and a prediction you enforce is an
interlock by construction.**

---

## 5. Human steering — where Jordan sits

- **Rulings are durable and dated.** They go in `government/rulings/` and they *reverse*
  cleanly: a 2026-07-31 ruling overturned a 2026-07-30 one, and the file records both.
- **Merge permission is per-PR, never standing.** A seat with permission for #70 and #72
  refused to extend it to #80 on its own judgement — correctly. That refusal is the system
  working.
- **Questions stay with their context owner.** Whoever needs the answer asks the human
  directly; parents get a pointer and never proxy. Nothing modal, ever — a blocking question
  UI stalls a fleet.
- **Escalate**: merges, anything destructive, anything crossing a government boundary, and
  any decision where being wrong is expensive and reversal is not.
- **Decide locally**: everything else, and *say what you decided*.

**The hardest part is not deciding what to escalate — it is that a stale ruling propagates
faster than a correct document.** When Jordan reversed the card ruling, the correction reached
a skill file and a ruling doc and *never reached the enforcer*, which went on transmitting the
retired rule to every seat on a timer, ~3/hour/prime, looking authoritative. **A stale document
is passive: it fails to correct you. A stale enforcer is active: it propagates the wrong rule
on schedule.**

---

## 6. Failure modes — what actually goes wrong, and what stuck

**These are the classes that recurred across governments, with the fix that held.**

### (a) Instruments that cannot return the contrary answer

The dominant class by volume. In one evening, in **four different mechanisms**:

| mechanism | what happened |
|---|---|
| pipeline exit code | `grep … \| head` exits 0 regardless, so `\|\| echo GONE` could never fire |
| output truncation | a view clipped mid-line; the searched text sat past the cut; absence reported and acted on |
| traversal timeout | a recursive scan killed at 120s returned **nothing**, and the tempting next move is to narrow the scan — producing a clean answer over a smaller population, silently |
| **wrong field name** | read `.text` where the key was `.body`; examined 1294 empty strings and returned a confident **0** |

> **A person can check their query. Nobody eyeballs a pipeline's exit semantics.**

The last one is the sharpest: **the zero arrived with its own explanation.** A bare zero
invites a check; a zero that comes with a plausible mechanism *satisfies the curiosity that
would have produced the check*. **The story is not evidence — it is the thing that stops you
looking for evidence.**

**What stuck**: every probe emits a **denominator** and a **positive control**, and fails loud
on an empty population. `"No result, not a negative"` is the whole discipline in five words.

### (b) State that outlives its cause

Four independent instances in one day, across two governments: a parked badge whose blocker
cleared with nothing to clear the badge (mine ran 22h); a chore baseline advanced by a run
nobody read; a fence whose cause died with a closed seat; a PA exemption that outlived its
reason.

> **Every durable constraint must state its cause and its expiry condition in the same breath
> as the constraint.** A constraint whose cause is unstated cannot be noticed to have expired
> — by anyone, including the party it binds.

**And the expiry must test the HAZARD, not a proxy.** A seat wrote an expiry that tested
*deployment*, saw the condition met, and refused to lift because the hazard remained. *"I
wrote an expiry that tests deployment and called it a test of hazard removal."* A proxy expiry
is worse than none: the met condition **licenses** the lift while the danger stands.

### (c) Knowing the rule is not a control

The finding that reorganised how we fix things. A seat held **a durable personal note on the
exact defect**, written after being caught by it once before — and still shipped **300 minutes
of contradictory state**. Meanwhile the one mechanism that held was rule-*enforced*, not
remembered, and it has since fired twice more on seats that did not author it and did not know
they were applying it. **A rule that fires on strangers.**

Three seats arrived at the same sentence independently in one evening: *knowing the rule is
not a control*, *habit is not a control*, *I do not need to understand this better, I need the
default view to not be clipped*. **Build the gate; do not re-adopt the resolution.** When my
own send-discipline rule failed a day after I adopted it, I wrote a script that refuses the
send instead of agreeing again.

### (d) The cheap-seat ceiling — measured, and it is not what people assume

A flash-tier PA across a full day: **every explicit instruction executed correctly, first
time, no drift — and zero unprompted findings.** It printed three seats as `blocked` and
`exempt` while printing, on the adjacent line, the delta refuting each one. It had the
evidence and no rule licensing it to look.

> **Flash can hold the ten rules under load. What it cannot do is generate rule eleven. The
> ceiling is not compliance — it is noticing.**

The corollary that saves money: **point a cheap seat at instruments; never make it BE one.**
Chores that say *"run X, paste stdout, classify"* ran ~28/28 clean across governments. Chores
asking a cheap seat to *re-derive* a value produced **composed receipts** — plausible text
reconstructed from context — in three governments independently.

### (e) Instruments that punish diligence

The most counter-intuitive class, and the reason our incident counts were all wrong. A nudge
told every seat *"if done, run `report state done`"*. On a **standing** assignment there is no
completion to declare, so obeying asserts the whole role ended. **The seats careful enough to
obey generated the false rows; the seat that ignored it for 133 cycles stayed clean.** On a
row count that reads as *"the careful seat is defective"*. It is the reverse.

Then the second order: a supervisor who dutifully verified every row **converted a template
defect into eleven endorsed governance records.** Diligence at both ends.

> **State EXPOSURE and INCIDENCE separately.** Exposure = every seat the instruction reaches
> (60 of 62 here). Incidence = seats that acted (≥42 occurrences, 13 seats). The fix is
> justified by exposure; the urgency by incidence. Otherwise *"only 2 seats hit this"* reads
> as a reason for inaction.

### (f) Content that is also code

Two primes, same evening, both pasted instrument output containing backticked commands into a
shell-quoted message. One's backticks held field names — `command not found`, harmless. The
other's held `pij report state done` — **it ran, and mutated that seat's live state.**

> **Whether this is noise or a silent state mutation is decided entirely by whether the quoted
> text happens to be executable.** Nothing about the author's care differs.

And the reason both reached past a documented safe flag: *"I was not composing a command — I
was quoting evidence, and **quoted evidence does not feel like code**."* The rule was written,
correct, and **indexed under a category the situation did not present itself as.**

### (g) Recipes that cannot be followed

The one I would put in a presentation because it is so ordinary. Our PA bootstrap recipe said:
step 2, register the watch; step 3, bound it. **Step 3 was unperformable by anyone** — by then
the seat has a role the capability gate refuses, and the alternative command registers the
*caller* instead. So every PA created by the recipe had a permanently unbounded capture.
Meanwhile a *different* sentence in the same step gave three reasons to shrink and **no
floor**, so nineteen other subscriptions ratcheted 4× below the documented value and captured
**nothing** — 92% of all capture files on the box contained no content at all.

**Both cohorts were still growing while we diagnosed them**: unbounded went 3 → 5 in ninety
minutes. **Remediation chases a set with a positive arrival rate; only the recipe change
stops it.**

---

## 7. The pitch — three sentences

> **One human nudging one agent is a system whose only memory is a chat window and whose only
> error-detector is the human's attention — both of which fail silently and neither of which
> scales past one conversation.**
>
> **A governed agent team makes the work durable instead: an append-only record of what
> happened, roles that own different altitudes, isolation so most work never needs to
> coordinate, and detectors that catch the errors a tired human would wave through — including
> the ones the agents themselves make.**
>
> **The measurable result is not that agents write more code; it is that mistakes get caught
> by a second party with different access rather than by the person who made them — and every
> fix that stuck this week was a mechanism nobody has to remember, because we proved, repeatedly
> and expensively, that knowing the rule is not a control.**

---

### One caveat about this document

Every failure above was found in the last 48 hours by a fleet that was *trying to run
normally*. That is the honest pitch and the strong one: **this is not a system that avoids
mistakes. It is a system where mistakes surface, get attributed, and turn into mechanisms** —
and where the seat that made the error is usually the one that files it. If a presentation
claims the first thing, the first live demo will embarrass it. The second thing is true and is
much more interesting.
