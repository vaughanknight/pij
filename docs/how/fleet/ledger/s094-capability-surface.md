# Stream `s094` — capability-surface — ledger

Rows from stream `s094`. **This file has a single writer.** See [`../ledger.md`](../ledger.md) for the index and the convention.

## Difficulties

### F-300 · A mitigation guarding the wrong field is indistinguishable from a mitigation
Three separate times on one stream, the defect was **a check scoped to the wrong thing** rather
than a missing check. Each looked complete on the page; none could fail.

1. **Wrong field.** Widening a PA's `watchdog unwatch` to any target reaches
   `reconcileWatchdogExemption` on the **target's** sidecar in the verb's shared preamble
   (`core/cli.ts:2378-2383`), which on an expired exemption calls `withoutPause`
   (`watchdog.ts:88-103`) — **un-pausing a seat that is neither the PA nor its parent**. The
   plan's own mitigation was *"assert the target's other watcher rows are byte-identical"*. The
   damage lands in the pause/exempt fields; `watchers` is the one field it does **not** touch.
2. **Wrong branch.** The replacement test used one fixture carrying *both* an expired
   `exemptUntilMs` and a legacy `pausedAtMs`, believing it covered both reconciliation paths.
   `reconcileWatchdogExemption` returns inside the `deadline !== undefined` branch
   (`watchdog.ts:80`), so the legacy path is **unreachable** whenever an explicit deadline is
   set. One fixture, one path, two paths' worth of apparent coverage.
3. **Wrong mutation.** A task claimed its `--for` guard assertion would go red under mutations
   5 and 11. Mutation 5 widens `watch`; 11 permits `orchestration`. Neither touches that guard,
   so the assertion had **no** mutation proving it.

*Evidence*: all three found by an independent validation subagent over two rounds; all three
confirmed at source before acceptance. *Cost*: ~25 min of validation, against a critical
capability defect that would have shipped behind three green checks.
*Shape*: this is a fourth kind alongside the fleet's other three — **already-true**,
**satisfied-by-a-neighbour**, **unreliable-in-both-directions**, and now
**guarding-the-wrong-thing**. The first three ask *"can this test fail?"*; this one asks the
harder question, **"can this test fail for the reason I think it can?"** — and a test can be
non-vacuous and still answer no.

### F-301 · A capability gate that reasons about verbs cannot see side effects in shared code paths
`PA_VERB_CLASSIFICATION` answers exactly one question — *may this role run this verb* — and has
**zero visibility** into what a verb's handler does in its preamble before reaching its own
logic. F-300's critical defect arrived entirely through that blind spot: the classification was
correct, the target rule was correct, and the harm still got through.
*Implication*: **every widening needs the code path audited, not just the verb classified**, and
nothing in the gate's structure prompts anyone to do that. *Status*: open — the fix is a
standing checklist item on the table itself, or a test that asserts what a permitted verb is
allowed to write. Ruled a property of the mechanism (o-prime, 2026-08-08) and recorded on pij#102.

### F-302 · `harness plan new` scaffolds a plan whose schema resolves nowhere
`harness plan new <slug>` (CLI 0.13.0) writes `plan.dd.json` plus per-phase task files, then
reports `status: degraded` — `schema "builder/plan" was not found in any discovery root`.
`harness dd schema list` returns **zero** schemas across all three roots, and no `dd schema
install/add` verb exists. The files are written but cannot be rendered or validated.
*Cost*: ~5 min plus a cleanup; fell back to this repo's existing convention
(`<slug>-plan.md`, as used by plans 083/084). *Impact on a fleet*: every PM told to run
`/builder 1b plan` hits it independently. *Status*: open.

### F-303 · The partition covered files the work touches, not files two streams share for unrelated reasons
`.pi/extensions/pij/cli.inbox.integration.test.ts` holds this stream's `whoami --json` `toEqual`
pin (`:207`) **and** stream s093's send-delivery test (`:219-250`). Neither stream's *subject*
overlaps; they share a file because integration tests for one binary live together.
*Evidence*: found while tracing which tests the payload change would break. *Cost*: one
sequencing pair added to the merge order, caught before it existed rather than at merge.
*Shape*: **the fourth category of partition miss** — the wave also found files the process
*creates* (plan folders, ordinals) and files the work *invalidates* (proofs asserting old
behaviour). A file-ownership partition derived from "what does this change touch" sees none of
the three.

