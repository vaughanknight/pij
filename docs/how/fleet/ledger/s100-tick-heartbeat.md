# Ledger — stream s100 `tick-heartbeat`

Seat `pij-complex-bat` (Copilot CLI · claude-opus-5). Branch `s100/tick-heartbeat`, base
`a2a50e2`. Charter pij#180 Fix A. Second stream for this seat; s092 `install-blocker` (PR #177,
merged `a2a50e2`) holds **F-100…F-106** in `ledger.md`, and **F-107…F-109** were handed to o-prime
by pointer for the fleet PR.

> **On the s092 block**: left where it is — and this is now **ruled**, not merely my judgement.
> Already-merged blocks (s092, s093, s096, s098) are relocated by o-prime in **one** commit after
> the directory exists; closed streams do not move their own. My independent reasoning had reached
> the same place: merged rows are written to by nobody, so moving them buys no single-writer
> benefit and costs a large `ledger.md` edit colliding with the very restructure it is part of.
> **The ruling's purpose is to stop *concurrent* streams sharing a file; merged rows are not
> concurrent with anything.**

---

### F-110 · "What would still be true if the replacement were a no-op?" must be asked ONCE PER MECHANISM

o-prime's question, applied to this stream's Phase 2 table **before** implementation. The result
is the finding:

| AC | if the overlay were inert | |
|---|---|---|
| AC-04 | **FAILS** | sees the overlay |
| AC-05 | **FAILS** | sees it, from outside |
| AC-06 | passes | blind (correctly a guard) |
| AC-08 | passes | blind — tests Phase 1's *removal* |
| AC-09 | passes | blind — hence mutation-only |
| AC-12 | passes | blind to overlay, sharp on the **scrub** |
| AC-13 | passes | blind to overlay, sharp on the **prune** |

**Four of seven pass against a completely inert overlay, and not one of them is a defect.** Every
previous vacuity finding this wave has had a villain — a test that could not fail, a mutant that
could not land, a criterion mislabelled. This one has none: seven correct criteria, each doing its
own job, and the aggregate still misleads. **The defect is in the reading, not in any row.**

*Why the four criterion labels cannot reach it*: they classify a criterion by its relationship to
**the fix as a whole**; this question classifies it **per mechanism**. AC-12 is honestly
behavioural *and* blind to the overlay simultaneously — no contradiction, and no label expresses
it. **A phase with N mechanisms needs N passes.**

*Operational output, and the reason it is worth the effort*: the per-mechanism count here is
**overlay 2, scrub 1, prune 1** — and **the 1s are where the reviewer attacks**. A single
criterion per mechanism has **no cross-check**: if it is vacuous, nothing else in the phase would
notice, and its greenness is indistinguishable from coverage. This converts "attack the newest
test" into something a reviewer can **compute from a table** rather than intuit.

*Cost*: one pass over a seven-row table, pre-implementation.

---

### F-111 · A removal criterion certifies only half a change

Found by the coder (`pij-gorgeous-guan`) when mutant M1 failed to kill AC-07.

> **A removal criterion cannot distinguish "replaced correctly" from "removed and nothing put
> back."**

AC-07 asserts the descriptor no longer carries `lastTickAt`. It is genuinely behavioural, honestly
fails pre-fix, and is **structurally blind to a broken replacement** — the field stays absent
whether the new mechanism works or is a no-op. It **survives** the mutant that guts the
replacement **and is right to**: absence is exactly what it asserts. The defect is never in the
criterion, only in treating it as *sufficient*.

*Remedy*: every removal criterion needs a **positive partner** naming where the behaviour now
lives. Here that is AC-05.

| | AC-07 (removal) | AC-05 (positive) |
|---|---|---|
| asserts | the old mechanism is **gone** | the behaviour still **works** |
| kills | a fix that never removed the writes | a fix that removed them and put nothing back |
| blind to | a broken replacement | a fix that also left the old writes in place |

Drop AC-05 and AC-07 certifies a system that **deleted a feature**. Drop AC-07 and AC-05 passes on
the unfixed tree.

*Extended by the Phase 1 reviewer* (`pij-glad-stingray`), further than the author had: **AC-02 is
also half a removal pair**, and **AC-01/AC-03 prove the daemon *invokes* its injected port while
staying blind to the concrete port being broken after the call**. Both layers pass against a spy.

