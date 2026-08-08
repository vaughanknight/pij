# Fleet ledger — difficulties, wins, suggestions

**Living document. Append, do not rewrite.** This is the evidence base for turning fleet
parallelism into a first-class `pij` feature. Every row should carry its cost or its proof;
a row without evidence is an opinion and belongs in a conversation, not here.

Format: `F-nnn` difficulties · `W-nnn` wins · `S-nnn` suggestions.

---

## Difficulties

### F-001 · Spawning into a worktree kills `pi` peers, silently and pre-registration
`pij spawn --harness pi` from a linked worktree dies at boot in ~3s. Machine-global extension
links (`~/.pi/agent/extensions/*` → the MAIN checkout) collide with the worktree's own
project-local extensions; identical tool names from two paths is fatal. **A peer that dies
before registering is reported by nothing.**
*Evidence*: observation DL-003, s055. *Workaround*: spawn from main, `cd` in, absolute paths.
*Status*: open — real fixes would be pi conflict precedence, worktree-aware `link-global`, or
`pij spawn` handling it.

### F-002 · `pij link --role` silently overwrites an existing role stamp
Re-parenting a stamped seat with `--role` changes its capability gate underneath it. Omitting
the flag preserves the stamp. Nothing warns.
*Evidence*: hit during the 2026-08-05 succession while re-parenting a PA.

### F-003 · The whole fleet dies with the tmux server, and nothing notices
An overnight tmux server death took three seats (a PA and two PMs). Their descriptors kept
`lifecycle: bound` with a stale `terminal` record; the prime survived only because it was a
different pane. Recovery is manual re-adoption plus a full re-spawn.
*Evidence*: 2026-08-07T23:14Z, `pid-missing` on three seats simultaneously.
*Related*: pij#155 (`terminal` is a latch), pij#161 (a dead seat was then certified healthy).

### F-004 · Watcher subscriptions decay and nothing re-points them
A handover re-parents children but re-points **neither watcher subscriptions nor spawn
lineage**, and both are invisible to `pij list`. A prime ran 42h unsupervised with a dissolved
sole watcher; hand-repaired, then the same condition **re-formed within ~20h** via a different
cause.
*Evidence*: pij#154. *Measured*: repair half-life ≈ 1 day. Fleet-wide, 2 of 32 subscriptions
were unambiguously unable to receive.

