# Stream `s096` — watchdog-verdicts — ledger

Rows from stream `s096`. **This file has a single writer.** See [`../ledger.md`](../ledger.md) for the index and the convention.

## Difficulties

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

## Wins

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

## Suggestions

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