### F-304 · A probe's default scope gets reported as a property of the world — again, and not about `rg` this time
Checked for the `flow-pair` engine in `~/.agents/skills/`, found nothing, and was one sentence
from reporting `/pij pair` unavailable. It is installed at `~/.copilot/skills/flow-pair` —
there are **four** skill roots on this machine and the probe read one.
*Evidence*: `ls ~/.agents/skills` vs `ls ~/.copilot/skills`. *Cost*: near-miss, no time lost.
*Relation*: identical in shape to pij#144 (`rg` skipping `.pi/`), which AGENTS.md already warns
about — **and the warning did not generalise off ripgrep.** The doctrine is written about a tool;
the defect is about **absence never carrying evidence of what was searched**.

### F-305 · A no-op mutation is self-catching for a RED row and silent for a GREEN neighbour
The mutation gate's drift failure is **asymmetric**, and the asymmetry is what makes it dangerous
rather than merely annoying.

- On a **"must turn RED"** row, a mutation whose target string no longer matches leaves the test
  **green** — which *fails* the stated expectation. **Loud, self-catching.**
- On a **"must stay GREEN" neighbour** row, the same no-op produces **exactly the predicted
  result** and is recorded as **proof of independence that was never tested**. Green is the
  expected outcome whether or not the code changed, so the *only* thing separating evidence from
  nothing is proof that the mutation applied at all.

**This makes the danger look smaller than it is**, because the half that self-catches is the half
people picture when they think "mutation testing". *Measured on this stream*: 9 of 18 rows are
neighbour claims. *Measured on s097 by `pij-annual-lemur` after this was relayed*: **6 of 10**,
including the single assertion standing between its `#156` fix and the outcome its external
reviewer had explicitly named as the failure mode — a must-stay-green claim that, verified with a
drifted target, proves nothing.

*Resolution*: `~/.pij/shared/mutate.mjs` (W-602) exits **2** on TARGET NOT FOUND, so a drifted
mutation throws instead of passing green. *Credit*: tool by `pij-dizzy-giraffe`, generalised and
verified by `pij-annual-lemur`; asymmetry identified here and logged reciprocally in W-602.

### F-306 · Exit 2 replaced a checklist item with a structural one — the general form
This stream's first response to mutation drift was to instruct the coder to prove each target
matched with `git diff --stat`. That is **exactly the manual verification step that gets skipped
under time pressure**, guarding exactly the hole it was added for. The tool's exit-2 makes it
unskippable.

> **A tool that refuses is not a reminder to check.**

*Shape*: this is the harness doctrine's *encode, don't document* applied to a proof step rather
than a workflow, and it is the same move as `S-301` (ship the pre-fix RED gate as a verb, not as a
paragraph in six briefs). A fleet generates checklist items faster than anyone can honour them;
only the ones that became refusals survive contact.

*Companion finding, from W-602's author*: the tool would have shipped broken — it resolved vitest
relative to its own directory rather than the caller's cwd — and was caught only by a ~90-second
verification the author nearly skipped, because the code had already worked in its original seat.
**A tool that has "already worked" somewhere else is an untested claim about here.** That is the
write-side twin of `F-304`: there, a probe's default *scope* was reported as a property of the
world; here, a tool's prior *context* is. Both are an absence of evidence read as evidence.


### F-307 · A pre-fix RED proves only the FIRST assertion that fired
`expect()` throws, so every assertion after the first failure **never runs**. A five-assertion
criterion that goes red pre-fix has proven **one** of five — and the whole fleet spent a day
recording those reds as if they validated the criterion.