---

### F-112 · `--expect` can prove a NEGATIVE, which is the only mechanical discharge of an independence claim

Every mutation table implicitly asserts independence — *this mutant kills these and not those* —
and until now that half was pure assertion.

*Evidence*: the coder re-ran M1 with `--expect AC-02` and got
`GATE FAILS: 5 test(s) failed, but NONE matches --expect AC-02`, exit 1. That is a machine-checked
proof that M1 does **not** kill AC-02 — a claim previously discharged by reading a list.

---

### F-113 · A mutation table is itself an untested claim, and it fails in the direction nobody guards

This stream's table predicted **M1 kills AC-01 only**. Observed: **five tests**. Two further
pairings were false — M1 did not kill AC-02 (predicted correctly, proved by F-112) and **M3 did
not kill AC-06** at all; its real target was AC-13.

**The instinct is to worry about tables that over-claim, because that is the flattering error. A
table that under-claims is exactly as unchecked** — the failure is not optimism, it is
*unverified specificity*. Nothing anywhere checks a mutant-to-criterion mapping; the whole gate is
built on the assumption that the mapping is sound.

*Remedy, mechanical and cheap*: run each mutant, record **which tests actually died**, and correct
the table from the **observed** kill set. `--expect` gives it for free.

---

### F-114 · A check that punishes documenting its own rule

`mutate.mjs` refused this stream's store spec because the spec's **header comment named the banned
APIs** — the scan is a plain `src.includes(marker)` and cannot distinguish **use** from
**mention**. The spec is subprocess-free *by design*; the comment explaining why is what violated
the check.

**It punishes the seats who understood the constraint well enough to write it down**, and teaches
"do not explain this rule in a file the rule applies to" — backwards from what the rule wants.

*Remedy preferred*: strip comments before scanning, rather than add a `// mutate-ok` opt-out. The
defect exists **precisely because the tool cannot read intent**, so adding a way to *declare*
intent is a bigger surface than removing the false signal.

*Family*: third defect in that tool the same day, one cause — **the scan asks "will mutation reach
this code" and answers "does this text appear nearby"**.

---

### F-115 · Category 7 — files the ENVIRONMENT SETUP creates or modifies

`npm install` in a fresh worktree dirties `package-lock.json` by itself, from npm normalising the
committed lockfile — nobody's work, nobody's process:

```
engines: + "npm": ">=11"
bin:     "pi-ai": "./dist/cli.js"  ->  "dist/cli.js"
```

Category 2 is *what the process creates* (plan folders, ordinals). This is a category **below**
that: **the setup the process requires** created it. Invisible to every partitioning conversation,
because a partition is drawn over the **work**, and this exists before any work begins.

Worse than category 6 in one specific way: **neither stream authored the change**, so both parties
to the conflict are entitled to be baffled by it.

*Correction attached, because the row was over-claimed when first reported*: the author asserted
"every stream that paid the install tax has this in their tree right now" having measured **only
its own**. o-prime scanned all 55 worktrees: **zero dirty**. The hazard is **conditional** on
running `npm install` inside the worktree. **A fleet-wide warning that turns out to be
zero-incidence trains its audience to discount the next one** — measure blast radius before
broadcasting, not after.

*Cheap remedy*: check `git status` for `package-lock.json` before committing; revert it
(targeted single-file) unless a dependency actually changed.

---

### F-116 · Independent validation caught a defect that would have inverted the fix — and the criterion covering it would still have passed

The plan's overlay design was returned **NOT SOUND** pre-implementation. `publish()` takes
`existing` from `this.read()` (`fs-registry.ts:204`), and callers spread read results into writes —
including `stampSenderActivity` (`core/cli.ts:2179`) on **every `pij send`, in a CLI process**.
Under a naive overlay the synthetic stamp is **persisted back**: the removed writes return, in CLI
processes, on the most latency-sensitive path in the system. **A performance fix that relocates
its own cost onto the path it was measured against.**

**And AC-07 would still have passed**, because it samples immediately after a tick, before any
read-modify-write has run — a criterion agreeing with reality without being able to disagree, in a
plan whose own section warns about that class, written by the seat that logged F-106 about it the
same morning.

