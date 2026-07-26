# PM ledger — stream s073, plan 073

PM: pij-exclusive-whitefish · o-prime: pij-reasonable-dove · consumer: pij-cheap-cheetah (chainglass)

## Stream

| | |
|---|---|
| project | `p073-pij-first-class-ui` (planPath `docs/plans/073-pij-first-class-ui/`) |
| allocation | `alloc-s073-pij-first-class-ui`, ordinal 73, all three steps ok |
| worktree / branch | `pij-worktrees/s073-pij-first-class-ui` / `s073/pij-first-class-ui` |
| base | `c4b6fb5` |
| fence | `fence-alloc-s073-pij-first-class-ui`, notify-only; `cli.ts` + `types.ts` declared shared |

## Roster

| seat | id | model | canary |
|---|---|---|---|
| coder | `pij-sacred-pony` | copilot `gpt-5.6-sol` xhigh | **PASS** — model matched via pane-footer, `pane:%2757 pid:57095 native:1e544d20…` |
| reviewer | `pij-managing-prawn` | copilot `gpt-5.6-sol` xhigh, cold seat | **PASS** — model matched via pane-footer, `pane:%2778 pid:81681 native:741e2a92…` |

Assignments: `asg-ugliest-coral` (coder), `asg-diplomatic-caribou` (reviewer). Reviewer acquired at
the moment of first review, never a phase early. Both compacted on their terminal report/verdict,
before their output was read.

## Item 1 — APPROVED for merge (round 3). NOT verified.

**Verdict**: `APPROVE` from `pij-managing-prawn`, round 3, at HEAD `9013dfb` with implementation
pinned to `54bbaa0`. Three rounds: FIX_REQUIRED → FIX_REQUIRED → APPROVE.