*Measured here*: the four tests proving a PA's third-party `unwatch` leaves a stranger's sidecar
untouched **all went red pre-fix — on `exitCode === 0`**. Pre-fix the command was refused at the
gate, so execution never reached the preamble those tests exist to exercise. **The red was real
and still proved the wrong thing**: it covered the *permission* half and said nothing about the
fixture. A seat holding that output is entitled to believe the criterion validated; that is
simply what it looks like.

**The division of labour this exposes, which neither gate's doctrine stated:**

> **Mutation reaches past the first assertion. A pre-fix RED cannot.**

They are not stronger and weaker versions of one check — they observe different things, and for a
*"stop executing path X"* fix they are **disjoint precisely where redundancy is most wanted**
(F-308). Fixture liveness here was established by the reachable mutant (13), never by the red.

**The remedy is structural, not attentional** — `pij-complex-bat` (s100), whose framing is better
than the finding: **splitting a criterion makes the gap VISIBLE.** A multi-assertion criterion
hides the gap inside a green tick and *the reader cannot tell from the output* that four of five
assertions were never reached. Same file, same run, same green — the difference is entirely
whether the evidence is **inspectable**. Prefer one claim per criterion so each carries its own
failure.

*Corroboration from s100 within minutes*: its AC-01/AC-03 would have gone red pre-fix on
`heartbeat.write is not a function` — a **NEW-API** absence, proving nothing about the write-count
those criteria exist to establish. It split out a behavioural twin that fires on the **old** code
path and needs no new API to fail. *Corroboration from s092 (#177, merged)*: its evidence survives
audit **only because the load-bearing proof was a mutant rather than a red** — and the useful half
of that mutant's output was not the 11 tests that went red but the **14 pre-existing tests that
stayed green**, which is what proved *those* vacuous. The same signal, read in the other
direction.

### F-308 · For a "stop executing path X" fix, both post-fix proofs are unavailable
A fix whose nature is *stop running this code* removes the thing a mutation would target. So:

- a **cross-file mutation** of the removed path says nothing — the mutant is unreachable **because
  the fix worked**, and green is the *success* signal, not a vacuity signal;
- the **pre-fix RED** may have fired on an earlier assertion (F-307), covering something else
  entirely.

**Both candidate proofs can be absent at once, for exactly the class of fix where a second proof
is most wanted.** The third proof — the one neither the tool's doctrine nor the fail-first
doctrine lists — is to **mutate the fix's own ordering** rather than the path it removed: here,
moving the self-resign branch back *after* the preamble (mutation 13) turned all four cases red,
which an inert fixture could not have done.

*Danger*: `mutate.mjs`'s `exit 1` language instructs you to weaken exactly the tests that prove
this class of fix works — converting the proof that the fix works into the thing you delete.
Corrected by the tool's author (W-602) after this stream and s097 hit it within an hour of each
other.

### F-309 · `mutate.mjs` reports a PASS for the wrong red on subprocess-driving specs
The mutation is a vite `transform` (`mutate.mjs:79`), so it reaches only modules loaded **inside**
the vitest process. A spec that drives the real binary through `execFileSync`
(`cli.integration.test.ts:12,85`) spawns a child that reads the **unmutated** file from disk.

*Measured*: the bin-seam mutation returned **exit 0 — GATE PASSES** while the targeted test showed
a **green tick** in the same log. An unrelated `SIGTERM` flake elsewhere in the file supplied the
red the tool counted. **A gate that reports success for the wrong red, silently** — the exact
failure mode the tool exists to remove, inside the tool.

*Two fixes, and the second matters independently of subprocesses*: (1) detect subprocess-driving
specs and refuse with a distinct exit code; (2) **assert the NAMED test is among the failures**
rather than counting any failure — counting *any* red is unsound even in-process, and this also
hardens the gate against flakes. *Workaround*: mutate such specs **on disk**, evidencing a
non-empty `git diff`, an assertion (not build) failure, and a byte-identical restore.

### F-310 · Which bootstrap a seat happens to discover determines its lockfile exposure — and nothing records the choice
**CORRECTED AFTER FILING.** This row originally read *"`npm ci` fails in this repo"*. That is true only of the **bare** form, which dies on a global npm config conflict (`--min-release-age cannot be provided when using --before`). **`npm ci --min-release-age=null` succeeds** (measured by s096). The original row would have taught the next reader that a working command does not work.

The real hazard is narrower and nastier: **`npm install` normalises `package-lock.json`**, producing a phantom `3 insertions / 2 deletions` diff (`engines: +"npm": ">=11"`, `bin: "./dist/cli.js"` → `"dist/cli.js"`) identical for anyone who runs it. `npm ci` installs **strictly from** the lockfile and never writes it. So the command everyone reaches for is *both* the one that errors bare *and* the one that dirties the tree; the command that works cannot dirty it.

**Four seats in one wave, four different exposures, none of it written down**: this stream and s097 immune by **symlinking** `node_modules` to the canonical checkout (a convention `.gitignore:77` anticipates but no document states); s096 immune by **knowing a flag**; s100 exposed by **doing the obvious thing**.

> **Exposure is determined by which bootstrap a seat happened to discover, and neither choice is recorded anywhere.**

That is folklore, and deleting folklore is what a harness is for. *Remedy*: one bootstrap step in the fleet recipe — **symlink as the default** (immune by construction, faster, no duplicated disk; the "proper" fix is the one that creates the hazard), `npm ci --min-release-age=null` as the real-install path. **One line of remedy collapses three separately-filed difficulties** — this row, s097's F-601 and s098's F-700.

*Filed wrong, and worth keeping as an instance of this ledger's own subject*: I reported a **command's failure** as a **property of the repo**, from one invocation, in the same session where I logged F-304 about a probe's scope being reported as a property of the world. Same error, third currency.


Six findings over two rounds on a plan its author believed was ready — one **critical** (F-300),
two high, three medium. Every one was confirmed at source before acceptance, and every one was
a thing the author had looked directly at and not seen.
*Measured*: ~14 min of subagent time across three turns, against a capability-gate defect that
would have shipped green. *The generalisable part*: the validator was told to **verify the plan's
own load-bearing claims at source**, not to review the plan — the findings came from re-running
the author's evidence, not from reading the author's prose.

## Wins

### W-301 · Re-validating the revision caught a fix that only appeared to close its finding
The first revision of F-300 was accepted by its author and **reopened** by the second validation
pass: the new test covered only the *absent*-subscription case, so an implementation could still
route present subscriptions through the reconciling path. A one-round validation would have
recorded F-300 as closed.
*Rule this suggests*: **a fix to a critical finding deserves the same independent read the
finding did.** The author of a fix is the worst judge of whether it closed the hole.

## Suggestions

### S-300 · `pij fleet fence --check` — verify the fence before the work, not at merge
Every PM is handed a file-ownership fence in prose and is trusted to stay inside it. A verb that
diffs `git status` against a declared allowed-path set would turn a boundary violation from a
merge-time surprise into a local, immediate one — and would have named F-303's shared test file
at partition time rather than at trace time.
*Shape*: `pij fleet fence --check --stream s094` → exits non-zero listing paths touched outside
the declared set. The declaration already exists in every brief; nothing reads it.

### S-301 · Ship the pre-fix RED gate as a verb, not as a paragraph in six briefs
The fleet-wide correction *"run each acceptance criterion against pre-fix code and watch it
fail"* arrived mid-stream as prose to six PMs, after one stream measured two of its own criteria
passing pre-fix. Prose that must reach six seats and survive their context windows is exactly
what the harness doctrine says to **encode** instead.
*Shape*: a verb that takes the criterion→test mapping a plan already contains, runs the named
tests at `HEAD` before implementation, and refuses any criterion labelled BEHAVIOURAL that
passes. The plan already carries the labels; nothing consumes them.

### S-302 · Record a stream's questions and their rulings where the next PM will find them
Two rulings on this stream (remove-vs-keep the payload fields; the shared-test-file fence)
changed the deliverable and exist only in the prime's relay and this plan's clarifications
table. A `pij fleet rulings --stream <s>` view, or an append to the stream record at ruling
time, would keep them with the work rather than in a conversation.

---