*The lesson is not "be careful"*: caring about the class demonstrably does not catch it. What
caught it was **asking a validator to trace every write whose payload derives from a read** — a
mechanical question, not a vigilant one.

*Remedy shipped*: scrub at the durable-write boundary; AC-12 pins it, and **must run against the
real `FsRegistry`** — `FakeRegistry` has no overlay (`adapters/fakes.ts:164-190`) and would pass in
a world where production fails.

---

### W-110 · A reviewer-authored mutant closes the gap a reviewer-run mutant cannot

Earlier this wave it was relayed that a coder+reviewer pair gives the independent mutation run
"for free". This stream qualified it: **the pair buys independence of RUNNER, not independence of
MUTANT.** Both can run the same list, so a defect nobody thought to mutate for survives two
independent confirmations.

*Closed empirically within the hour*: the Phase 1 reviewer wrote a **merge-not-replace** mutant
nobody specified, with `--expect "replaces the file wholesale"`, and it killed that exact test by
retaining a departed id.

**The two conditions that made it affordable were design choices, not luck**: the specs are
subprocess-free *by design*, so the fast in-memory transform reached them, and the reviewer needed
**no write access** to the author's tree. A decision that looked like a small preference bought a
reviewer the ability to **attack** the change rather than check the author's homework.

---

### S-110 · Ask "what would still be true if this mechanism were a no-op?" per mechanism, and publish the counts

Encodable form of F-110. For each phase, list its mechanisms, and for each criterion record which
mechanism it can observe. Publish the per-mechanism count in the PR body and the review packet.

- A mechanism with **0** criteria is unproven and the phase is not done.
- A mechanism with **1** is the reviewer's highest-value target — no cross-check exists.
- A reader counting green ticks otherwise attributes the whole table to every mechanism in it.

Cheap enough to do by hand today; mechanical enough to generate later from a criterion table that
names each row's mechanism.

---

### F-117 · Every gate this wave built interrogates GREEN; there is no instrument that interrogates RED

Mutation, `--expect`, fail-first, per-mechanism no-op, reviewer-authored mutants — **all of them
ask whether a PASS is real.** Nothing asks whether a FAILURE is.

*Why the asymmetry exists*, which matters because "be rigorous in both directions" is unactionable:
**skepticism follows the direction of alarm, not the direction of uncertainty.** A red arrives as a
*finding*; a green arrives as *nothing*. So concluding "regression" **feels** like the conservative
call — and it is not: it costs a wrongly-blamed merge, a revert, and hours of investigation, none
of which gets counted. Same shape as over-voiding: **the seemingly-cautious error is the one that
leaves no trace of its cost.**

*Evidence, three instances in one afternoon*: one stream read a single red as a regression against
a merge that had not caused it; two read single greens the hopeful way. All three were single runs,
by seats that had spent the day proving a single green means nothing.

**The instrument already exists and has never been named: THE ISOLATION RUN.** Running a failing
spec alone is the exact analogue of a mutation run, pointed the other way — a mutant asks whether a
**pass** survives a change that should break it; an isolation run asks whether a **failure**
survives removal of everything around it. It has been used all day as a *debugging step*, not as a
gate: nobody would now report a green without naming the mutant they ran, and everybody reports a
red without saying whether they ran it alone.

*Remedy, one sentence rather than a tool*: **a reported red carries its isolation result the way a
reported green carries its mutant.**

*The ladder, by increasing cost — only the last answers "regression"*:

| instrument | question answered | cost |
|---|---|---|
| grep + a **control symbol** | is the symbol even in that file | ~0 |
| isolation run | does the red survive alone | 1 run |
| disjoint victim sets | is it deterministic **at all** | 2 runs |
| rate at both bases | did the rate **go up** | ~16 runs |

The control symbol is not optional: **a zero-hit grep and a broken grep are the same observable.**

---

### W-111 · Disjoint victim sets exclude determinism in two runs rather than sixteen

`run 1` fails spec A; `run 2`, on **identical bytes**, fails B and C while **A passes**. If run 1's
failure were deterministic it would recur in run 2; if run 2's were, it would have appeared in run
1. **A single observation excluding determinism for both sets.**