**Reviewer evidence** (independently re-run, not cited from the coder's report):
- Global caller-drop mutation → failed **only** the named receipt test, emptied **all 8** cells
- Daemon-only warnings drop → failed **only** that test, emptied **only the 4 daemon** cells while
  all 4 pi cells stayed correct — proving the guard discriminates **per path**, not in aggregate
- Every prior control independently flipped exactly one owning guard: write law, 3 projection
  fan-outs, 2 env builders, spawn + attest empty-value, not-checked warning, parser and dispatcher
  no-field, 151/150 skill budget
- `harness checks`: **all 8 sensors green**, including lint and windows-compat (blocker cleared by
  `3f881cb` / `004b23d`, inherited via sync `54bbaa0`)
- Restored baselines green; worktree clean

**PM sanity pass** (mine, on top of the verdict — not a substitute for it): read the guard itself.
It drives real `pij spawn` through the CLI across 2 harnesses × 2 plan-id cases × 2 output formats,
aggregating all 8 receipts into **one structural `toEqual`** — which is precisely why a single-path
drop fails it. And its name is a **true claim**: every clause it states is actually asserted (F9a).

### NOT VERIFIED — the item is NOT closed

**MERGED IS ADOPTED, NOT VERIFIED.** Still owed, dove-owned, and strictly post-merge:

> A **live spawn** on **both** paths (pi and one external) proving the child receives
> `HARNESS_PLAN_ID` **and** `PIJ_PLAN_ID`, and that `planId` lands on the descriptor — after dove
> restarts the daemon from canonical main.

No approval here implies that happened. Everything that fooled this fleet on 2026-07-26 was green
at exactly the merge stage.

## THE LAW OF THIS STREAM — the parts are fine and the connection is unproven

**dove's synthesis, and it subsumes most of the findings below.** F11 is not a fourth finding. It
is **the same defect at a fourth scale**, and item 1 has now produced that defect at *every scale
it has*.

| scale | the two things | the join |
|---|---|---|
| **two repos** | harness honours `$HARNESS_PLAN_ID`; pij never set it | absent — **this is why item 1 exists at all** |
| **two tools** | `.gitignore` vs `biome.json` includes · `tsconfig` excludes tests vs vitest runs them | nothing keeps the lists in agreement (F8) |
| **two files** | help text in `cli.ts` vs its assertion in `cli.integration.test.ts` | unasserted — main went red (F5) |
| **two functions** | `buildPlanIdWarning` produces it; the receipt renders a supplied warning | nothing proves the caller carries one to the other (F11) |
| **two paths** | pi vs daemon-bound spawn | the original item-1 defect, and nearly the guard against it |

**One disease: the parts are fine and the connection is unproven.** And it is invisible at every
scale for the same reason — **each end has an owner and a test; the join has neither.**

### The standing question — cheaper than any individual lesson

> **What two things must now agree, and what asserts that they do?**

**"Both are tested" is not an answer.** That is precisely the state F11 describes.

Ask it on every change. It costs one sentence and it is the only question in this ledger that
would have caught all five instances.

### And the guard needs the same test as any other

A **seam guard that cannot be made to fail is a seam guard in name only** — which would be the
fifth instance of the same disease, inside the fix for the fourth. Hence the acceptance criterion
for the round-2 guard, which is F9a applied to a seam: **the new test must go RED under the
reviewer's own drop mutation**, or it is a second test that proves nothing.

### The repair hierarchy — dove escalated past what item 11 proposes

`004b23d` on main is the F8 lesson applied **structurally**, and it is a level above the repair
this ledger had been arguing for. Three ways to handle "two things must agree":

| level | repair | verdict |
|---|---|---|
| 1 | **document** the agreement | rots — serves the next reader, not the editor. This is what item 11 was asked for and refused. |
| 2 | **assert** the agreement (a gate that fires on drift) | good — this is what item 11 builds |
| 3 | **eliminate** the second thing, derive it from the first | **best — there is nothing left to disagree** |

`3f881cb` fixed the symptom by adding `.pi-subagents` and `.serena` to biome's excludes — which
left two independent lists. `004b23d` then derived biome's ignores **from `.gitignore`**, so the
join cannot drift because the join no longer exists.

**So the standing question has a preferred answer.** When asking *"what two things must now agree,
and what asserts that they do?"*, the strongest response is not a better assertion — it is
**"they no longer need to agree, because one is derived from the other."** Reach for level 3 when
derivation is possible; fall back to level 2 when it is not. Never level 1.

## Findings — the tooling substrate

### F1. flow-pair is **not exposed to claude seats**; it is **not** missing (corrected)

My first report said "not installed on this machine". **That was wrong and would have sent a
fixer to install something already present.** Verified:

- `~/.copilot/skills/flow-pair` → `~/pi-hacking/pij/skills/flow-pair` — **exists** (copilot only)
- `~/.claude/skills/flow-pair` and `~/.agents/skills/flow-pair` — **do not exist**
- `~/.claude-alt/skills` is a symlink to `~/.claude/skills`, so a claude seat checking its own
  skills dir correctly finds nothing
- CLI is on PATH: `~/.npm-global/bin/flow-pair`, `readlink -f` →
  `/Users/jordanknight/pi-hacking/pij/skills/flow-pair/lib/cli.ts` — i.e. it resolves into the
  **canonical checkout**, consistent with the documented source-provenance invariant

**Accurate statement**: *the flow-pair skill is exposed to copilot seats only; the CLI is on PATH
and resolves into the canonical checkout.* The gap is an exposure gap, not an install gap.

### F2. Why we still hand-orchestrate the review — and the precise defect shape

Not a degraded fallback. The `flow-pair` CLI's `review` verb is an artifact-contract gate that
**never reads the diff**, so any verdict it emits is not a code review.

**Correction to the reported shape, which I verified in `skills/flow-pair/lib/review.ts`:** the
CLI does **not** fabricate `APPROVE` out of nothing. There *is* a zero-findings guard
(`review.ts:219`) that refuses outright: *"a verdict cannot be minted from zero reviewer input."*
The route doc's description is the accurate one on that point.

The real hole is **narrower and easier to walk into**: `determineVerdict` (`review.ts:140-148`)
returns `FIX_REQUIRED` for critical/high, `APPROVE_WITH_NOTES` for medium, and a bare
**`APPROVE` for anything else — including a findings list that is entirely `low`**. The guard
only covers the *empty* list. So a reviewer who files three low-severity nits gets a
**CLI-computed `APPROVE` that no reviewer ever uttered**, on a diff nothing read. The file's own
comments (`review.ts:217-218`) name this hazard — "a real reviewer's FIX_REQUIRED was shadowed by
a default APPROVE".

**The tool is honest; the risk is entirely caller-side.** `flow-pair --help` says it outright:
*"review — Emit verdict from supplied findings (**contract gate — not a code review**)"*
(`skills/flow-pair/lib/cli.ts:46`), and `review.ts:219`'s refusal carries the verdict-law comment.
**Nothing in flow-pair reads code. Nothing in it reviews.** The verdict verb does exactly what it
advertises. The failure mode is a *caller* mistaking a contract gate for a reviewer — which is
precisely what the pair route exists to prevent.

So: **hand-recording the verdict is not a workaround for a broken tool — it is supplying the input
the tool is designed to consume.** The engine cannot be the reviewer, by construction. We accept
the ledger and prompt-learning loss; we do not accept a verdict nothing read the diff to produce.

### F4. Standing check — look for the guard before proposing one

Twice on 2026-07-26 this fleet was one step from building a guard that already existed, from
opposite directions: the archived tier, and the "refuses to mint from zero findings" case (the
guard is there — the uncovered path is the adjacent all-`low` fall-through). Both times the real
defect sat *next to* the existing guard, not in place of it.

**Before proposing a guard: check whether it exists, then check the path immediately adjacent to
it.** A gap beside a working guard reads exactly like a missing guard, and a fix aimed at the
wrong one lands on code that is already correct while the real hole stays open.

### F3. Control integrity — no self-review, ever

If the reviewer cannot be brought to `bound` after one heal attempt, this stream **HALTS** with a
named error surfaced to a human. It does **not** fall through to the orchestrator reviewing the
coder's work. The orchestrator sanity pass is a spot-check *on top of* an independent verdict,
never a substitute for one — with no reviewer peer there is **no verdict**.

Dove reports this same degradation is an open control-integrity bug in flow-pair's lazy-spawn
reviewer path. Hold the line under time pressure.

## Proof method — per file, in isolation (SUPERSEDES the pin below)

> **The pin of 3 recorded below is RETRACTED as a decision procedure.** It is kept because the
> D-035 characterisation in it is still true and because the retraction is the lesson.

**The full-suite red set on this box is a random variable.** Two back-to-back runs from the repo
root with `b05eba9` applied: **run A = 4 failed / 3 files, run B = 8 failed / 5 files.** The extra
files were `worktree.test.ts` (2), `core/cli.test.ts` (1), `harness/scripts/packages-bootstrap.test.ts`
(1), `skills/flow-pair/test/cli-observe.test.ts` (1). All four run in isolation on a clean tree:
**7 passed, 298 passed, 2 passed, 3 passed** — every one green alone. At least seven different
tests across five files have appeared so far, and *which* ones appear changes run to run.

So **"only my guard flipped, known-red set unchanged" is not decidable here.** Against a pin of 3
a coder either sees extra reds and wrongly concludes something landed underneath them, or — the
dangerous one — sees their injected regression sitting among four unexplained reds and files it as
noise.

**The method, binding on this stream:**

1. Prove **per file, in isolation**. Never against the full suite. Isolated runs *are*
   deterministic here — the four greens above establish it.
2. An injection proof is: **run that file alone → baseline green → inject → confirm exactly ONE
   test flips → restore → confirm green.** Decidable, cheap, load-independent.
3. Full-suite runs are **merge-time only**, and any failure in one is a **candidate for
   isolation-checking, never a fact**.

### The variable red set — CLOSED. My mechanism was wrong.

**Fixed on main: `646868f`.** I proposed the cause was parallelism contending on shared resources
(PIJ_HOME sandboxes, ports, the daemon). **That was wrong, and the disproof is clean.**

Discriminating experiment (dove): raise **only** `testTimeout`, change nothing else →
**198 files, 3610 tests, ZERO failures.** Contention is not cured by a longer clock. Nothing was
corrupting anything. It was a **budget**: `vitest.config.ts` carried a global `testTimeout` of
5000 against ~16 parallel workers on a box that also runs the fleet, so tests lost a wall-clock
race and *which* ones lost varied with scheduling. That is the entire variable red set.

Now 30s — verified myself at `vitest.config.ts:79` on `646868f`. It costs nothing, because a
healthy test never approaches the ceiling: 95.9s vs 98.1s wall-clock, and the post-commit
verification run came in at 77.9s. 30s still catches a genuine hang. **D-035 is closed, not
documented-around.**

**And the file already knew.** The adjacent `PIJ_TEST_NO_FSYNC` comment records *"18 fsync sites ×
16 parallel workers on one disk starved boot-path tests into 20s+ timeouts"* — same cause, same
file, mitigated once for fsync and left standing for everything else. **F4 again**: the gap beside
the guard.

### F6. The baseline is a measurement too

We applied isolation rigour to the *suspicious* failure (D-035) and not to the *reference* that
framed it — because a baseline feels like ground truth rather than an observation. It is an
observation, taken under conditions, with the same failure modes as any other. **A reference
measured under varying conditions is a signal that lies**, and it lies in the worst direction:
it launders a real regression as expected noise.

**Corollary, demonstrated the hard way an hour later: when a reference is unstable, do not build a
procedure to tolerate it — FIX THE REFERENCE.** I was one message away from teaching a coder a
per-file discipline to work around a broken baseline. The baseline was a one-line config bug. The
per-file discipline is still right on its own merits and it is what made the diagnosis possible —
but it was being asked to carry a load it should never have had to.

Completes the set. F4: look beside the guard you are adding. F5: look for guards others wrote
against the surface you are changing. **F6: hold your reference to the same standard as your
subject — and when it fails that standard, repair it rather than routing around it.**

## Retracted pin — the reported red set at `c4b6fb5`

**Superseded by the section above. Not a valid baseline.** The D-035 characterisation stands; the
count does not.

| # | test | class |
|---|---|---|
| 1 | `cli.integration.test.ts` › *top-level help advertises the prime list filter* | **deterministic** |
| 2 | `daemon-push.test.ts` › *pushes a stalled notice to the creator when a bound session is working+stale* (T011/T012) | load-sensitive |
| 3 | `daemon-push.test.ts` › *does NOT push for a non-stalled session (working with fresh events)* | load-sensitive |

- **#1 is `afdb839`'s fallout, not ours.** Fails alone. Help emits
  `pij list [--here] [--prime] [--archived] [--badge] [--json]` (`core/cli.ts:282`) while the
  assertion still expects the substring without `[--badge]`.
- **#2 and #3 are D-035, confirmed rather than assumed.** The whole `daemon-push.test.ts` file
  passes in isolation (19 passed, 2 skipped) including both; they fail only under full-suite
  contention against the 5s subprocess budget. Characterised, not defective.

### F5. Injection proves your guard, not everyone else's

`afdb839` ran the injection discipline correctly and still shipped main red. Injection proves the
guard **you wrote** is load-bearing; it says nothing about a guard **someone else wrote against a
surface you changed**. `afdb839` touched `cli.test.ts`; the stale assertion lives in
`cli.integration.test.ts` — a file the change never opened. Help text is a shared contract surface
with assertions scattered across files, and `tsconfig`'s `**/*.test.ts` exclusion (task #12) means
nothing type-level was ever going to catch a stale string assertion either.

Companion to F4. F4: *look beside the guard you are adding.* F5: *look for guards others wrote
against the surface you are changing.*

## Queued behind item 1 — items 10 and 11 (from cheetah's brief addendum)

**HOLD: nobody touches `core/cli.ts` until `pij-sacred-pony`'s work is committed and synced.**
Currently trivially satisfied — the coder is the only seat in that file and there is no second
coder on this stream. Standing until item 1 lands.

### Item 10 — `node show` also emits `folder`

Verified independently: `node show` emits `cwd: d.folder` (`core/cli.ts:4118`); `list` emits
`folder: d.folder` (`:1984`, `:2042`). Same value, two names, so a UI joining list rows to node
show cards must know the rename.

Fix: `node show` **also** emits `folder`. **`cwd` stays as a permanent alias — not deprecated.**
A named consumer already ships against it and breaking them for tidiness is a bad trade. Additive,
one line plus a projection test. Rides with whatever coder is next in `cli.ts`.

### Item 11 — the projection contract as a PINNED table, not a document

Three projection inconsistencies surfaced on one store in one day — `currentTask` absent from
`list`, `badge` absent from `list`, `folder`-vs-`cwd` — and none was visible from
`pij-platform.md`.

cheetah asked for a hand-maintained per-verb emitted-field table. **Dove ruled harder, and
correctly:** a hand-maintained table is exactly what the maintenance-incentive law says will rot.
It serves the *next reader*, not the person editing the projection, so whoever adds a key will not
update it — and **a stale contract table is worse than none, because it reads as authoritative.**

Build it as a **gate**: a test asserting each verb's actually-emitted key set against the
documented set, failing when a projection gains or loses a key without the contract being updated.
Same move as the badge call-count control. **Find the observable that changes when the rule is
broken and assert it; never write a comment asking people to be careful.**

It will likely fail on first run. **That is the point** — it will report what the surface actually
emits, which nobody currently knows.

**REQUIRED — the repair instruction goes in the FAILURE MESSAGE, not in this ledger.** I raised
that item 2 will break the table and that a coder meeting the red gate would reach for the wrong
repair (loosening it to a subset/`contains` check, which converts the gate back into
documentation). Dove supplied the structural half, and it follows from my own sentence — *"the
person who hits it will not be the person who read your ruling"*: **so do not leave the repair
somewhere they will not open.** The assertion's own output must say, at the moment it fires:

> a projection gained or lost a key. The repair is to update the contract table **in this commit**,
> alongside the key you added. Do **NOT** relax this assertion to a subset/contains check — that
> converts the gate back into documentation and is the exact failure it exists to prevent.

**If a rule depends on someone having read something elsewhere, it is a comment asking people to be
careful.** Encode it where it will actually be read — and for a failing test, that is the failure
output. This is the same move as the badge call-count control, the `testTimeout` fix, and F6's
corollary, applied to itself.

**Sequencing, and the sharper form of it:** item 1 adds `planId` to all three projections; item 2
adds `designation` to the same three. The table is built after item 1, and **item 2 breaking it is
the FIRST EVIDENCE the gate works.**

> **A gate that never fires is indistinguishable from one that is broken.**

So the inversion is the thing to watch: **if item 2 lands and the table does NOT go red, that is
the bug to chase** — not a relief.

### F7. A fence is amended, not forecast

The fence was extended three times as the change discovered its own surface: first the four core
files, then `session.ts` / `tree.ts` / `cli.ts` / `index.ts`, then `index.test.ts` /
`docs/how/pij.md`. Every extension recorded, every one with **zero overlap** against another
stream.

I logged that as my failure — declaring an accurate touch set up front is something I should be
able to do. **Dove pushed back and is right:** it is not reliably possible. A change discovers its
surface as it goes.

The failure mode a fence exists to prevent is **a seat reaching silently past its declaration**.
Amending and recording is the opposite of that — it is the mechanism working. And the tempting
over-correction is actively worse: **over-declaring up front to avoid amendments blocks other
streams for files nobody touches, and teaches everyone that fences are noise.** A fence that claims
too much gets ignored, and an ignored fence protects nothing.

Keep amending. Keep recording.

### F8. Two tools, two independent lists, nothing keeping them in agreement

Lint on main fixed at `3f881cb`. **There were FOUR format errors, not the two I reported** —
clearing the first pair revealed two more in `.pi-subagents/artifacts/*.json` that biome had been
reporting all along behind them. I read a partial observation as the whole population, the same
measurement error as the retracted pin, twice in one day in two different tools.

The second pair is the instructive one: that directory is a **tool cache**, gitignored earlier the
same day (`1b97738`) and never added to `biome.json` excludes. **`.gitignore` and biome's
`files.includes` are independent lists with nothing keeping them in agreement**, so the cache was
invisible to git and fully visible to the linter — every cache write would have re-reddened main
forever.

The shape arrived from both ends at once:

- **Mine**: a file **nobody owns** failing a gate **everybody shares**.
- **Dove's**: a directory excluded from **one tool's view and not another's**.

| instance | tool A | tool B |
|---|---|---|
| `.pi-subagents` cache | git ignores it | biome lints it |
| test files | `tsconfig` excludes them | vitest runs them |
| `--badge` | help text advertises it | the assertion in another file did not know |

**Wherever two tools keep separate lists describing "the same" set, they drift, and the drift is
invisible from inside either one.** Repair is item 11's repair: do not document the agreement,
assert it.

### F9. Injection proves the assertion, not the name

Round-1 review returned **FIX_REQUIRED** on a diff carrying **22 valid injection proofs**. The
sharpest finding (F2) was an empty `--plan-id` being accepted, persisted, and *silently validating*
— because `buildPlanIdWarning` resolves `docs/plans/<id>` and `""` resolves to `docs/plans` itself,
which exists.

A test named *"parses one explicit opaque plan id and **rejects an empty attestation**"*
(`core/cli.test.ts:1996`) sat right beside it — asserting only that a **missing** value is
rejected. It never tested `--plan-id=`.

**Every injection proof the coder ran was valid.** Injection proves a guard is load-bearing **for
the assertion it actually makes**, not for the claim in its name. A test whose name over-claims is
*invisible to the method*: it flips red exactly as designed, for the narrower thing it really
checks. So the method has a blind spot, and the blind spot is naming.

**A test name is a claim and must be as true as its assertion.** This is why an independent
reviewer is not optional — no amount of self-run injection would have surfaced it, because the
coder who wrote the name believed it.

### F9a. Derive the injection from the NAME, not the body — F9 made executable

F9 as I first wrote it was a **warning**: here is a blind spot, be careful. That is precisely the
species of advice this stream has spent the day proving useless. Dove turned it into a procedure
with an observable:

> **Derive the injection from the test's NAME, not from its body.**

If the name says *"rejects an empty attestation"*, inject **an empty attestation** — not whatever
the body happens to exercise. **If the guard does not flip, the name is a lie** — and you found the
gap without reading the assertion at all. It costs nothing, because you are already injecting.

Same move as the pinned projection table and the call-count control: **do not ask people to be
careful; find the observable that changes when the rule is broken.** This single procedure would
have caught F2 in the coder's original pass.

Standing procedure for every guard touched, including ones not being changed.

### F10. Silence reads as validated — absent must be distinguishable from null

I widened F2 from "empty is accepted" to "the probe treats an opaque id as a path segment", and
then walked straight past the fact that **my own fix would have re-created the defect more
quietly**. Dove caught it.

`buildPlanIdWarning` returns `null` for *"resolved fine"* **and** `null` for *"nothing to say"*. The
moment traversal-shaped ids stop being probed, **unprobed renders as silence, and silence reads as
validated.** We would have shipped F2 with better manners.

Three outcomes, not two:

| outcome | behaviour |
|---|---|
| resolved | silent, continue |
| did-not-resolve | **warn**, continue |
| **not probeable** | **say so explicitly**, continue |

**This is the same defect as the `badge` key** — absent must be distinguishable from null — which I
had cited twice the same day and still did not see coming when it arrived wearing my own fix.

**On the hard-fail boundary** (dove's words, kept verbatim because they stop this being
re-litigated): the never-hard-fail ruling governs an identifier we cannot **resolve** — a real id
in a repo without the convention. *"An empty string is not an unresolvable identifier, it is the
ABSENCE of one. Rejecting it is not a resolution policy, it is argument validation."* `E-ARG` at
parse time, after trimming — `"   "` is the same non-identifier in disguise.

### F11. Both ends proven, the join unproven

Round 2 closed F1–F3 with injection evidence and found one new gap: **the warning-to-receipt seam
has no discriminating guard.**

The behaviour is correct — `cli.ts:1922` does carry `buildPlanIdWarning`'s result into the receipt.
But mutating the real caller to drop every non-null warning left **`just typecheck` green and
`cli.integration.test.ts` green at 73 passed**. The pure helper test proves the string is produced;
a generic renderer test proves a supplied warning is rendered; **nothing proves those two are
connected.**

| proven | not proven |
|---|---|
| helper returns the right string | the caller passes it on |
| renderer renders a supplied warning | ...that these two are joined |

**Unit-tested + unit-tested ≠ seam-tested.** Two guards can both be load-bearing and still leave
the composition between them undefended — and the composition is where the ruled behaviour
actually lives.

This is the sharpest instance yet of the day's theme, because it is *self-referential*: the
three-outcome probe was built specifically to stop **silence reading as validated**, and it was
itself installed behind an unguarded seam where dropping it would be **silent**. The defect the fix
was designed to prevent applied to the fix.

**And the state is the dangerous one from F9/F10: it does not look broken, it looks finished.**
Every gate green, behaviour correct today, one refactor away from silently reverting.

Companion to F9a: name-derived injection catches an over-claiming *name*; seam guards catch an
unclaimed *join*. Neither finds the other.

## Standing rulings carried into this stream

- **Merged is ADOPTED, not VERIFIED.** No item is reported shipped off a merge. Everything that
  fooled this fleet on 2026-07-26 was green at exactly the merge stage.
- `planId` owner `cli`, **not** append-only. Discriminating control = a **second** write by a
  non-owner over an existing value; set-then-read proves nothing.
- `planId` independent of `Project.planPath`, opaque, never derived; disagreement is not an error.
- Resolution outcome is **emitted in the spawn receipt, never stored** on the descriptor.
- `--plan-id` dropped from `dispatch`. Two writers: `spawn` creates, `attest` corrects.
- One verb: `pij attest`. `--designation` lands with item 2 as a pure addition (Jordan sequences).
