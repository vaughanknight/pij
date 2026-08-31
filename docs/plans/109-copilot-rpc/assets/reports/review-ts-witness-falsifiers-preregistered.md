# Reviewer falsifiers — u-ts-witness (plan 109), PRE-REGISTERED

Written 2026-08-31T03:5xZ, before opening
`docs/plans/109-copilot-rpc/assets/reports/done-u-ts-witness.md` or any test file
in the diff.

## Disclosure: my pre-registration is PARTIALLY CONTAMINATED, and I am saying so first

The dispatch message **summarised the receipt's claims at me** before I could
register anything: the ten-failure causal trace, "expectations unchanged", the
added Rust Pi/OMP witnesses, "5 files, 42 tests passed", and the fence around
integration. I could not un-read them.

So this is **not** a clean pre-registration. What it still is: written before I
opened the receipt itself, before I read a single line of the changed tests, and
before I ran anything. The falsifiers below are aimed **at those very claims**,
which is the honest use of a contaminated start — I cannot pretend the claims did
not reach me, so I will treat each one as a hypothesis to break rather than as
context.

What I had read: the dispatch, `git log --oneline`, and `git show --stat
d552564f`. Nothing else.

## The shape of this unit, and why it is the highest-risk kind

**Its entire product is test changes.** `git show --stat d552564f`:

```
.pi/extensions/pij/index.test.ts             | 86 ++++++++++++++++--
docs/…/reports/done-u-ts-witness.md          | 44 +++++++++
skills/flow-pair/test/cli-learning.test.ts   |  1 -
skills/flow-pair/test/observe.test.ts        | 21 +++++-
```

Every line either makes a red test green or adds a new green one. **There is no
product code in this diff to blame or to credit.** The single question this review
must answer, per assertion:

> Did the expectation change because the ruled behaviour changed — or did the
> assertion stop being able to notice a defect?

Those two look identical in a diff and identical in a green suite. Distinguishing
them is the whole job.

---

## Class A — the assertion that stopped noticing

**TF1 — a weakened comparison.** Falsifier: any assertion whose operator got
looser — `toBe` → `toContain`/`toMatch`, exact object → `objectContaining`, a
concrete value → `expect.any`, a length check → a truthiness check, `===` → regex,
or an added optional chain that turns a would-be throw into `undefined`.
**Severity: high.** "Expectations unchanged" is a claim about *values*; a weakened
*comparison* keeps the value and drops the check.

**TF2 — a deleted assertion.** `cli-learning.test.ts` shows **`1 -`, a single
deleted line and nothing added.** That is the highest-value line in the diff and I
will look at it before anything else. Falsifier: the deleted line was an `expect`,
or anything whose absence means a condition is no longer checked.
**Severity: high.**

**TF3 — noise tolerance that also tolerates signal.** The dispatch says
assertions now "tolerate npm stderr noise". Falsifier: the new matcher would also
pass on a **genuine failure message** — an npm error, a non-zero exit, a stack
trace. The test to run is not "does it still pass"; it is **"what can it no longer
fail on"**. I will construct the tolerated-but-wrong input and check.
**Severity: high.**

**TF4 — a swallowed teardown.** "Transient ENOTEMPTY teardown races". Falsifier:
the handling cannot distinguish a *transient* ENOTEMPTY from a *persistent* one,
so a genuinely broken teardown now passes. Ask AGENTS.md's own question —
**what does REMOVING the tolerance do?** If removing it makes the test *stricter*,
the tolerance is a policy that inherits whatever it is wrong about; a brake would
only ever refuse more. **Severity: medium–high**, high if the swallow is unbounded
(catch-all, empty catch, retry-forever).

## Class B — the causal claim

**TF5 — the ten failures are ATTRIBUTED, not demonstrated.** The claim is that
they trace to ruled `acb1399a` (default-rs selection) and `c048ebc2` (Rust
display/in-memory state). Falsifier: the receipt asserts the trace without a
discriminator. **Repetition cannot establish causation and neither can a
plausible story.** The available discriminator is a mutation: revert or disable
the ruled selection and check the ten failures return **with the same signature**.
Same signature ⇒ the attribution holds; a *different* failure ⇒ the attribution is
wrong and something else is also broken. **Severity: high** — this attribution is
what licenses every expectation change in the diff.