*Measured here*: run 1 `core/worktree.test.ts`; run 2 `adapters/git-repository.test.ts` +
`core/chores/drive.test.ts` with worktree green; all three pass in isolation (7/7, 3/3, 36/36);
`git diff` on their sources empty; none references any surface this stream touched.

*Independently corroborated across streams*: `adapters/git-repository.test.ts` appears both here and
in another stream's 8-run rate measurement on a different tree — two streams, two trees, two
methods, same file.

**Do not substitute it for the hard question.** Disjoint victims answers *"is this mine"*. Only a
rate answers *"did the rate go up"*, which is the only thing distinguishing a regression from a
pre-existing intermittent.

---

### F-118 · A correct list sorted by the wrong question is indistinguishable from a correct audit

**Not the census problem — nothing was missing.**

A falsified repair claim ("a lost stamp is regenerated 600ms later BY DEFINITION") had been copied
into five places. The PM enumerated **all 22** repair-shaped comments across the owned files and
classified four as false. The coder **audited the list rather than trusting it** — the right move —
and independently confirmed four. **Both missed the same two**, which were then found by a reviewer.

*The mechanism*: both parties were silently answering **"is this comment about the change we are
making?"** — for which the answer is genuinely *no* — instead of **"is this an unconditional repair
claim?"**, which was the question the PM had written down and handed over. **The failure is not in
the checking. It is the silent substitution of a nearby, easier question**, and nothing in the
output distinguishes the two.

> **Agreement is evidence about the answerers, never about the question.**

*And the second opinion made it worse.* The coder's independent confirmation **raised** the PM's
confidence in a classification both had derived from the same misreading — the opposite of what a
second opinion is for. **Two parties agreeing on the wrong question is not corroboration, and it
feels exactly like corroboration.** (Same family as two censuses of 14 sharing zero members, in a
more convincing costume: two audits of *one* list sharing one wrong predicate.)

*Remedy*: **state the sorting question in the artifact, beside the list, in the imperative — and
have the auditor RESTATE IT before classifying.** The question was handed over; it just never
travelled into the act of sorting, and a restatement is where the substitution becomes visible.

---

### F-119 · A false rationale attached to a true conclusion has no failing observable anywhere

Why those two survived every check: **they justified the fsync decision, and the fsync decision is
correct.**

> **Checking the conclusion confirms nothing about the rationale — and the conclusion is what a
> reader checks.**

Tests pass. The design holds. The sentence is false. Every reviewer who validated *"no fsync is
right"* validated it **correctly** and left the reason untouched — and **each correct validation
made the false reason look more established.**

*The corrected form shows the true justification was always one step away*: the decision is sound
**not because the value regenerates**, but because **a missing stamp reads `unverified`**. The
safety was always in the **reader's degradation**, never in the regeneration. The false rationale
was doing work the true one could have done, standing right beside it.

*Follow-on rule*: **when you falsify a mechanism, re-derive every conclusion that cited it** — not
to overturn them, but because a conclusion surviving on a *different* argument is now **undefended
in the document**, and the next reader inherits the dead reason rather than the live one.

*Applied here, with the sorting question stated first*: one further site cites the tick
(`fs-registry.ts:1487` — "a control-plane peer's 600ms tick can no longer hold a 60-hour-dead record
in the hot tier"). **Classified sound**: it asserts the *removal of an axis*, not a regeneration
guarantee, and does not depend on a next tick occurring.

*Provenance*: found because the reviewer was asked to **"falsify my list"** rather than **"review
the change"**. A diff-scoped reviewer had validated the surrounding decision several times and was
never once pointed at the sentence underneath it.

---

### F-120 · Recall is the only enumeration method with no mechanism behind it

Every other scope failure in this stream came from **a tool's default** (`rg` skipping hidden
paths; a `**/` glob dropping top-level files) or **a predicate's shape** (readers vs deleters;
writers vs mutators). Both are **auditable**: run a control, discover the instrument was wrong.

A sixth copy of a falsified claim survived four sweeps because the sweeps **enumerated filenames
from memory**. The missed file was one the author had written, in a directory already being
searched.

> **Recall is the only enumeration method that produces a confident, complete-looking answer with
> no mechanism behind it at all.**