### F-005 · A brief does not fit in any message surface
`pij report now` truncates at 280 chars, state notes at 200 (pij#123, undocumented until you
hit them), and a quoted `pij send` body **executes shell substitutions** with caller
privileges (pij#128). So the only safe brief transport is a file plus a pointer.
*Status*: the pointer-delivery invariant exists precisely because of this.

### F-006 · PR review cannot gate anything
Every seat pushes as the same GitHub identity, so `gh pr review --request-changes` is refused
(*"Can not request changes on your own pull request"*). All cross-seat review is comments,
which do not block a merge, and `reviewDecision` reads *unreviewed* for reviewed work.
*Evidence*: pij#150. *Impact on fleets*: a reviewer seat's verdict has no enforcement.

### F-007 · Sequential merges burned one full CI run each
Merging five PRs one by one started five full runs (3 matrix jobs each) against trees that
existed for ~10 seconds. There was **no `concurrency` block in any workflow**; four runs were
cancelled by hand.
*Status*: **FIXED** — pij#157 added per-ref supersession. Kept here as the archetype: a fleet
multiplies anything the merge path does per-PR.

### F-008 · `gh pr checks` reports superseded results
After a re-run it shows the last run associated with the branch, not the current head. A PA
reported two PRs RED for three consecutive sweeps while both were green.
*Fix*: always `gh pr view <n> --json statusCheckRollup`.

### F-009 · A GitHub token can expire mid-fleet, silently
`gh` began returning `HTTP 401` after a crash; every PR/issue verb failed until re-auth. A
fleet whose convergence path is `gh` stops entirely and the failure looks like unrelated tool
noise.

### F-010 · A worktree reap destroys the seat's session buffer
Reaping after merge destroyed a PM's only copy of 20 retro observations; a custody snapshot
taken for other reasons was the sole survivor.
*Rule*: capture before reap, always.

### F-500 · Partition covers the files work TOUCHES, not the files it INVALIDATES
The partition names each stream's source files. It has no category for **tests, proofs and
documents that assert the old behaviour** — they are owned by nobody, they live anywhere in
the repo, and they surface only when a fix makes them fail. s096 hit **six** in one change:
`docs/plans/055-pij-watchdog/proofs/run-proofs.ts:922`, `watchdog-manager.test.ts:599-616`,
`watchdog.test.ts:230`, `watchdog.test.ts:247`, plus `docs/how/pij-watchdog.md:221-228` and
`skills/pij/references/00-routing.md:179`.
*Evidence*: `run-proofs.ts:922` asserts a first fire is `watchdog responsive:` — the premise
the fix removes. It is run by **neither** CI (vitest `include` covers `.pi/**`, `harness/**`,
`skills/**` only) **nor** `harness checks` (`harness/scripts/smoke.ts:313` runs
`run-proofs.ts --smoke`, which dispatches only `runSmokeComposite` at `:1335`, never the
`SCENARIOS` list). So the fix would have left the full 055 proof stale with every gate green —
the hazard already recorded in `.harness/records/retro/2026-07-29/005.md`.
*Cost*: found by reading, not by a gate; one prime ruling to authorise the cross-boundary edit.
*Rule (o-prime)*: partition has **three** categories — the files work touches, the files it
creates (F-013), and the files it invalidates. Only the first was modelled.

### F-501 · The tooling fights the ordinal rule the brief depends on
Every brief warns six PMs to use their **stream ordinal** so they do not all mint the same
plan number. `harness plan new <slug>` offers no way to set it — it produced
`docs/plans/watchdog-verdicts` with no `096`, i.e. precisely the collision the rule exists to
prevent. Renaming by hand is the only route.
*Evidence*: `harness plan new watchdog-verdicts --dir docs/plans` → `folder:
".../docs/plans/watchdog-verdicts"`. *Cost*: one delete + re-create.
*Also*: the run reported `status: "degraded"` because schema `builder/plan` resolves nowhere
(`harness dd schema list` → `schemas: []`), so no markdown renders — while every existing pij
plan is plain markdown anyway. The dd-native path is not adopted here.

### F-502 · `pij spawn --effort` is recorded as intent but not honoured at runtime
Spawned a coder with `--effort high`; the registry records `effort: high`, and the peer's own
canary reports `effort: medium`.
*Evidence*: `pij state pij-immediate-flea` → `effort: high`; peer canary reply →
`claude-opus-5, effort: medium`. *Cost*: none yet — caught by canary-verify (§ C2), which is
the argument for canarying rather than trusting a ready-ping. *Status*: open, reported to the
prime; belongs to the capability-surface stream, not this one.

### F-503 · The ledger's "append-only merges cleanly" assumption is false, and it bit this stream
The onboarding brief states the ledger is *"append-only, so concurrent appends from six PMs
merge cleanly at different line ranges."* **They do not.** Appends into a **sectioned**
document land at the same *anchors* — every difficulty goes immediately before the `---` that
precedes `## Wins` — so two streams appending different ids collide on identical context lines.
*Evidence*: PR #190 was `CONFLICTING`/`DIRTY` against `main` on `docs/how/fleet/ledger.md`
alone, in **two** regions, between `s096`'s F-500 block and `s098`'s F-700 block. Neither
stream touched the other's rows.
*Cost*: the conflict itself is trivial (both sides additive — keep both in id order). The real
cost was diagnostic: **GitHub does not run PR checks on a conflicted PR**, so the symptom was
*"CI never triggered"*, not *"you have a conflict"*. ~20 min spent confirming Actions were
enabled, the workflow active, and the event firing for sibling PRs, plus a close/reopen, before
`mergeStateStatus: CONFLICTING` gave the answer.
*Rule*: check `gh pr view <n> --json mergeable,mergeStateStatus` **first** when checks are
missing — an absent check is not a queued check, and an empty result carries no evidence about
what was searched.
*Fix*: per-stream ledger fragments merged by a script, or ordering keyed on the id block so
appends are genuinely disjoint. Category 4 (shared test files) has a sibling nobody declared:
**a shared append-only document is a shared mutable file.**

### F-504 · `npm ci` is the fix for F-700 *and* for category 7, in one line
F-700 records that `npm install` fails in a worktree
(`--min-release-age cannot be provided when using --before`); category 7 records that
`npm install` **dirties `package-lock.json`** by normalising it, producing a phantom diff two
streams can then conflict over. **Both are properties of `npm install`; neither is a property
of `npm ci`** — `npm ci` installs strictly *from* the lockfile and never writes it.
*Evidence*: this stream ran `npm ci --min-release-age=null` in its worktree. It succeeded where
`npm install` had failed with exactly F-700's error, and `git status package-lock.json` is
**clean** afterwards — so this stream is the conditional case category 7 warns about and
carries none of the hazard.
*Rule*: make `npm ci --min-release-age=null` the recipe's install step. An encoded default
beats two things to remember, and category 7's danger is that it happens **before** anyone is
paying attention.

### F-700 · A linked worktree has no `node_modules`, and `npm install` cannot create one
`s098-daemon-perf` could not run any TypeScript. `npm install` fails outright:
`--min-release-age cannot be provided when using --before` (an `npm config` `before` date is
set globally). Nothing in the onboarding brief mentions that a worktree starts without
dependencies.
*Cost*: ~15 min and three dead ends before symlinking the main checkout's `node_modules`.
*Workaround*: `ln -s /path/to/main/node_modules <worktree>/node_modules` — untracked, and
`git status` stays clean.
*Status*: open. **`pij fleet stream new` should do this at creation time**, or the recipe
should say it in one line.

### F-701 · Monkey-patching `node:fs` reports zero, and zero reads as "no calls"
To attribute a slow tick I wrapped `fs.fsyncSync` / `childProcess.execFileSync` on the module
object. Under ESM, `import { fsyncSync } from "node:fs"` binds directly, so the patch observes
**nothing** — and the profiler printed a clean, confident, entirely empty breakdown of a
30.9-second tick. A silent detector inside the tool built to find silent detectors.
*Evidence*: first run of the s098 profiler; `sites` map empty while the tick took 30,889ms.
*Cost*: ~20 min, and it very nearly became a reported finding of "no I/O in the hot path".
*Fix that worked*: the in-process V8 profiler (`node:inspector` `Profiler.start/stop`) for
timing, and **prototype** patching (`FsRegistry.prototype.write`) for counts — prototypes are
real objects, so patching them does bind.
*Rule*: an instrumentation run that reports **zero** must be treated as broken until it has
been shown to report non-zero for a call you know happened.

### F-702 · The daemon's own latency silently invalidates the daemon's own verdicts
Investigating a slow tick, the tick turned out to be slow enough that supervision verdicts
derived from it became false. `lastEventAt` is refreshed by the daemon's own observation, so
"seat has gone quiet" actually means "the observer has not looked recently enough"
(`daemon.ts:774-777` vs `daemon.ts:552-560`; pij#182). A fleet-wide instrument was reporting
confident wrong answers about live seats, and the only tell was a second line in the same
output saying the tick was stale.
*Cost*: none to this stream (the prime caught it live), but it inverted the severity of the
brief.
*Rule*: when an instrument's own latency is an input to its own measurement, latency stops
being a performance concern and becomes a **correctness** concern. Cite pij#160.

---

### F-100 · A partition that covers the source files but not the artifacts the *process* creates
The 2026-08-08 wave partitioned by source-file ownership and six streams never collided on
code — but every PM independently ran `/builder 1a explore`, which mints
`docs/plans/<next-ordinal>-<slug>/`. `docs/plans/` topped out at `084`, so all six were about
to create `085-*`: six folders, one namespace, chosen by tooling rather than by anyone.
*Evidence*: `ls docs/plans/ | sort -n | tail -1` → `084-pa-gate-repair`, against six concurrent
seats each instructed to run the same stage-1a verb.
*Cost*: caught pre-collision by asking, so ~0 — but only because one seat happened to look at
the ordinal before minting. Any seat that did not ask would have created the conflict silently.
*Resolution*: prime's ruling — **derive the plan ordinal from the stream ordinal**
(`docs/plans/092-install-blocker` for `s092/install-blocker`). The stream ordinal is already
globally reserved by `pij stream create`, so six PMs converge on six distinct numbers with
**zero coordination**, and plan folder / worktree / branch carry the same number for free.
*The general form, which is the actually valuable part*: **a partition must cover what the
process creates, not only what the work touches.** Plan folders, ledger ids, branch names,
ordinals, PR titles — every one is a shared namespace, and the ones the *tooling* generates
are the easy ones to miss precisely because nobody chose them. Note also which fix was chosen:
a **derived** rule beats an **assigned** one. Hand-allocating `085-090` would have worked for
this wave and failed the first time a stream was added, retried, or run by someone who never
saw the broadcast — *a rule that needs a broadcast to stay true is worse than one that cannot
collide.*
*Status*: resolved by ruling; **not yet encoded** — see S-100.

### F-101 · A fresh worktree cannot `npm install`: the repo `.npmrc` and npm's git-dep sub-install contradict each other
A new worktree has no `node_modules`, and `npm install` fails before resolving config:
`--min-release-age cannot be provided when using --before`. Cause: `.npmrc` sets
`min-release-age=7`, and npm's *git dependency* preparation (`minih`, `package.json:72`) re-invokes
npm with an explicit `--before=<timestamp>`; the two are mutually exclusive. The main checkout is
immune — its `node_modules` predates the conflict — so this is invisible to every seat that never
cuts a worktree.
*Evidence*: `npm error command … --before=2026-08-01T03:35:02.012Z` / `npm error cause
--min-release-age cannot be provided when using --before`; `.npmrc:4`; `package.json:72`.
*Cost*: ~10 min of a PM's time and three failed installs, before any work started. Note the
shape — it is the same shape as the issue this stream was fixing: **a bootstrap step that only
fails for someone who does not already have the artefact.**
*Workaround*: temporarily strip `min-release-age` from `.npmrc`, install, restore the file
(verify with `git diff --stat .npmrc` — it is tracked). Clumsy and easy to leave dirty.
*Status*: open. Real fix is upstream in the `.npmrc`/git-dep interaction; the fleet-level fix is
S-101.

### F-102 · A de-duplication that added the helper and removed none of its duplicates
`core/agents/paths.ts` was written to replace an inlined `PIJ_HOME ?? ~/.pij`, and its own header
names the three files it replaces: *"was inlined 3× (cli.ts / index.ts / daemon.ts); this is the one
place that computes it"*. **All three still inline it.** The canonical resolver landed as an
addition and propagated to none of its stated targets — seven inlined sites survive against one
helper that believes it replaced them.
*Evidence*: `grep -rn 'process\.env\.PIJ_HOME ??' .pi/extensions/pij/ --include=*.ts | grep -v
'\.test\.' | wc -l` → `7`; header claim at `core/agents/paths.ts:1-6`.
*Cost*: the divergence is silent and semantic — `resolvePijHome()` treats an empty `PIJ_HOME` as
unset, the seven inlined `??` sites do not, so the two disagree about where the machine-wide
registry lives. Filed as pij#169; swept in this stream's PR.
*The general form*: **a de-duplication is only done when the duplicates are gone.** A helper whose
docstring asserts it is "the one place" is *evidence of intent*, not evidence of adoption — and it
reads as the latter, which is why nobody re-checked for six months. Grep for the pattern the helper
replaced, not for the helper.

### F-103 · A truncated enumeration is indistinguishable from a complete one
The prime enumerated the sites above with a `head -8`. The output was exactly 8 lines — 6 real sites
plus 2 lines from `paths.ts` itself — so the list *ended at the limit* with no ellipsis, no count and
no marker. It looked exhaustive, was read as exhaustive, and was relayed as exhaustive in a message
whose entire argument was **"all of them or none"**. The missing 7th was `index.ts:48`: the
extension entry point, and one of the three files the helper names.
*Evidence*: prime's correction on pij#169; `wc -l` → 7 against a 6-item list.
*Cost*: ~0, because the receiving PM re-ran the enumeration unbounded instead of accepting it. Had
it been accepted, a six-of-seven sweep would have left the entry point silently diverging **and been
declared complete** — the exact partial-fix failure the issue's own thesis warns about.
*Standing practice*: **never pipe an enumeration through `head`.** Count with `wc -l` first, or
`tee` the full set. A bounded view of an unbounded question answers a different question than the
one you asked, and gives no sign that it did.
*Fleet-specific sting*: in a fleet, one seat's truncated measurement is relayed as a ruling and
arrives at N seats as fact. Verification cost is paid once by the sender; the cost of *not* paying
it is multiplied by the fan-out.

### F-105 · A file-ownership partition cannot partition a composition root or an import block
`daemon.ts` is the **composition root** — the one place every subsystem is constructed. So any
stream fixing *any* subsystem needs two lines inside a file another stream owns. Three streams
needed regions in it this wave (s092's bootstrap/lock path, s095's `reconcileDeaths` call site at
`:639-648`, s097's `AnomalySweep` constructor at `:354`). The **import block** has the same property
for a different reason: it is one alphabetically-sorted list that Biome enforces, so every stream
that adds a dependency edits the same region.
*Evidence*: prime's coordination ruling, 2026-08-08; this stream's own `daemon.ts` hunks are
`:11-19`, `:12`+`:32`, `:1091`, `:1121-1128` — the first two of which are *import block*, not body.
*Cost*: zero here, because it was declared before convergence rather than discovered at merge.
*The distinction that matters more than the category*: the two need **opposite** handling. A
composition root needs **sequencing** — two streams' wiring can conflict *semantically*. An import
block needs the merger to **expect** the conflict and just resolve it — it is *mechanical*. This is
load-bearing because **a boundary violation and a mechanical merge conflict look identical in a
diff**: a prime seeing two streams on the same import lines can read it as a seat crossing a line,
and be wrong, and say so to a seat that did nothing wrong.
*Fleet-wide result*: six partition categories are now recognised — **touches** (the original rule),
**creates** (F-100), **invalidates**, **shared tests**, **composition root**, **import block** —
five of the six surfaced by PMs rather than by the partitioner.

### F-106 · "The test must fail without the fix" is itself a claim, and needs the same evidence bar
The wave's headline bar — *your test must fail without the fix* — is right and **not sufficient**.
It is a claim *about a test*, and it can be sincerely believed while being false, because the tests
are written from the same mental model that wrote the fix.
*Evidence (another stream)*: s095's independent validation measured **two of its own acceptance
criteria already passing against pre-fix code** (`death-reconciler.test.ts:103-111`). It would have
shipped a fix "proved" by tests that could never have failed — all green, and the PR would have read
as rigorous.
*Evidence (this stream)*: applying the same step here found **AC-08 and AC-09 were behavioural in
intent but new-API in evidence**. All five Phase-2 tests target the new pure `daemonStartOutcome()`;
`rg -n --hidden 'ensureDaemonRunning' --glob '*.test.ts' .pi/` returns **nothing**. Delete the poll
loop, restore the old unconditional success line, and every test stays green — on the phase whose
entire subject is *not reporting success you have not verified*.
*Cost*: caught pre-merge, at the cost of one `rg` and one honest look. Remediation is a Phase 4.
*The mechanical step, and it must run BEFORE implementation*: for each acceptance criterion, **run
it against pre-fix code and watch it fail** — do not reason about whether it would. Then label every
criterion **behavioural** (must fail first) / **new-API** (cannot, declare the exception) /
**preserved-property** (must pass before *and* after; a regression guard, never evidence of the fix).
A behavioural criterion that cannot fail first is a defect in the plan; a preserved-property
criterion presented as evidence of the fix is the pij#142 shape — *a check that agrees with reality
without being able to disagree*.

## Wins

### W-700 · An APFS clone made a live-system investigation safe and repeatable
`cp -Rc ~/.pij /tmp/pij-perf-home` clones 1.7G in ~5 min at near-zero disk cost, and rewriting
the absolute paths inside the 579 copied descriptors severs every link back to the live home.
That turned "profile the daemon" from an operation that risked a running 40-seat fleet into an
offline experiment I could run repeatedly — including pruned copies at 40/100/200/350/549
descriptors to measure the growth law empirically instead of asserting O(n) from the shape of
a `for` loop.
*Evidence*: `docs/plans/098-daemon-perf/bench/`, and the growth table in `findings.md` §3.
*Why it generalises*: any stream investigating live-system behaviour can clone the state
directory rather than reasoning about it, and a clone is the only way to run the same tick
twice.

### W-701 · `sample <pid>` profiled the live daemon with no restart and no cooperation
macOS `sample` needs no sudo, no flags on the target, and no restart — which mattered because
restarting the daemon would have disrupted six other streams mid-flight. It attributed 46% of
the daemon's main thread to subprocess spawn and 42% to fsync **before** any code was read.
*Rule*: profile the running process first. It costs 15 seconds and it tells you which half of
the code you can stop reading.

### W-001 · File-ownership partitioning
Cutting six streams by **file** rather than by issue eliminated the convergence conflicts that
an issue-shaped partition would have created — most visibly by giving `core/anomalies.ts`
entirely to one seat rather than splitting six issues that all want it.
*See*: [`partitioning.md`](./partitioning.md).

### W-002 · A ruling converts to a PR in ~20 minutes
A PM given a bounded ruling plus a three-part scope produced a green, mutation-proofed PR
(pij#149) in about 20 minutes, unattended.
*Condition*: the scope was bounded and the file ownership was unambiguous.

### W-003 · Cross-government reconciliation outperforms either fleet's detectors
Three governments reconciling **independent instruments** over one day caught more real
defects than any detector did. Two probes reading different fields disagreed, and the
disagreement was the finding.
*Doctrine*: `government/doctrine/a-coupled-instrument-cannot-report-its-subject.md` —
independence must be of **path**, not of clock.

### W-004 · `pij bg` for anything slow
Backgrounding a CI wait returns the result as an injected turn instead of blocking a shell.
Directly applicable to a fleet: watching N PRs is N background jobs, not N blocked seats.

### W-005 · Questions relayed through the prime, one at a time
One sentence of context and one sentence of ask, never batched, kept a six-way fleet's
human-facing surface to a single serialised queue.
*Requirement*: the prime marks its own state so the board shows an outstanding ask.

### W-500 · Independent validation refuted the OBVIOUS fix before a line was written
s096's plan proposed treating a watchdog-attributed `lastEventAt` advance as proof the peer
answered — the fix any competent seat reaches for, and one the prime had already approved.
A validation subagent refuted it at source: delivering a watchdog turn makes the target's own
`lastEventAt` advance with **zero** model involvement (`core/session.ts` `onInbound` →
`emitReceipt` → `capture("receipt")` → `persist({ lastEventAt })`).
*Consequence avoided*: a pi peer with a live inbox receiver and a wedged model would have been
read as "answered" on every nudge, making `stalled` **unreachable** for exactly the frozen peer
the watchdog exists to catch — a false negative traded for a false positive, which for a
supervision instrument is strictly worse, and it would have shipped **green**.
*The general shape*: **the act of supervising writes the field supervision reads.** pij#136
reasoned about pane text; this is the same contamination one layer down.
*Convergence*: s097 independently found `lastEventAt` has three writers and none means "did
work"; pij#172 shows a dead seat's `lastEventAt` advancing via a recycled pane id. Three
contamination paths, three directions, one day.
*Cost*: one subagent run. *Replacement*: `statusAt`, which only the peer's own `pij report`
moves (`core/registry-write.ts:90`) — and which the manager already tracked.

### W-501 · Running the criteria beat reasoning about them, on the author who wrote the rules
s096 wrote five criteria, reasoned confidently about all five, then ran them against the
unfixed tree as the prime's gate demands. **Three passed** — none testing what its name claimed.
*AC-06* never reached the bug: the pane died while a fire was outstanding, so watchdog
attribution absorbed the delta and the test measured a **neighbour**. *AC-07* fired **zero
times**: holding `statusAt` at `now` re-anchors the schedule (`isFireDue` takes
`max(lastFireAt, scheduleAnchor)`), so nothing was due and "never stalled" passed by
**absence**. *AC-04* cannot fail pre-fix at all and was mislabelled behavioural.
*Both* known failure modes — satisfied by a neighbour, satisfied by absence — appeared in five
tests written by the author who had just relayed both rules.
*Rule*: **pin the precondition the test depends on**, or absence impersonates success. AC-07
now asserts `h.fires.length` increments each round, so it can never again pass with zero fires.
*Cost*: one test run. Without it, three green decorations would have shipped as proof.

### W-502 · The wave's through-line: two correct rules whose INTERSECTION has no owner
Found independently at **four** layers in one wave, by different seats from different
directions. It is not a recurring coincidence; it is the shape.

| Layer | Instance |
|---|---|
| **Code** | pij#148 — the watchdog-attribution disqualification is correct (pij#136), and `ready`-does-not-mute is correct; the seat that is supervised, honest **and** unemployed is destroyed by the pair. pij#145 is the general form. |
| **Tests** | A criterion satisfied by a **neighbour** (s097: a fixture tripping an adjacent row of the same kind), and one satisfied by **absence** (s096: a bare negative, and an assertion that fired zero times). |
| **Assertions** | s094 — *permitted* is what an absent gate produces, so the assertion cannot tell an allowed action from an unguarded one. |
| **Process documents** | The partition doc knows which proofs are at risk; the fail-first doc does not know it needs to ask. Two correct documents, and the fact connecting them lives in neither. |

**None of these is anyone's mistake.** Each rule is right in isolation, each was written
deliberately, and the defect lives only where two meet — which is precisely the region no
single owner is accountable for. Diligence within a rule cannot reach it, because the failure
is not *inside* any rule.

*Corollary that generalises the partition* (s096, accepted by o-prime): **file disjointness
does not imply proof disjointness.** The partition models **writers**. An executable proof
that boots a real `Daemon` **reads through** a file six seats have opinions about, so a stream
can be partition-clean and proof-coupled at the same time — and nothing in the partition
surfaces that edge, because reading was never in the model.
*Practical rule*: after any rebase carrying another stream's changes, re-run the full proofs
and re-establish the both-ways result. **Green proves the assertion still runs, not that it
can still fail.** *Still-present* and *still-load-bearing* are different claims.

---

### W-100 · A PM correcting the prime, twice, and both corrections holding at source
This stream corrected the prime twice — the plan-folder ordinal collision (F-100) and the
seven-vs-six site count (F-103) — and both survived independent verification by the prime.
*Evidence*: prime's rulings of 2026-08-08, both re-derived at source before acceptance; the second
was corrected publicly on pij#169 rather than quietly in the thread.
*Why it is a win and not just an anecdote*: the fleet's whole risk profile is that a prime's message
arrives at N seats as fact, so an unchallenged prime scales its errors by the fan-out (F-103). The
pattern that made it work is cheap and repeatable — **the receiving seat re-ran the measurement
instead of accepting the number** — and it cost one command each time.
*The condition worth preserving*: the prime asked to be corrected and said so explicitly. A seat
that expects to be overruled does not spend a turn checking.

### F-104 · The repo's own ship gate is non-deterministic under fleet load — and the flaky test belongs to the fleet's own orchestration tool
`harness checks` (the "are we done?" gate) failed on `test` with
`ENOTEMPTY … rmSync` in `skills/flow-pair/test/observe.test.ts:306`'s `afterEach`. It is flaky, not
a regression, and **nothing to do with the changed files** — a different package entirely.
*Evidence*: (a) isolated re-run passed 17/17 (`npx vitest run skills/flow-pair/test/observe.test.ts`);
(b) the **full** suite passed on the same tree 8 minutes earlier — 4044 passed / 19 skipped / 211
files; (c) the failing path is `skills/flow-pair/`, while the change is in `.pi/extensions/pij/`.
*Cost*: ~15 min across two seats, and it nearly cost more — the coder's first diagnosis was
*"environment contention from five concurrent agents during a fresh Pi boot"*, a confident mechanism
claim that it had not run anything to establish. The orchestrator disproved it by running the gate
itself. That is the fifth confident-but-false mechanism claim this fleet has caught in three days.
*The sting specific to fleets*: `skills/flow-pair/` is the **orchestration engine the fleet itself
runs**, and it sits inside the repo's own test suite. So orchestrating the work perturbs the gate
that judges the work. A fleet does not just add load to the gate — under this layout it adds load
*from the very tool that decides whether the gate should run*.
*Status*: open. A flaky test in the ship gate is worse under a fleet than under one seat, because N
seats each hit it independently and each must independently decide whether it is real — and the
cheap wrong answer ("contention, ignore it") is also the plausible one.

### W-101 · A worker that measured instead of accepting the orchestrator's number
The Phase-2 packet specified a verification budget "well under a second", reasoning that the daemon
writes its lock before it does anything else. The coder measured three cold starts instead of
accepting it — **584/572/576ms** — and overrode the plan with `2500ms`, flagging the deviation
rather than hiding it.
*Evidence*: coder's completion report, `dlg-0002`; `DAEMON_VERIFY_BUDGET_MS` comment carries the
three measurements in-source.
*Why it matters*: the orchestrator's **reasoning was correct** — the daemon really does write its
lock first — and the **constant was still wrong**, because `npx` + the `tsx` transform of the import
graph run *before* any daemon code. A 500ms budget would have reported every healthy auto-start as
unverified: **pij#118 defect 2 exactly inverted**, shipped by the fix for it.
*The general form*: **a correct mechanism can still yield a wrong constant.** Reasoning tells you
which quantity matters; only measurement tells you its value. A packet that hands a worker a number
should say how it was derived, so the worker knows whether it is a measurement or a guess — and a
worker should treat an underived number as a hypothesis.
*Cost*: three cold-start runs, maybe two minutes. It prevented a self-inverting fix.

## Suggestions — the future `pij fleet` feature

### S-001 · `pij fleet plan --from-issues <n...>`
Read each issue's cited `file:line`, build the file → issues map, and **propose** a partition
with every collision named. This is the highest-value automation on the list: the partition is
the whole design, and today it is done by hand and by judgement.

### S-002 · A declared file-ownership registry, checked at convergence
Each stream declares the files it owns. A pre-merge check fails loudly when a branch touched a
file it does not own — catching a boundary violation at PR time rather than at conflict time.

### S-003 · `pij fleet spawn` — one verb for the whole standing-up
Project, streams, spawn-from-main, link **without** clobbering the role, role stamp, task set,
brief pointer. Every one of those is a step someone gets wrong once (F-001, F-002).

### S-004 · Auto re-point watcher subscriptions on death or handover
The direct fix for F-004: when a watcher dies, re-point its subscriptions to its parent, or
refuse the teardown until they are re-homed. Detection is the floor; not creating the orphan
is better.

### S-005 · A convergence queue
An explicit merge train that knows the partition: merges disjoint streams freely, sequences
any pair sharing a file, and re-verifies with `statusCheckRollup`.

### S-006 · A fleet board rendered from probes, not self-reports
Per stream: seat, semantic state + age, HEAD sha, dirty count, own-commits?, CI verdict,
PR state, last question + age. **Corroboration columns are the point** — the board should show
what the tree and the API say, not what the seat claims.
*Credit*: this is I-20 of the external `s241` delivery review (`pij-ripe-platypus`, Vaughan's
fleet), which reached it independently from a different direction.

### S-007 · Capture-before-reap as a lifecycle step
`stream close` should snapshot the seat's buffer before the worktree goes (F-010).

### S-500 · `pij fleet invalidates <paths...>` — find what a change makes staleGiven the files a stream owns, sweep the repo for **assertions and prose about their current
behaviour**: test files referencing the symbols, `.ts` proofs outside the test globs, and docs
quoting the semantics. Report them as a fourth column of the partition (F-500). Must search
with `--hidden` (pij#144). The sweep is mechanical; only the *judgement* about each hit needs a
human. Today they are found by a careful reader or not at all.

### S-501 · Ordinal-aware plan scaffolding
`harness plan new` should accept `--ordinal` (or read the stream allocation) so the fleet's own
ordinal rule is enforceable rather than aspirational (F-501). A rule the tooling actively
fights is a rule that gets broken by the diligent.

### S-502 · Make the mutation gate a first-class fleet verb
s097's `~/.pij/shared/mutate.mjs` (W-602) is the right shape and should not live in a home
directory. It mutates **in memory**, so restore is inherent, and it exits **2 on TARGET NOT
FOUND** — closing the failure mode where a drifted `sed` target mutates nothing, the suite runs
green, and that green is reported as proof. It also needs no write access, so a **reviewer** can
run an independent gate on someone else's branch — which is what turns the strongest check we
have from self-reported into verified.
*Sharpest case*: a PR that **edits** assertions is exactly where a saved mutation target drifts,
because the author is changing the very strings the mutation aims at.

### S-700 · `pij fleet stream new` should leave a worktree that can actually run the code
Dependencies linked, and a one-line smoke (`npx tsx -e 'console.log(1)'`) proving it. F-700 was
15 minutes of a stream's life spent on something no stream should ever discover.

### S-701 · A `pij doctor --perf` that prints the tick budget
The three numbers that would have made this whole investigation a 30-second command: tick ms,
working-set size, and ms-per-descriptor. The daemon already logs the first two
(`daemon.ts:671`); the ratio is the one that tells you whether you are about to cross a
supervision threshold (pij#182). **A trend line would be better than a number** — the failure
here was never a bad reading, it was a slope nobody was watching.

### S-702 · Instrumentation harnesses should live with the finding, not in `/tmp`
Every measurement in s098 is re-runnable from `docs/plans/098-daemon-perf/bench/` against a
clone. A finding that cannot be re-run is an opinion with a number in it, and the second
person to care about it always starts from scratch.

---

### S-100 · Derive every generated name from the stream ordinal — and *check* it
Encode the F-100 ruling instead of broadcasting it: `pij stream create` already reserves a
globally-unique ordinal, so every artifact the process generates should be derived from it —
plan folder (`docs/plans/<ord>-<stream>/`), branch, worktree, and the ledger id block
(`F-<ord>` upward, which is where this row's own numbering came from). Then add the *check*:
a stream that creates a `docs/plans/NNN-*` whose `NNN` is not its own ordinal is a boundary
violation, detectable at PR time by the same pre-merge check S-002 proposes for source files.
**The check is the half that matters** — a derivation rule nobody verifies is still a rule that
needs a broadcast.

### S-101 · `pij stream create` should leave a worktree that can actually build
A worktree with no `node_modules` is not a working seat, and every PM in this wave paid the same
install tax independently (F-101). Stream creation should either run the install, or run the
repo's own bootstrap (`just install`), or — at minimum — **verify** the tree builds and say
plainly that it does not. The failure mode to design against is the one F-101 exhibits: the
bootstrap step is invisible to everyone who already has the artefact, so it will never be found
by the people who maintain it.

## How to add to this ledger

Append a row with: what happened, **the evidence** (file:line, issue number, or a measurement),
and the cost. If it is a difficulty, say whether it is open, worked around, or fixed. If a
difficulty gets fixed, keep the row and mark it — the archetype stays useful after the
instance is gone (see F-007).

### F-703 · A findings document's citations are proofs, and convergence invalidates them silently
s099's rule ("re-run your fail-first criteria on the rebased tree") has an analogue for
investigation streams that the rule as stated does not reach. s098 produced no tests and no
guards — its entire deliverable is `file:line` citations into `daemon.ts`, a file **three
streams edited this run**. A drifted citation still reads as correct: grep finds the symbol,
the prose still parses, and no suite goes red. There is no signal at all.
*Evidence*: re-verifying s098's seven citations against `origin/main@a2a50e2` by printing each
line found **two wrong** (`daemon.ts:645`→`644`, `345-355`→`342-351`) — wrong at authoring
time, from transcription, and they would have survived review indefinitely.
*Cost*: 10 minutes to check, and it was only checked because the s099 notice arrived.
*Rule*: **if your deliverable is evidence rather than code, verify it the same way — extract
the file at the ref you are citing and print the line.** A citation nobody re-ran is the
documentation equivalent of a green suite that proves nothing.
*Generalisation*: the fleet's proof discipline is scoped to artifacts that can fail. The
artifacts that **cannot** fail — findings, dossiers, issue bodies, briefs — carry the same
claims with none of the enforcement, and they are what the next stream reads first.

### F-704 · Two censuses of the same set, same predicate, same count, zero overlap
The prime published an authoritative list of 14 specs that drive subprocesses, generated with
`grep -rln '<markers>' --include=*.test.ts .pi/extensions/pij/`. Regenerating it with **`rg`** —
this repo's default search tool — at repo root with the *identical five markers* returns a
different 14: the `harness/` and `skills/flow-pair/test/` specs. **The two sets are completely
disjoint and both have cardinality 14.**
*Evidence*: `rg -l 'execFileSync|spawnSync|execSync|execPath|child_process' --glob '*.test.ts'`
returns 14 files, none of them under `.pi/`; adding `--hidden` returns 28; passing an explicit
`.pi/extensions/pij/` path returns the prime's 14 exactly.
*Why it is worse than an ordinary miss*: a seat re-running the census "to check" gets 14, sees
14, and concludes it corroborated the list. **The matching count is the failure** — it converts
a disjoint answer into apparent agreement.
*Boundary, stated precisely because pij#144 can be read as "rg never works here"*: `rg` with an
explicit `.pi/` path is correct; only the **bare repo-root sweep** is blind. The trap is scope,
not the tool.
*Rule*: **a census must publish its predicate AND its scope, and a re-run must reproduce both.**
A command that is copied but re-tooled answers a different question and says so nowhere.
*Open question raised, not assumed*: the 14 `harness/` and `skills/` specs do trip the tool's
marker set. Whether they are in scope for the mutation gate is the prime's call.

### F-705 · A precondition promoted to evidence, in measurement rather than test currency
s099's B.3 ("each criterion must assert the claim, never the setup that makes it reachable")
applies to measurements too. This stream's headline claim — *the tick is linear in the working
set* — was measured on a harness with the tmux port **stubbed**, i.e. with the 26-46% of tick
cost that is subprocess spawn set to **zero**. The result was evidence about the fsync half,
presented as evidence about the tick.
*Fix*: re-ran the full series with `capturePane`/`isPaneDead` hitting real tmux and only the
mutating methods stubbed (`bench/growth-law-realio.ts`). 100→547 descriptors: 2997→18291ms,
overall exponent **1.06**. The claim survived, and ms/descriptor moved from 20.3 to 33.4 —
materially closer to the live daemon's ~51.
*Rule*: **a benchmark that stubs a cost centre is evidence about the remainder.** State what was
stubbed next to the number, every time; if the stub covers a term of the thing being measured,
the headline claim is not yet earned.
---

## Stream `send-path` (w1-hardening, 2026-08-08) — block F-200 / W-200 / S-200

Appended as one contiguous block at EOF rather than into the sections above — see S-201 for why.
PM `pij-historical-skunk`, prime `pij-continuing-ermine`, issues pij#128 / pij#132 / pij#167.

### F-200 · The fleet's own safe-transport workaround is broken, and only for hostile bodies
Every brief in this wave travelled by `pij send --body-file` because a quoted body executes shell
substitutions (pij#128, F-005). That channel does not deliver bodies verbatim: it calls
`body.trimEnd()` and then **re-appends the body as an argv token**, which the lexer parses. A body
whose first characters are `--` is read as a flag, and because `--wait` is a *valued* flag on
`send`, `pij send <id> --wait --body-file f` silently consumes the file's contents as `--wait`'s
value.
*Evidence*: `.pi/extensions/pij/cli.ts:4253` + `.pi/extensions/pij/core/cli.ts:707-720` + `:1084`.
*Cost*: unknown-but-nonzero — no seat can audit which of its briefs were altered, because a
trimmed or mis-lexed body and a clean one look identical in the sender's transcript and return the
same receipt. *Found by*: an independent plan validation, not by use — five hours of fleet traffic
went through it first. *Status*: being fixed in this stream.
*The archetype*: **a mitigation that reproduces the flaw it mitigates, in the layer below.** The
mitigation is trusted more than the original because it was adopted deliberately, so it is audited
less.

### F-201 · The one existing safety note is invisible at the surface that documents it
`pij send --help` filters USAGE to lines containing the literal `pij send`. The shell-expansion
warning is an **indented continuation line** and does not contain that string, so it is dropped.
The command a caller runs to read about `send` is the one place the `send` warning cannot appear.
*Evidence*: `.pi/extensions/pij/cli.ts:4216` vs `:325-327`. *Cost*: pij#128's stated mitigation has
been documented-but-unreadable since it was written; three seats hit a *different* shell guard this
week and none of them found this note. *Status*: fixed in this stream.

### F-202 · `harness plan new` is dd-native; this repo has no dd schemas
The `/builder 1b plan` verb scaffolds `plan.dd.json` + a rendered sibling. `harness plan new`
returned `status: degraded` with *"schema `builder/plan` was not found in any discovery root"*, and
`harness dd schema list` returns `schemas: []`. Every existing plan in `docs/plans/` is legacy
markdown, so the correct move was to delete the scaffold and hand-write the plan in the repo's
established format — which the skill explicitly forbids for dd plans.
*Cost*: ~10 min, one scaffold created and removed. *Suggestion*: the verb should detect an empty
schema root and say "this repo is markdown-native, writing `<slug>-plan.md`" instead of producing
an unrenderable artifact plus a remediation hint that cannot succeed.

### F-203 · `flow-pair dispatch` renders an EMPTY allowed-scope as if it were a scope
Omitting `--allowed-paths` produced a packet reading:
*"## Allowed Scope — You may ONLY create or modify files within:"*, then **nothing**, then *"Stay
inside this scope."* A worker reading that is told it is fenced and given no fence.
*Evidence*: `dlg-0002.md:67-73`. *Cost*: caught by inspecting the rendered packet before sending;
had I trusted the tool's exit code, an unfenced coder would have gone to work on a **co-owned
5,800-line file**. *Shape*: this is the same absent-vs-empty defect as pij#128/#132/#108/#113 —
**the failure renders as ordinary output** — appearing in the tool being used to fix it.

### F-204 · `flow-pair dispatch --phase` requires a heading a Simple-mode plan does not have
Dispatch extracts the plan section by literal heading match and fails with `section not found`.
A Simple-mode plan (one phase, inline task table) has no `## Phase N:` heading, so the plan had to
be restructured to satisfy the tool rather than the work.
*Evidence*: first `dispatch` invocation, this run. *Cost*: one failed dispatch + a plan edit.

### F-205 · An unmatched glob echoes itself, so a probe reported a path that does not exist
`ls -d ~/.agents/skills/pij/../*flow*` printed `/Users/jordanknight/.agents/skills/pij/../flow-pair`
— bash echoing the unmatched pattern — and `ls` of that path then failed. I briefly concluded the
skill root was installed where it is not (it is at `/Users/jordanknight/pi-hacking/pij/skills/`).
*Cost*: one wrong turn, ~2 min. *Shape*: same family as pij#144 (`rg` skipping `.pi/`) — **a probe's
own convention rendered as a fact about the world.** Worth stating alongside it in the search trap
docs, because the failure direction is inverted: `rg` renders presence as absence, an unmatched
glob renders absence as presence.

### W-200 · The prime's stated done-bar was unattainable, and the PM caught it before implementation
The charter defined done for pij#128 as *"a body containing backticks and `$( )` is delivered
verbatim and executes nothing."* No pij-side change can hold that property: expansion completes in
the caller's shell before pij's process exists, and the send path is already argv-only
(`adapters/tmux-keys.ts:11-32`, `execFileSync`), so there is nothing left to harden. pij never
receives the pre-expansion string, so it cannot deliver verbatim what it was never given.
The PM asked rather than proceeding; the prime **struck its own bar** and replaced it with an
attainable one (safe path exists, is recommended by docs and `--help`, unsafe path labelled at the
surface).
*Cost avoided*: an implementation aimed at an impossible property — or, worse, something weaker
shipped quietly as though it met the bar, which is exactly the class of failure this wave exists to
remove.
**The fleet finding, which is about brief quality**: *a done-bar that states a property of the
SYSTEM can encode an impossibility that only a reader with the source open can detect; a done-bar
that states a property of the CHANGE cannot.* The corrected bar is three checkable facts about
artifacts. The original was one unfalsifiable claim about behaviour. A future `pij fleet` brief
template should push authors toward the former — and this is the second time in one day a PM has
corrected a brief rather than working around it, which suggests the ask is reasonable to make of
PMs and worth making explicit.

### W-201 · Independent plan validation returned NOT READY and was right five times
A subagent review of plan v1 (with the source, not just the plan) found five blocking issues, all
re-verified at source before acceptance. v1 would have: placed the guard in pure `parseArgs`, where
it **cannot fire for the very test that pins the defect** (that test calls `dispatch` directly);
failed typecheck by adding to an exhaustive error-code map outside its own declared edit fence;
missed the broadcast path entirely (it returns before the guard); and **deleted a shipped telegram
capability** by refusing empty bodies globally — a rule the plan's own research dossier had gotten
right and the plan had drifted from.
*Cost*: one subagent run. *Evidence*: `assets/plan-validation-v1.md`.
*The transferable bit*: the most valuable finding was not a bug in the plan but a **drift between
the plan and its own dossier**. Validation should be given both artifacts and asked to diff them,
not just to review the plan.

### W-202 · The question protocol worked end-to-end, including the part that usually fails
One question, declared with `pij report question`, asked in one sentence of context and one of ask,
answered with reasoning rather than a verdict. The out-of-scope half of the answer was **filed as
its own issue (pij#167) carrying the prime's four objections as the body**, instead of being
dropped or quietly smuggled into this PR.
*Why it is a win worth logging*: the failure mode here is not "the PM did not ask" — it is "the
good idea that was correctly rejected leaves no trace, and the next agent re-proposes it." Filing
the rejection *with its reasoning* is what stops that.

### S-200 · `flow-pair dispatch` should refuse an empty allowed-scope, not render one
Per F-203. An empty `--allowed-paths` should be a non-zero exit, or an explicit
`Allowed Scope: ENTIRE REPO (no fence declared)`. Silence must not render as a fence.

### S-201 · The ledger's append-only claim does not survive six concurrent appenders
The onboarding says appends "merge cleanly at different line ranges" because each PM has its own id
block. Ids are partitioned; **file position is not**. Six PMs each appending to the end of
`## Difficulties` write the same line range and conflict. This block went to EOF to dodge that,
which in turn conflicts with any other PM that reasons the same way.
*Suggestion*: `docs/how/fleet/ledger.d/<stream>.md`, one file per stream, concatenated by a render
step — or have the wave's setup pre-create an empty per-stream section so every PM has a private
anchor. Partitioning by **file** is the same rule `partitioning.md` already argues for code.

### S-202 · I wish there were a `pij spawn --cwd`
Every spawn must be issued from the main checkout (F-001), so every fleet peer starts in the wrong
directory, and every dispatch has to open with *"cd to your worktree and use absolute paths."* That
instruction is a load-bearing correctness requirement delivered as **free text in a chat message**:
if the peer skims it, it edits the main checkout instead of the stream branch, and nothing detects
that until convergence. A `--cwd` that the daemon applies after boot — or a post-bind `cd` the
spawn performs itself — moves the guarantee from prose into the tool.

### S-203 · Derive `--allowed-paths` from the plan's own Constraints section
Both the plan and the packet independently restate the file fence, in different formats, by hand.
They can disagree, and only the packet is binding. The plan already names the fence; dispatch
should read it.

### F-206 · A fresh worktree cannot install its own dependencies
`pij stream create` makes the worktree; nothing populates `node_modules`, and `npm ci` **cannot
run there**: the repo `.npmrc` sets `min-release-age=7`, and npm refuses to combine that with the
`--before` it uses internally to resolve the `minih` git dependency —
*"`--min-release-age` cannot be provided when using `--before`"*. An env-var override did not clear
it.
*Evidence*: hit by the coder seat in this stream on first `npm ci`. *Workaround*: copy
`node_modules` from the main checkout (identical `package.json` + lockfile shasums).
*Cost*: every seat spawned into a fresh worktree hits this wall before it can run a single test,
and the error names neither the worktree nor the setting that caused it.
*Why it belongs in a fleet ledger specifically*: a single-seat workflow never sees it, because the
main checkout is always already installed. **Fleet parallelism is what turns a dormant repo
setting into a per-seat blocker** — the same shape as F-001 (worktree spawn) and F-007 (per-PR CI
runs): the wave multiplies anything that is per-checkout.

### F-207 · The plan's file fence was derived by reading, and it was incomplete
The plan named `core/cli.ts:665-678` as the one exhaustive map over `PijErrorCode`. There is a
**second** one — `ORCHESTRATION_EXIT` at `core/orchestration/cli.ts:111`, over
`OrchestrationErrorCode = BatonErrorCode | PijErrorCode` — which no amount of reading the send path
would have surfaced. The compiler found it in seconds.
*Cost*: one out-of-fence file in the diff (four lines, commented), which had to be reviewed
deliberately rather than trusted.
*The transferable rule*: **a fence derived by reading is a hypothesis; only the compiler or the
test run can confirm it.** For a co-owned file this matters more than usual, because the cost of
being wrong is another stream's merge conflict. A `pij fleet` verb that declares ownership (S-002)
should verify the declaration by building, not by matching paths.

### S-204 · RED-before-fix is unfalsifiable when it lands in one commit
This stream required the coder to run every behavioural criterion against pre-fix code and paste
the **verbatim** failure into the execution log. It did, and the evidence is good. The cross-model
reviewer still made the sharpest observation of the run:

> *"Its chronology cannot be independently established from a single commit containing the tests,
> implementation, and log, so I do not treat that historic ordering as independently proven."*

That is correct and it applies to **every** stream in this wave. A pasted RED block proves a failure
was *observed*; it does not prove it was observed *before* the fix existed, because the artifact
that records the ordering is written by the same agent, in the same commit, as the thing it
vouches for.
*Suggestion*: require **two commits** — failing tests alone, then the implementation. Git then
carries the ordering as a fact anyone can check with `git show <test-commit> && npx vitest run`,
and the claim stops depending on the author's honesty. Adopted mid-run here after the review.
*Cost of not doing it*: the discipline still works, but its evidence is a **self-report**, which is
the same category of proof this wave keeps filing issues about.
