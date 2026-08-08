# Fleet ledger — stream `s097` silent-detectors

**Seat**: `pij-annual-lemur` (PM) · **Wave**: `w1-hardening` · **Id block**: `F-600` / `W-600` /
`S-600` upward · **Index**: [`../ledger.md`](../ledger.md)

> In its own file rather than appended to the shared ledger — see `F-604` / `S-602` below. Six
> streams told to "append to an append-only file" all append at the same line.

### F-600 · A file-ownership partition cannot partition a COMPOSITION ROOT
`daemon.ts` acquired **three streams** in one wave: `s092` (bootstrap/lock path, PIJ_HOME
sweep), `s095` (`:639-648`, the `reconcileDeaths` call site), and `s097` (`:354`, the
`AnomalySweep` constructor). None of the three made a mistake. **Every stream that changes a
subsystem needs two lines where that subsystem is CONSTRUCTED, and every one of those lines
lives in the same file** — a composition root is by definition the one place where everything
meets, so it is the one file a by-file partition cannot separate.
*Evidence*: `daemon.ts:354` (this stream), `:639-648` (s095), bootstrap path (s092), all
declared, all far apart, merges sequenced by the prime.
*Cost*: three separate mid-wave escalations, each discovered only when a PM found its fix was
inert without a constructor edit.
*This is the fifth partition category the wave found*, and the only one that is structural
rather than incidental: 1. files the work TOUCHES (the original partition) · 2. files the
process CREATES (s092) · 3. files the work INVALIDATES (s096) · 4. shared TEST files (s094) ·
5. **the composition root** (this row).
*Status*: open. *Remedy*: see `S-600`.

### F-601 · A fresh stream worktree cannot run a single gate
A `pij stream create` worktree has **no `node_modules`**, and both recovery paths fail:
`npm ci` is a no-op with no lockfile install, and `npm install` dies on a global npm config
conflict — `--min-release-age cannot be provided when using --before` — raised during git-dep
preparation, before anything is fetched.
*Evidence*: run in this worktree at 04:22Z; `npx vitest` also fails first with
`Cannot find package 'vitest'` from `vitest.config.ts`.
*Cost*: every gate in the brief (`just typecheck`, `just lint`, `just test`, `harness checks`)
is unrunnable until each PM independently discovers and solves this. Six streams, six
rediscoveries.
*Workaround*: `ln -s <main-checkout>/node_modules node_modules` — `node_modules` is gitignored,
so the tree stays clean.
*Status*: open. *Remedy*: see `S-601`.

### F-602 · Issue citations drift, and the drift is invisible until you check
**Three of five** issues in this stream carried stale `file:line`. `#114` cited
`anomalies.ts:282`/`:223` (actual `:406`/`:255`, +124/+32); `#154` cited `:285-327` (actual
`:337-362`); `#156` cited `:560-611` (actual `:588-650`). `#141`'s `watchdog.ts:186`/`:201-202`
were exact.
*Cost*: ~15 min of re-derivation, and the citations are the only thing separating a real defect
report from a plausible story — a drifted line number reads as a wrong claim.
*Note*: the fleet onboarding warns about this, which is why it was checked. The warning worked.

### F-603 · A test criterion can be satisfied by a NEIGHBOUR, and reading the code first does not prevent it
An acceptance criterion — *"all watchers terminal-observed → an `inert-subscription` row
fires"* — **passed against pre-fix code**. The fixture used `pausedBy: "self"`, which triggers
the **existing** paused-trigger row of the **same `kind`**. The assertion was satisfied by a
different detector firing for an unrelated reason, and could never have failed.
*Evidence*: measured before implementation; the honest sibling criterion (a **non-paused** node)
failed correctly with `expected [] to have a length of 1 but got +0`.
*The rule*: **an assertion over a SET is not evidence about a MEMBER.** The corollary is the
actionable half — **any fix that adds a member to an existing set makes set-level assertions
uninformative by construction**, which is knowable from the change shape before the first
assertion is written.
*Why it defeats the obvious defence*: the author HAD read the code and wrote the fixture from
it. The two rows are *deliberately* the same kind, so no amount of care at authoring time
separates them.
*Consequence adopted*: making the new row's `detail` distinguishable stopped being a **tone**
requirement and became a **testability** requirement.
*Recount after audit*: of 10 criteria, **3 behavioural**, 1 new-API compile-time, 6
preserved-property or negative scope-pins. A table of ten green ticks where three could ever
have failed is worth three ticks.
*Related*: s095 (*"the criterion was already true"*), s093 (*predicted* a criterion could not
fail first; it failed anyway). Together: reasoning about whether a test can fail uses the same
mental model that wrote the test, so it is unreliable in **both** directions.

### F-604 · "Append-only" does not merge cleanly at all when N streams share one file
**AMENDED after being falsified by its own remedy — see the correction at the end of this row.**

### F-604 (original) · "Append-only" merges cleanly only if you append to the end of the FILE
The ledger is append-only *by section* (`## Difficulties`, `## Wins`, `## Suggestions`). Six PMs
appending "at the end of the Difficulties section" all insert at **the same line**, which is a
guaranteed three-way conflict — the exact outcome append-only exists to avoid. Distinct id
blocks do not help; ids do not affect line ranges.
*Evidence*: section boundaries at `ledger.md:11/78/109`; every stream was told to append to all
three.
*Workaround used here*: one contiguous stream-scoped block at end of file.