**TF6 — "ten" is a number I must verify myself.** Falsifier: the count at the
parent commit is not ten, or the ten are not the ones the diff addresses. A number
in a receipt is a claim; I will re-derive it at the parent and compare the *set*,
not the count.

## Class C — the fence

**TF7 — a fence drawn after seeing what fails.** "Integration remains red outside
this fence" names generated-fixture lint/windows drift and ENOTEMPTY teardowns in
`git-repository.test.ts` and `core/chores/drive.test.ts`. Falsifier: the fence was
defined by *which tests were failing* rather than by a scope ruled in advance.
**A boundary that exactly circumscribes the failures it excuses is a
rationalisation, not a scope.** I will check whether the packet
(`a0068d1e`, "u-ts-witness packet for release prep") drew this boundary **before**
the run. Severity: **high** if drawn after; **none** if the packet drew it first —
and that is exactly the kind of thing the packet exists to settle.

**TF8 — the fenced failures are the same class as the fixed ones.** ENOTEMPTY
appears on **both** sides of the fence — tolerated inside it, excused outside it.
Falsifier: the same root cause is called "handled" in one file and "out of scope"
in another. If it is one bug, the fence runs through the middle of it.
**Severity: high.**

## Class D — the runner

**TF9 — "5 files, 42 tests passed" is a FILTERED run.** Habit 7, and this plan's
own history: *a runner that filtered for stage lines summarised a hard `--locked`
failure as `OK — 5s`*, and **"no output" and "no problems" are the same string to
a summary line.** Falsifier: the filter's selector, run at this head, matches a
different set than claimed, or the unfiltered file-level run reports a different
number. I will run the changed files **unfiltered, redirected to a file, exit code
taken from the runner itself**, and report my own count beside the command.
**Severity: medium**, high if the numbers disagree.

**TF10 — a new test that is green from birth.** The dispatch says deterministic
Rust Pi and OMP status witnesses were added. Falsifier: neither has been
demonstrated capable of failing. **A regression test green from birth is a claim,
not a witness** — the plan's standing rule, and it applies to a test-only unit
with double force. I will mutate the behaviour each new test claims to cover and
require a red with the signature that test was written for.
**Severity: high.**

**TF11 — "deterministic" asserted rather than shown.** Falsifier: the new
witnesses depend on wall-clock, ordering, a real filesystem race, or a
timeout-as-negative. Note `56914a0a` in this branch's own log: *"a negative
asserted by a timeout passes because the timeout elapsed."* If the new tests
contain that shape, it was deferred once already on this plan and must not arrive
here unremarked. **Severity: medium–high.**

## Class E — scope and honesty

**TF12 — product code changed under cover of a test unit.** Falsifier: anything
outside a test file or the receipt in `git show --stat`. Currently clean: the four
paths are two test files, one test file, and the receipt. Recorded so a later
commit cannot quietly widen it.

**TF13 — the receipt claims an observation nobody made.** Falsifier: any pass/fail
count, verdict, or "passed" without the command that produced it, or with output
truncated so the verdict survives and the evidence does not.

**TF14 — `harness checks` claims.** The dispatch says it was "run unfiltered from
the invocation itself" with several sensors passing. Falsifier: the sensor list
reported does not match what that command emits, or a sensor is reported PASS that
the known linked-worktree limitation makes unrunnable. This plan has already
disclosed that `harness checks` cannot run in these worktrees; **a green from an
unrunnable sensor is worse than an absent one.**

## Class F — my own conduct

**TF15.** I do not move HEAD in the coder's worktree. All probes run in my own
worktree, every mutation reverted and stated. **Every red I produce is reported,
including my own errors** — nine disclosed on unit 1, none reaching a verdict, and
three of those nine were `EXIT != 0` meaning something other than "the test
failed". So: **every result quoted with its command, its exit code, AND the
failure line that distinguishes a compile error from an assertion.**

**TF16 — ask what would distinguish the two states before trusting an instrument.**
For a test-only unit the two states are *"the expectation was wrong"* and *"the
assertion went blind"*. Before believing any check of mine, I state what it prints
in both worlds.

---

## Verdict rule, fixed in advance

**APPROVE** only if, for **every** changed assertion, I can name which of the two
worlds it is in and show the observation that decides it — and if TF2, TF5 and
TF10 are each answered by a red I produced, not by a green anyone reports.