Nothing to control. Nothing to re-run. **No way to discover the omission from the output.** Every
other zero that lied in this stream had *something* to interrogate; this one has only the person —
which is why it is its own kind rather than another instance.

*Fix, and the property that matters is not that it is bigger*:

```sh
git diff origin/main...HEAD --name-only | while read f; do grep -Hn "<claim>" "$f"; done
```

**A derived scope cannot omit something you forgot you wrote.** Its completeness does not depend on
you.

---

### F-121 · Correct a live rationale; ANNOTATE a dispatched record

A seventh copy sat in a **review packet** — the author asserting the false rationale to the
reviewer as his position, and asking it to confirm. Two artifacts, two treatments:

| artifact | treatment |
|---|---|
| **live rationale document** (dossier, plan, PR body, source comment) | **correct the claim** |
| **record of what was dispatched** (review packet, execution log) | **annotate above it; leave the text** |

> **Rewriting a dispatched artifact destroys the record while appearing to correct it.**

A packet's value is that it is **evidence of what was actually asked** — including that the author
asked a reviewer to confirm reasoning he had already got wrong. **That is the part a later reader
most needs and the part a tidy edit removes.** It is also the strongest available defence of
amend-in-place over rewrite: the wrong version is not clutter, it is the only surviving evidence of
what the reviewer was working from.

---

### F-122 · A search ORDER presented as a filter invites the wrong-question substitution

A coder found that surviving false claims correlated with **age** — every one predated the
falsification, every passage written during the review rounds was correct. Relayed upward as "a
cheaper sweep", and recorded as doctrine before anyone asked what it could misclassify.

**The reviewer's correction**: Phase 1 text *also* already contained the correct degradation
wording, so

> **age predicts where to look FIRST. It never predicts what a passage SAYS.**

*The failure it invites is F-118 arriving inside F-118's own remedy*: a filter framed by age gets
applied by answering **"is this old?"** instead of **"is this false?"** — the silent substitution of
a nearby, easier question, in the fix for the finding about silent substitution.

**A prioritisation signal and a classification rule are different artifacts.** Say which one you
are shipping.

---

### F-123 · Scope and pattern are independent axes; fixing one produces the confidence that stops you checking the other

A falsified claim survived a sweep whose **scope was derived and correct** — `git diff
origin/main --name-only`, 39 paths, immune to the recall failure that had just been fixed (F-120).
It survived because the **pattern** was hand-written: `600ms` does not match `600 ms`.

**Two spellings of one claim, one of them the author's own from an hour earlier.**

> **A derived scope with a hand-written pattern is only as complete as the pattern — and the
> pattern is the half with no mechanism.**

This is a *distinct* mechanism from the earlier scope failures. Those were never audited at all.
**This one was audited on the wrong axis and passed** — and it felt like completeness precisely
because the audited half was the one that had just failed.

*Operational half*: the reviewer that found it used **a semantic predicate applied to read text**
(*"does this assert a tick will run?"*); the author used **a literal string**. The literal is
cheaper and **silently encodes an assumption about spelling** — an assumption nobody writes down,
because it does not feel like one.

---

### F-124 · Rules do not fail by being wrong; their application contracts to the case that produced them

F-121 was written as *correct a live rationale / annotate a dispatched record*. Its author then
applied it **only to his own artifacts** — the dossier he wrote, the packet he sent — and would not
have annotated a review **dispatched to him**, which is the same class.

> **The rule is keyed on ARTIFACT ROLE, not on who authored the claim.**

By the fleet's count this is the **seventh** instance in one day of a rule that is correct and whose
scope silently narrows to the instance that generated it. Not wrong rules. **Rules applied at the
width of their origin story.**

*The one that mattered most, and it closes the loop*: the Phase 1 review carries an
**`APPROVE_WITH_NOTES`** verdict. Preserving it records that **a review endorsed the wrong
rationale** — the only direct evidence that a false rationale survived several *correct*
validations, which is exactly what F-119 claims.

**The artifact that would have been tidied up is the artifact that demonstrates why tidying it up
is wrong.**

*End state, checkable by someone who was not here*: live rationale surfaces corrected; dispatched
records annotated in place (Phase 1 review, Phase 1 packet, fix3 packet); self-correcting records
(execution log, later reviews) **verified** as self-correcting rather than assumed.