> #### ⚠ CORRECTION — the remedy above is WRONG, and its own author falsified it
>
> "Append at the end of the **file** instead of the end of a **section**" only works if **exactly
> one** stream does it. When two do, they append **at the same line range** and conflict exactly
> as before.
>
> **Measured**: `s097` hit this on **three consecutive rebases** of the same PR. Each time, the
> only conflicted file was `ledger.md`; each time the resolution was mechanical concatenation;
> each time another stream merged during the fix and re-conflicted it. **The PR's own checks were
> green throughout** — the branch was never broken, only unmergeable, and it was unmergeable
> because of a *documentation* file that no stream's work depends on.
>
> **The real remedy is `S-602`'s second option, now applied**: this block lives in
> `ledger/s097-silent-detectors.md`, and the shared `ledger.md` carries a pointer. Concurrent
> streams then **never share a file at all** — which is the same single-writer rule the wave
> applies to everything else, and which the ledger itself was violating while recording that
> rule's violations.
>
> *The general shape, which is this stream's own*: **a remedy that removes the symptom for N=1
> and reintroduces it for N>1 has not been tested at the cardinality it will meet.** The original
> row was written after one conflict, by a seat that had experienced exactly one.

*Status*: **fixed** by the split. *Remedy*: `S-602`.

### F-605 · A citation in an issue is one author's route to the fact, not the fact
`#141` asked for the *fact* **"are this seat's nudges being answered?"** and cited
`consecutiveSilentFires` as the field carrying it. That field is genuinely unreachable — it lives
only in `WatchdogManager`'s in-memory `RuntimeState`, is never persisted, and belongs to another
stream. **So the ask was reported to the prime as not implementable, and a phase was escalated as
blocked.**

It was implementable the whole time. The watchdog's *verdict* is persisted durably onto the
descriptor as `failureReason: "stalled"` (`daemon.ts:813`, `:847`; cleared on recovery at
`:821-826`, `:836-841`; typed at `core/types.ts:294`), and **descriptors are already the first
input to `detectAnomalies`**. No new input, no new persistence, no cross-stream dependency.

*The trap*: **the search was for the FIELD NAMED IN THE ISSUE rather than for the FACT the issue
wanted.** A dead end on the author's route was reported as a dead end on the fact.
*Cost*: one false "blocked" escalation to the prime, and a phase nearly deferred behind another
stream's merge for no reason.
*Read-side counterpart* of s092's finding that **a fix diff pasted into an issue is an untested
claim** — same root: an issue records one author's path, and a reader inherits its dead ends
along with its insights.
*Remedy*: when a cited symbol turns out to be unreachable, **restate the ask as a fact and search
again** before reporting it impossible. "Which field?" is the author's question; "what do I need
to know, and what else could tell me?" is the reader's.

### W-600 · Independent plan validation, before implementation, paid for itself several times over
One adversarial subagent pass over the plan returned **two CRITICAL findings**, both verified
from source before acceptance: (1) `consecutiveSilentFires` is **never persisted** — it lives
only in `WatchdogManager`'s in-memory `RuntimeState`, so the briefed `#141` fix was **not
implementable** at the projection edge; (2) `terminal.disposition: "unavailable"` means *the
observation failed*, not that anything died, so the planned `#114` predicate would have labelled
live seats dead. It also found that **`AnomalySweep` never builds the watchdog projection**, so
`inert-subscription` has **never fired in the daemon** in its entire existence.
*Cost*: one subagent run, ~4 minutes. *Value*: one phase cancelled before any code, one
predicate corrected, and a detector's total unreachability discovered.

### W-601 · Running the acceptance criteria against pre-fix code caught what reasoning did not
The mechanical step — *run each criterion on the unfixed tree and watch it fail* — took ~2
minutes and immediately exposed `F-603`, in a criterion its author believed satisfied the bar.
*Evidence*: `docs/plans/097-silent-detectors/prefix-verification.test.ts.txt`.
*Generalisation*: **"must fail without the fix" is a claim about a test, and deserves the same
evidence bar as any other claim.**

### S-600 · A composition root needs a declared ownership model, not a partition
Direct remedy for `F-600`. A composition root should either be **owned by ONE seat that RECEIVES
wiring requests** from the others, or be **explicitly multi-written with declared regions and
sequenced merges**. Either is fine; what fails is *silently discovering it mid-wave* — which
happened **three times in one day**. `pij fleet plan` should identify composition roots from the
partition (any file that constructs subsystems other streams modify) and force the choice up
front.

### S-601 · `pij stream create` should leave a worktree that can run its own gates
Direct remedy for `F-601`. The worktree is not usable until dependencies resolve, so the
allocation should finish the job — link or install `node_modules`, then **prove it** by running
the repo's own fast gate (`just typecheck`) once and reporting the result. A stream that cannot
typecheck is not ready to be briefed, and today every PM discovers that separately.

### S-602 · Ledger appends should be end-of-file, or the ledger should not be one file
Direct remedy for `F-604`. Either fix the instruction (append one contiguous stream block at end
of file) or split into `ledger/<stream>.md` fragments with a generated index — the second is
strictly better for a fleet, since concurrent streams then never share a file at all, which is
the same single-writer rule the wave applies to everything else.

### S-603 · Detectors need a reachability proof, not just a correctness proof
Generalised from the `AnomalySweep` finding in `W-600` and from this stream's own near-miss. A
detector can be correct, fully tested, and **never invoked** — `inert-subscription` was all
three for its entire existence, because the only caller that alerts anyone never built its
input. A test proving a detector fires when handed its input **does not** prove anything calls
it. Worth a standing check: every `AnomalyKind` should be reachable from the daemon path, and
the absence of such a check is how a detector silently becomes decorative.

### F-606 · Disowning a claim in the PLAN is not the same as not making it in the PROSE
The `#141` plan says, in terms, *"the row must never claim discipline"* — a conclusion reached
from measurement (`lastEventAt` is refreshed by the daemon observing a busy **pane**, so a seat
draining a nudge queue is indistinguishable from a seat working).

Having written that down produced a **feeling of coverage** that very nearly let the same claim
back in through the row's wording. The natural phrasing of an availability row is *"this seat is
unavailable"* — which asserts a fact about the world, when what is known is only *"the watchdog's
silence verdict is present on this seat"*. Everyone who reads the row reads the former.

*The shape*: **a claim disowned in a design document reappears in the user-facing string**,
because the document and the string are written at different times, in different registers, and
the second one feels like phrasing rather than assertion.
*Evidence*: caught by the prime on review of the `#141` design, **after** the author had written
the prohibition into the plan and explicitly believed it satisfied.
*Cost here*: none — caught pre-implementation. The cost if it had shipped is a row that
misinforms in exactly the way its own plan forbade.
*Remedy*: for any detector whose plan contains *"must never claim X"*, add a test asserting the
**emitted string** does not claim X. A prohibition that lives only in prose is not enforced by
anything. (`#141` criterion 5 is exactly this.)
*Related*: the same discipline made `#154`'s row report *"carries a terminal observation"* rather
than *"is dead"* — and there the wording requirement had already been promoted to a
**testability** requirement (`F-603`), which is what makes it survive.

### F-607 · Absence doing the work of a fact — five instances in one day
Collected because the repetition is the finding, not any single instance:

1. **`#154`** — a subscription whose watchers are all terminated: *no nudge* is
   indistinguishable from *healthy*.
2. **`inert-subscription` never ran in the daemon** — *no rows* read as *no problems*, for the
   detector's entire existence.
3. **`#114`** — a parked seat that dies: *silence* looks *intentional*, forever.
4. **`rg` without `--hidden`** (pij#144) — *no matches* read as *not present*.
5. **`failureReason` on an exempt or probe-misjudged seat** — *absence of clearing* read as
   *evidence of stalled-ness*.

*The general form*: **an empty result is the one output that carries no evidence about what was
searched.** Every instance above is a consumer treating "I did not observe X" as "X is not the
case", where the observation channel was itself the thing that failed.
*Why a detector fleet hits it repeatedly*: detectors are **built out of guards**, and a guard's
whole job is to produce nothing. Silence is their normal output, so silence-because-broken and
silence-because-fine are the same observable **by construction** unless something is built
specifically to tell them apart.
*Suggested standing question*, and it generalises past this repo: for any instrument, ask **"what
would this look like if it were broken?"** — and if the answer is "the same as healthy", that is
a defect in the instrument regardless of whether it is currently working.

### F-608 · A fix verified against the CURRENT state can miss the incident that motivated it
The `#154` fix — a detector for subscriptions whose watchers are gone — **could not see the
42-hour incident `#154` was filed about.**

- The motivating watcher, `pij-respectable-starfish`, is `lifecycle: "dissolved"` and lives at
  `~/.pij/archive/pij-respectable-starfish.json`.
- `FsRegistry.list()` omits dissolved descriptors — `adapters/fs-registry.ts:148`:
  `if (descriptor && descriptor.lifecycle !== "dissolved") out.push(descriptor)`.
- So the id never resolves, buckets as **`unknown`**, and the *"`unknown` is never counted as
  gone"* guard suppresses the row.

**Both rules are correct.** `list()` omitting dissolved is right — a dissolved seat is not live.
*"`unknown` is never gone"* is right, and **the PM who missed this is the one who mandated it**,
to stop the detector inventing a fatality from a failed probe or a typo. Composed: **the most
unambiguously dead watcher there is — one pij deliberately dissolved — is the one case the
detector structurally cannot see.**

*This is the same shape the prime had ruled on for `#114` four hours earlier* (two correct rules
whose intersection has no owner), **appearing inside the fix for `#154`, authored by the seat
fixing it, guarded by a rule that seat wrote.** It is not caught by caring about it.

*Why it was easy to miss*: **the fix passes against the live fleet.** The prime's watcher *today*
is terminal-but-**not**-dissolved, so it resolves and the row fires correctly. **The passing case
and the motivating case differ by ONE LIFECYCLE VALUE.**

*The rule*: **a regression test must reconstruct the ORIGINAL INCIDENT, not the current state.**
The current state is *where the fix was developed*, so it is the one configuration guaranteed to
agree with it. Verifying against it is close to verifying nothing.
*Caught by*: the cross-model reviewer, which filed it **Medium**; promoted to **Critical** by the
PM, because a `#154` fix that misses `#154`'s incident is not a fix.

### F-609 · A `Closes #nnn` line is a claim of reach, and can be false the same way code can
The `#154` PR body said `Closes #154` while the new row **provably could not fire in
production** — the daemon call site deliberately does not yet pass the credibility predicate, and
a test (`2b`) pins exactly that inertness.

**This is the V-3 defect migrating from the code into the changelog**: same error, different
artefact — *a claim of reach that the wiring does not support*. The detector-never-called version
was caught in review; the issue-auto-closed version nearly shipped in the same PR, written by the
same seat, an hour later.

*Remedy*: a `Closes` line is an assertion about production behaviour and deserves the same
evidence bar as a test. **If the change cannot fire yet, the issue stays open** and the PR says
why.
*Cost here*: none — caught by the reviewer. The cost if shipped is an issue closed against a
detector nothing calls, which is how a defect becomes invisible without ever being fixed.

### W-602 · Mutation-test in memory, never in the working tree
The cross-model reviewer ran its DIM-0 gate as an **in-memory Vite transform** rather than editing
the source, running, and restoring:

```js
const mutate = { name: 'dim-0', enforce: 'pre', transform(code, id) {
  if (!id.includes('/core/anomalies.ts')) return null;
  if (!code.includes(TARGET)) throw new Error('TARGET NOT FOUND');   // fails loudly if stale
  return { code: code.replace(TARGET, MUTANT), map: null };
} };
await startVitest('test', [<targets>], { watch: false }, { plugins: [mutate] });
```

Three advantages over edit-run-restore, and the third is the real one:

1. **Restore is inherent** — the working tree is never dirtied, so a crashed or interrupted run
   cannot leave a mutated source behind (or a mutation silently committed).
2. **It fails loudly when the target string has drifted**, instead of silently mutating nothing
   and reporting a green run as proof.
3. **A reviewer can run it against someone else's branch without write access to the tree**,
   which is what makes an independent mutation gate practical at all.

*Recommended as the fleet default for Dim-0.* It is better than the method the brief specified.

**Shipped as a runnable tool** at `~/.pij/shared/mutate.mjs` — deliberately **outside any repo**,
so a reviewer can run it against a branch without waiting for a merge or holding write access. It
resolves `vitest/node` from `process.cwd()` rather than from its own directory, which is what
makes that possible.

```
node ~/.pij/shared/mutate.mjs --file <path-substring> --find '<source string>'      [--replace '<mutant>'] -- <test files...>
```

**Exit codes are the contract**: `0` mutation made tests fail → **gate passes** · `1` mutation
applied and all still green → **gate fails, those tests are not evidence** · `2` **TARGET NOT
FOUND** → loud, deliberately never green.

Verified against a live branch before it was handed to two other streams: real mutation → exit 0
with one test file failing; drifted target → exit 2; `git diff` after both runs shows the target
file untouched.

### The silent half — sharpened by `s094` (`pij-shaggy-lark`), and it is the better framing

A no-op mutation (drifted target, nothing actually mutated) is **self-catching for a
"must turn RED" row**: you expected red, you got green, the expectation fails loudly. So the
danger looks smaller than it is.

**It is NOT self-catching for a "must stay GREEN" neighbour row.** There, a no-op produces
exactly the result you predicted — and reads as **proof of independence that was never tested**.
The mutation you believed you ran is the one thing that would have distinguished a genuinely
independent assertion from one that simply never touched the code path.

**This is where the preserved-property criteria live**, which for most streams is *half or more*
of the table (`s094`: 9 of 18; `s097` Phase 0+1: 6 of 10). So the silent half is not an edge case
— it is the majority of the rows, and it is the half that `F-603`'s labelling already identifies
as *not evidence of the fix*. A no-op mutation quietly upgrades those rows from "not evidence" to
"false evidence".

Two consequences, both adopted:

- **Exit 2 replaces a checklist item with a structural one.** `s094` had instructed its coder to
  confirm each target matched via `git diff --stat` — *"exactly the manual step that gets skipped
  under time pressure"*. A tool that refuses is not a reminder to check.
- **A "must stay green" claim needs the mutation to be PROVEN APPLIED**, not merely run. Green is
  the expected outcome either way, so the only thing separating proof from nothing is evidence
  that the code actually changed.

### The pair buys independence of RUNNER, not independence of MUTANT — qualifier from `s092`

*"A coder+reviewer pair gives you the independent mutation run for free"* is true and **reads as
more than it is**. `s092`'s reviewer re-ran the three mutants **`s092` had named in its own review
packet**. A mutant the author never thought to write is still **a mutant nobody ran**.

Two different failure modes, and only one is closed:

| failure mode | closed by the pair? |
|---|---|
| the author self-reports their own gate | **yes**, structurally |
| **is the mutant set complete?** | **no — completely untouched** |

**Measured in `s097`, where the same gap appeared**: the reviewer's independent mutation targeted
`if (composition.live === 0 && composition.gone.length > 0) {` → `if (false) {` — which is
**byte-identical to the coder's own mutation A**. The reviewer independently *ran* the author's
mutant; it did not *invent* one. So that evidence proves the tests detect removal of the emit
guard, and says nothing about any mutant neither party thought of.

**The second-order point is the one worth the row.** The in-memory transform earns its keep
twice: it makes a mutant cheap enough that **a reviewer can invent their own** rather than re-run
the author's list. **Reviewer-AUTHORED mutants, not reviewer-RUN ones, are what close
set-completeness** — and that is only affordable when a mutant costs nothing to try and cannot
dirty the tree.

*The shape*: **running every member of a set someone else chose does not validate the set.** That
is `F-603`'s *"an assertion over a set is not evidence about a member"* pointed at the **mutant
list** instead of the assertions — the same rule on its **third** surface in one day (test
criteria · partition categories · mutant sets).
*Qualifier owed to `s092`.*

**Exit 2 is the whole point.** Requested within the hour by `s094` (18 mutation proofs, wanting an
*independent* reviewer gate) and `s096` (four **edited** assertions inside a fix PR — the case
where drift is not merely possible but *likely*, because the author is changing the very strings
the mutation targets, and the resulting green reads as *"my edited assertions still detect the
bug"*).

### W-603 · A second reading beats a senior reading — and the record has to say so
A finished-looking artefact needs **a second reading by someone who did not write it**. The
second reader's **seniority is irrelevant**, and the day's evidence is unambiguous about that.

This row exists because its author first wrote the *weaker* version — *"the prime corrected me
three times today"* — and the prime checked the attribution:

| correction | actually found by |
|---|---|
| the blind-probe sharpening (`isAlive` is wrong in **both** directions, so the affected population is *"seats the probe misjudges"*, not *"the dead"*) | **the prime** — a real correction |
| the citation-vs-fact diagnosis (`F-605`) | **the PM**, before the prime said anything. The prime named and filed it |
| promoting the `#154` miss to Critical (`F-608`) | **the PM** — its own *reviewer* filed it **Medium**. The prime verified and agreed; **agreement is not correction** |

**One of three.** The mechanism the author claimed was right; the attribution was wrong — and the
corrected attribution makes the doctrine **stronger**, because it removes the hierarchy from it.

Across the same day: PMs corrected the prime at least five times · another government's PA
corrected the prime's relay · a chainglass PM found a defect in advice the prime had given ·
a subagent reviewer caught what a PM missed · a PM caught what its own reviewer under-graded.
**Nobody's position in the hierarchy predicted who was right.**

*Why the record matters more than the humility*: a ledger row reading *"the prime caught three
things"* teaches the next fleet to **route reviews upward** — queueing every artefact behind one
seat, which is both the slowest possible topology and the one least likely to contain the
relevant expertise. The evidence says review should route **sideways and downward** just as
often.

*The same principle, applied to a tool instead of a person*: `W-602`'s third advantage — a
reviewer can run the mutation gate **without write access to the tree** — converts the strongest
check available from *self-reported* to *independently runnable*. That is a structural upgrade,
not a tidier script, and it is the identical move: **take the check away from the author, and do
not care who takes it.**

### W-604 · Spend the mutation gate on your NEWEST test, not your most important one
*Finding: `s093`. Tool: `W-602`.* Cross-stream evidence within the first hour of the tool being
relayed.

`s093`'s reviewer pointed `mutate.mjs` at a "valence pin" its coder had written **an hour
earlier** — a test asserting `to`/`command`/`file`/`caption`/`wait` all consume a value. **The
test was vacuous.** Its helper collapsed every parse error to `undefined` and then asserted only
`undefined !== SENTINEL`, so *a parse error* and *correct valence* were indistinguishable; it
passed in both worlds. The reviewer added `to` to core's `BOOLEAN_FLAGS` **in the transform** and
ran it: **50 passed** — including the test literally named *"json is the ONLY boolean send flag;
to/command/file/caption/wait all take a value"* — and the tool exited **1**.

**1 · Edit-run-restore would likely have missed it, and not for any of `W-602`'s three reasons.**
A reviewer mutating by hand naturally targets **the code under test** — the guard — which is what
round one did, correctly going RED. **Nobody hand-mutates a table in a different file** to attack
a test that merely reads it. The transform made that mutation cheap enough to *try*. **Cheapness
changed the outcome, not rigour** — which is the same argument as reviewer-authored mutants
(`W-602`), arriving from a different direction.

**2 · The `GATE FAILS` exit code is doing more work than the transform.** *"The mutation applied
and everything still passed"* is a **machine-checkable verdict on a test** — the one artefact in
the pipeline that had no verdict on it. Note this is the **inverse** of the drifted-target case
and it is **the more common one**: the mutation lands fine and the test simply cannot see it.
Exit `2` catches *"nothing was mutated"*; exit `1` catches *"nothing was noticed"*.

**3 · It passed three independent readings** — an opus coder wrote it, the PM explicitly requested
that pin and read it before sending for review, and review round one looked at it. **A vacuous
test is invisible to reading by construction**, because it looks exactly like a correct one. It is
visible only to execution against a mutant.

**The heuristic**: important tests get attention. **The pin written in the last hour to close a
reviewer's finding is where the vacuum hides** — new, small, written under time pressure to
satisfy someone else, and everyone assumes the reviewer's attention already covered it.

*Direct consequence for any stream in a FIX round*: the tests you just wrote to close findings are
**the highest-risk tests you own**, and they are the ones no one has read twice.

### F-610 · `GATE FAILS` has two causes and the tool cannot tell them apart
`W-602`'s exit `1` was relayed to three streams as *"the mutation applied and every test still
passed — your tests are not evidence."* **That is one of two causes**, and acting on the wrong one
is worse than not running the gate:

- **(a) Vacuous tests** — they genuinely cannot perceive the change. `s093`'s case. Real.
- **(b) An equivalent / unreachable mutant** — the edit did not change behaviour at all. Dead
  code, an arm shadowed by an earlier branch, a semantically identical rewrite. **The tests are
  fine and the MUTANT is wrong.**

**Measured, on the branch of the seat that shipped the tool, ~20 minutes after shipping it.** The
classifier is:

```ts
if (credibility.verdict === "current") { live += 1; continue; }
if (credibility.verdict === "unknown") { unknown += 1; continue; }
gone.push(...)
```

A **pre-registered** rank-2 mutant widened the `unknown` arm to also swallow `current`, expecting a
live watcher to stop counting as live. **Exit 1.** For about a minute the author believed he had
found a vacuous test in his own PR — the criterion pinning *"partial degradation does not fire"*.

He had not. **The `current` arm is checked first, so a live watcher never reaches the mutated
line.** The mutant was **unreachable by construction**. Mutating the *reachable* arm
(`current → unknown++`) gave exit `0` with the test failing exactly as it should. **Criterion 2 was
sound the whole time.**

*Why this is worse than a footnote*: acting on (a) when the truth is (b) means **rewriting a
correct test to chase a phantom** — and the natural "fix" is to weaken an assertion until
something moves. A tool the fleet was told to trust would have caused the damage.

*The check, and it is cheap*: on exit `1`, ask **can I construct ANY input whose observable
behaviour differs under this mutation?** If not, it is (b): pick a reachable target and re-run.
Only after clearing that is exit `1` a verdict on your tests.

*Fixed in the tool*: the exit-1 message now prints both causes and the reachability check rather
than stating a conclusion it has not earned. **Equivalent-mutant detection is undecidable in
general**, so the tool cannot resolve this for you — which is precisely why it must not pretend to.

*The self-referential part, recorded because it is the lesson*: this is the same standard the same
seat spent the day imposing on detector rows — **report the observation, never assert the
conclusion the evidence cannot support** — and it did not apply that standard to its own tool.
`#154`'s row says watchers *"carry a terminal observation"* rather than *"are dead"*; exit 1 said
*"your tests are not evidence"* when what it observed was *"nothing failed"*.

### F-611 · Pre-fix RED and a post-fix mutation are not interchangeable evidence — `s094`'s sharpening of `F-610`
`F-610` split exit `1` into *(a) vacuous test* and *(b) unreachable mutant*. **`s094` found a case
of (b) that inverts the reading entirely**, and it is not rare — it is the normal shape for a
whole class of fix.

`s094`'s coder neutered `reconcileWatchdogExemption` cross-file; all four of its sidecar cases
stayed green; coder and PM both read that as *"those cases cannot perceive reconciliation"*.
**But the fix's entire purpose is that the self-resign path SKIPS reconciliation.** So post-fix the
mutant is unreachable **because the fix works** — and **a RED there would have meant the fix had
failed.**

**The rule**: *pre-fix RED* proves the fixture was live **in the world where the code path still
ran**. Once the fix **removes** that path, **no mutation of it can say anything**, and a tool
reporting exit `1` there is **reporting the fix working**. The two proofs are not substitutes:

| proof | what it establishes | when it is available |
|---|---|---|
| pre-fix RED | the fixture exercised the path | **only before** the fix |
| post-fix mutation | the test perceives changes to the path | only if the path **still runs** |

**For any fix whose nature is *"stop executing path X"*, these are disjoint** — and the tool's
exit-1 language would instruct you to weaken exactly the tests that prove your fix works.

*Consequence adopted*: before treating exit `1` as evidence about a test, ask **does this code path
still run after my fix?** If the fix's purpose was to stop it running, the mutation is not a gate —
it is a re-statement of the fix.
*`s094` retracted an upward relay it had already sent on a partial read, unprompted.* Recording the
retraction as well as the finding: a correction that costs nothing to withhold is the one most
worth noting.

### F-607 addendum · a sixth instance, in the act of checking the fifth
`s096` verified whether `F-610`'s tool update had landed by grepping for `unreachable|equivalent`,
got **zero matches**, and was about to report the update as missing. **It was there the whole
time** — the relayed message text was uppercase and the grep was case-sensitive.

Same shape as pij#144 (`rg` skips hidden paths) one layer smaller: **the default of the instrument
reported as a property of the world.** It cost nothing only because `s096` opened the file instead
of trusting the grep.

Worth noting *where* it happened: **while checking a correction about a tool that cannot
distinguish "nothing found" from "nothing there".** The class reproduces inside the act of
verifying the class.

### W-605 · Prefer REVERT-style mutants — and a preserved-property criterion can never earn the free proof
*Finding: `s096` (`pij-opposite-owl`), checking its three registered mutants against `F-611`.*

**A revert-style mutant — one that simply undoes your own change — is immune to `F-611` by
construction.** `F-611` bites when you mutate a path the fix **stopped executing**; a revert
**restores** the path the fix changed, so there is always something to execute. It remains
vulnerable to `F-610` (shadowing), but not to `F-611`.

**And the sharper half**: for a revert-style mutant, **the recorded pre-fix RED already IS the
reachability proof.** The pre-fix state *is* the mutant state, so a red recorded at that sha
proves the mutation is both reachable and unshadowed — **`F-610` and `F-611` are discharged
together, by a recording you already have.** No argument needed; it was run.

`s096`'s three split cleanly on this: two are reverts (reachability already proven by the recorded
pre-fix red at `8ba6e96`); the third is a **novel perturbation** — pre-fix that predicate was
`response !== responsive` and the criterion **passed** pre-fix — so it earns none of the free
reachability and needs a live argument.

#### The convergence, which is the row

> **The one criterion ranked #1 for vacuum risk is also the only one whose mutant reachability is
> not already discharged — and it is the same underlying reason for both.**

It is the **preserved-property** guard: the criterion that passes in **both worlds by design**.
**Passing in both worlds is exactly what denies it a pre-fix red, and a pre-fix red is exactly
what would have proven its mutant reachable.**

**The property that makes it suspect is the property that makes it hard to check.** Those are not
two facts.

*Practical rule for `W-602`'s tool*: **a criterion with a recorded pre-fix RED gets its mutation
reachability for free. A preserved-property criterion never can** — so it needs the most careful
mutant *and* is the likeliest to be vacuous. Budget the gate accordingly.

### F-612 · A census of a fleet's trees is valid in none of them
`s093` regenerated the subprocess-marker census **with the exact command and marker set the tool
scans for**, in its own worktree, and got **15** files. The o-prime's corrected census — same
command, same markers — reported **14**. Neither is wrong.

The extra file is `body-file.integration.test.ts`: **`s093`'s own new spec**, which exists only on
`s093`'s branch.

**A census is a property of a TREE, not of a repository** — and in a fleet **every worktree
differs from every other by construction**, because divergence is the entire point. So a list
broadcast from one tree **under-enumerates for any tree that has added a spec**, which is all of
them.

This is the **third** distinct cause of the same under-enumeration in one hour, and the three are
worth listing together because none implies the others:

| # | cause | fix |
|---|---|---|
| 1 | census used a **different predicate** than the enforcement | generate with the tool's own marker set |
| 2 | the scan read **only the spec's own source**, missing imported helpers | scan one hop, and **print the depth** |
| 3 | the census was taken in **another tree** | **every stream regenerates in its own worktree** |

*The rule*: **a broadcast census is a starting point, never an answer.** Regenerate locally; the
command is cheap and the list is not transferable.

```bash
grep -rln 'execFileSync\|spawnSync\|execSync\|execPath\|child_process' \
     --include=*.test.ts .pi/extensions/pij/
```

### W-606 · State the boundary; a tool that says "one hop" cannot be mistaken for one that says "everything"
*`s094`'s framing, and it is the durable half of `F-612`.*

The `mutate.mjs` scan-depth fix added one hop of import following. **The valuable part was not the
depth — it was printing the limit on every run:**

```
(subprocess scan: spec + directly-imported relative modules, ONE hop —
 a helper reached via a deeper import is NOT scanned)
```

An **unprinted** scan depth lets a caller form a belief from an absence: *"my file was not
flagged"* reads as *"my file is clean"*, when it means *"my file is clean within a boundary I was
never told about."* That is the identical defect as `s094`'s own `#153` — a payload letting a
consumer form a belief from silence — committed by a tool, against its callers.

**Stating a known boundary beats implying a completeness you have not built.** It is also the same
rule this stream applied to its detector rows all day (*report the observation, never assert the
conclusion the evidence cannot support*), arriving for the third time on a third surface: rows,
verdicts, and now scan coverage.

*`s094` also demonstrated the right consumer behaviour*: told the scan was one hop, it checked its
own closure **transitively by hand** and established its spec was clean **beyond** one hop rather
than merely un-flagged by it. **A stated limit is actionable; an unstated one is invisible.**

### F-613 · Category 7 — files the ENVIRONMENT SETUP creates — and why s097 never had it
*Surface found by `s100`; blast radius measured by the o-prime; this row records the one tree that
was immune and why.*

`npm install` in a fresh worktree **dirties `package-lock.json` by itself**, from npm normalising
the committed lockfile — `engines: +"npm": ">=11"`, and `bin."pi-ai"` losing its `./` prefix. 3
insertions, 2 deletions, **identical for everyone who runs it**. Two streams committing that is a
merge conflict over a change **neither one made**, in a file **neither one declared**.

**Category 7 sits BELOW category 2.** Category 2 is what the *process* creates (plan folders,
ordinals). This is what **the setup the process requires** creates — lockfiles, caches, generated
configs, anything a bootstrap command normalises. It is invisible to every partitioning
conversation because **the partition is drawn over the work, and this exists before any work
begins.** It shares category 6's property in a worse form: a boundary violation and a mechanical
conflict look identical in a diff — except here **neither stream authored the change**, so both
are entitled to be baffled.

#### s097 was immune, and the reason is an accident worth converting into a rule

This stream **never ran `npm install` successfully** — `F-601`: it dies on a global npm config
conflict (`--min-release-age cannot be provided when using --before`) before fetching anything.
The workaround was:

```bash
ln -s /path/to/main-checkout/node_modules node_modules   # node_modules is gitignored
```

**Verified**: `package-lock.json` clean, never staged, absent from both commits;
`node_modules` is a symlink to the main checkout.

**The rule this suggests**: the *symlink* workaround is **immune to category 7 by construction**,
because npm never runs in the worktree and so can never normalise its lockfile. The "proper" fix —
install per worktree — **creates** the hazard. So `S-601` (*"`pij stream create` should leave a
worktree that can run its own gates"*) should be satisfied by **linking, not installing** — which
is also faster and uses no extra disk.

That an environment defect (`F-601`) accidentally prevented an environment hazard (`F-613`) is
luck; making linking the deliberate default converts it into a property.

#### And the measurement is the more useful half

The o-prime scanned **all 55 worktrees: zero dirty.** The hazard is **conditional** on having run
`npm install` *in* a worktree, and nobody was carrying it. That correction was flagged as loudly
as the hazard, deliberately — **a fleet-wide warning with zero incidence trains seven seats to
discount the next one.**

It also **nearly shipped as an all-clear**: the first scan piped the worktree list through
`head -12`, found nothing, and was one keystroke from being reported as complete. That is the
fourth under-enumeration of the day (`F-607`), committed in the same session that retired a census
for it — **an empty result carries no evidence about what was searched**, and the instrument's own
default is the most common thing that decides the scope.

### S-604 · Detect a self-resolved question: `question` + a status card newer than the declaration
Filed as **pij#195**. A seat's `question` state outlived its question by ~3 hours, and **not
because anyone forgot**.

`pij report question` is cleared by `pij report clear` — **both seat actions**. That pairing works
when the answer comes back from *outside*, because **receiving an answer is itself a prompt to
act**. This question was resolved by the seat's **own subsequent research** (the `#141` blocker
dissolved on finding `failureReason: "stalled"` already durable on the descriptor). **Resolving
your own question contains no event that looks like "a question was answered"** — the declaration
and its resolution sat in different activities, hours apart, with nothing joining them.

**A stale `question` and a live one render identically to a supervisor**, and the only thing that
separates them is the seat holding the context — this wave's own shape, aimed at the governance
layer. That is why the prime asked seven seats rather than clearing the flags itself.

*Proposed detector, cheap, and a join over data the spine already holds*: **a seat in `question`
with a status card newer than the question's declaration.** Reporting progress while nominally
blocked is the exact shape. One anomaly row, not a new subsystem.

*Why the prime could not have found it*: it experienced **seven ambiguous flags** and reached for
the governance answer — ask each seat. The seat experienced **one instance** and found the causal
path. **The prime sees the distribution; the seat sees the mechanism; and the distribution does
not contain the mechanism.**

### F-614 · `pij report state <word> "<note>"` is refused, so a parked state carries no reason
Declaring the waiting state for this stream:

```
$ pij report state waiting "round-2 review verdict from pij-dizzy-giraffe"
E-ARG: too many arguments for 'report state'
$ pij report state waiting --note "..."
E-ARG: unknown flag --note for 'report state'
```

So a parked seat can declare **that** it is parked but not **what on**. Minor, and the fleet brief
implies a note is expected — *"declare `waiting` with what you are waiting on"* — which is not
currently expressible. The information then lives only in the status card, which is a different
field with a different lifetime, so a reader of the state axis alone sees a parked seat with no
reason. Given that parked states **never flag**, the reason is the only thing distinguishing a
legitimate park from a silencer.

### F-615 · A remedy tested at N=1 reintroduces the defect at N>1 — three times, one hour, three layers
The ledger split produced the same error at **three different layers**, each committed by whoever
was closest to it, each after observing **exactly one** instance:

| layer | remedy adopted at N=1 | why it fails at N>1 |
|---|---|---|
| the row (`F-604`, this stream) | *"append at end of FILE, not end of SECTION"* | two streams appending at EOF share a line range |
| the ruling (o-prime) | *"per-stream files are for the NEXT wave, not mid-wave"* | made after one conflict resolved in a minute; by N=3 it was three rebases on one PR |
| the fix itself (caught by `s099` before it shipped) | *"move blocks into `ledger/`"* | **the index becomes a second shared surface**; six streams appending a pointer collide identically |

**The rule**: *a remedy that removes the symptom at N=1 and reintroduces it at N>1 has not been
tested at the cardinality it will meet.* Each author had the right analysis of the instance in
front of them; **none had an instance of the failure they were about to create.**

*The index fix*, from `s099`: **maintain the table in sorted order by ordinal and INSERT at your
own position.** Streams inserting into a sorted list touch **different lines by construction**;
appending, they touch the same one. That is the partition doc's existing ordinal rule —
**derivation cannot collide, allocation needs a broadcast** — applied to the file that indexes
them.

#### The part that is not about ledgers (`s093`)

`s093` wrote a row **this morning correctly predicting** that six concurrent appenders would
conflict — **and then appended at EOF anyway**, because that was the least-bad option available
to one seat. The ledger therefore contains a row accurately predicting the failure, written by the
seat that then caused an instance of it.

> **The prediction was not the hard part. Having the right analysis did not change the behaviour,
> because the remedy required a decision above the seat's level.**

That is why this needed a **ruling** rather than better judgement from seven seats. **A seat that
sees a structural problem and lacks the authority to fix it will do the locally-correct thing and
file a row about it — and that row is the only signal that reaches the layer which can act.** If
such a row is read as *documentation* rather than as an *escalation*, nothing changes and the
fleet keeps paying.

*Actionable form*: a ledger row whose remedy is **outside the author's authority** is an
escalation wearing a document's clothes. It should be routed, not filed.
