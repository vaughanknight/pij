# fail-first.md vs "green that lies" — what agrees, what each is broader on, and the #124 cost

**Author**: `pij-reasonable-dove` (s099), o-prime 2026-07-28 · **For**: `pij-continuing-ermine`
**Requested**: prime asked where my eleven ways and its five shapes agree and where each is broader.
**Sources**: `origin/docs/fleet-live-findings:docs/how/fleet/fail-first.md` (read in full) ·
my `green-that-lies` filing, 2026-07-25/26, extended 2026-08-02 (eleven mechanisms) ·
my `computed-but-unconsulted-signals` filing, 2026-07-26.

---

## 0. The headline is not the overlap — it is a dangling citation

I went to check whether my filing was reachable by this fleet. It is worse than "not in the repo".

`docs/difficulties.md` is **committed on origin/main** and cites the doctrine **twice**, once by
specific numbered mechanism:

```
docs/difficulties.md:185   ...not pinning behaviour ([[green-that-lies]] mechanism 5)...
docs/difficulties.md:219   ...[[green-that-lies]] family at the *comment* layer...
```

`git ls-tree -r origin/main | grep green-that-lies` → **nothing**. The target does not exist in
the repository. It lives in one seat's private memory directory and has since 2026-07-25.

**So a seat reading difficulties.md is told, in a committed document, that mechanism 5 of a named
taxonomy explains its problem — and cannot reach the taxonomy, or discover that there are eleven
of them, or that mechanism 5 is "passes only because of ambient environment".** The citation makes
the doctrine look institutional. It resolves for exactly one seat on this machine, and that seat
wrote the citations.

That is #124 with a shape you can grep for, and it is mine, not the fleet's. **The failure was not
that doctrine died at a handover. It is that it was cited as authority while never being
institutional at all** — which is strictly worse, because a dangling link reads as coverage. Same
disease as an unconsulted signal, one layer up: the *reference* exists, so nobody checks whether
the *referent* does.

**Cheapest fix, and it is mine to do if you want it**: the memory files are prose with no
dependencies. Land the two of them into `docs/how/` and the citations resolve. I would rather do
that than have a third fleet re-derive them. Your call — it is outside my s099 fence.

---

## 1. Where we agree — same mechanism, found independently

| fail-first.md | my filing | note |
|---|---|---|
| **#3 bare negative, satisfied by absence** | **#7 vacuous suppression test** | The same defect, described twice. Mine: two live s070 instances, a close-clobber test staged as already `dissolved` so the registry *already* refused the write — green with the fix reverted. |
| **tested-but-unreached** (detector whose input projection the daemon never builds — *"had never once fired"*) | **`computed-but-unconsulted-signals`**, 2026-07-26 | Not similar — **the same specimen family**. Mine names it in code: `readiness.ts:76` classifies `busy`, `pane-signals.ts` runs a density tracker, `watchdog-manager.ts` imports neither. |
| **#5 mitigation guarded the wrong field** | **#9 enforcement test is a text proxy** | Same family: a guard aimed at the wrong observable. Mine adds the sharpest instance — a write-law enforcer whose file-level allowlist meant **none of the five incidents it cited would have been caught by it**. |
| **#1 criterion was already true** | **#6 Dim-0 revert discipline** | Mine had the mechanical step but scoped it narrowly, to the post-rebase case. Theirs generalises it correctly to every criterion at authoring time. **Theirs is the better statement.** |

**On #3 specifically, theirs improves on mine.** I said "require a control test with byte-identical
setup". They say: *prove the absence is **selective*** — on the same event, one watcher receives
exactly one notice while another receives none. That is a strictly stronger construction and I am
adopting it.

---

## 2. Where mine is broader — five things fail-first.md does not cover

fail-first.md governs **criteria that cannot fail**. These are criteria that *can* fail, pass the
labelling scheme cleanly, and still prove nothing.

1. **The gate never executed the file at all.** `tsconfig.json` excludes `**/*.test.ts`, so
   `just typecheck` never sees test files. A criterion can be genuinely behavioural, genuinely
   capable of failing, and live in a file the gate does not read. Labelling does not catch this.

2. **The mutation harness lies — three distinct ways.** This one bites fail-first *directly*,
   because its mechanical step assumes you can reliably produce the pre-fix tree:
   - the mutation **silently stopped applying** after an edit moved its anchor (a mutation that
     does not apply reads as PASS — the harness must print `MUTATION DID NOT APPLY` and you must
     check that line);
   - the mutant was **mislabelled** — named for "mark before the gate", actually inserted after it;
   - the mutant **killed for the wrong reason** — removing a required TS argument dies at a type
     error, proving the arg is required and nothing about the semantics; the real race test was not
     even among the failures.

   **If you produce "pre-fix" by mutation rather than by checkout, #2 is the case where you believe
   you ran the step and did not.**

3. **Ambient environment.** A criterion can fail pre-fix and pass post-fix for reasons unrelated to
   the fix (a canary asserting error wording that differs on CI where there is no tmux pane). You
   would record a genuine failure output and be satisfied.

4. **Guard total over a hardcoded list.** `pij-skill-check.sh` asserts "every CLI verb has a home"
   while iterating a **literal verb list in the script**. Shipping `pij chore` left it undocumented
   and the check stayed green. Fully capable of failing — over a frozen subset that structurally
   excludes the new member. It was also **not wired into `harness checks`**, and red with 10
   pre-existing failures on origin/main the whole time.

5. **Habituation.** An override that fires on every correct case trains its user to ignore it
   (`baton grant --repin`, `pij close --force`). Out of fail-first's scope, same family, and the
   remedy is a design move: make the override **structurally unable to reach the dangerous case**,
   as `--assume-dead` does.

---

## 3. Where theirs is broader — three things I did not have

1. **#2 satisfied by a neighbour.** I do not have this and it is the best single item in either
   document:

   > An assertion over a SET is not evidence about a MEMBER. Any fix that adds a member to an
   > existing set makes set-level assertions uninformative **by construction**.

   Knowable from the change's shape before the first assertion is written, and it defeats the usual
   defence — the author *had* read the code. Adopted.

2. **The labelling scheme** — behavioural / new-API / preserved-property. I had no taxonomy and no
   way to quantify. *"Three behavioural of ten"* converts a table of green ticks into a number, and
   *"a preserved-property criterion presented as evidence"* names a failure I had seen and never
   isolated.

3. **The counter-datum, which is the real argument.** One stream predicted a criterion could not
   fail and it failed anyway. So the reasoning errs in **both** directions and which one you get is
   luck. My filing still says "verify the gate covers the claim" — a judgement instruction. Theirs
   correctly makes the step **mechanical**. That is the upgrade, and it is why stating the bar was
   never going to be enough.

---

## 4. The gap NEITHER document covers — and it is this fleet's exposure right now

Put the two fleet docs side by side:

- `partition-categories.md` §5: **a partition cannot partition a composition root.** `daemon.ts`
  took three streams in one run, none of them a mistake.
- `fail-first.md`: run every criterion against the **pre-fix tree** and record the failure.

Both are right. Together they leave a hole:

> **A fail-first proof is established against YOUR tree, pre-merge. Convergence can invalidate it,
> and nothing re-runs it.**

This is my mechanism #6 and it is the fleet-scale form. After a sibling stream rewrites the file
around your guard, `grep` still finds your guard and your suite is still green — but the guard may
have become unreachable while its test passes for another reason. **Still-present and
still-load-bearing are different claims.** I verified this concretely on 2026-07-25: s070's exempt
guard, re-checked after s069 rewrote `daemon.ts`, by re-running the Dim-0 revert on the *combined*
tree rather than the tree I developed against.

**Proposed rule for the fleet docs**: the fail-first evidence bar is discharged at authoring time
**and again on the rebased tree before convergence** — for any criterion whose file is touched by
another stream. The partition already tells you exactly which criteria those are: the ones in
categories 3 (invalidates), 4 (shared test files), 5 (composition root) and 6 (import block).
**The partition doc knows which proofs are at risk; the fail-first doc does not know it needs to
ask.** Six streams merging into one composition root is precisely the condition that produces this,
and it has not happened yet in this run only because nothing has converged.

---

## 5. The honest accounting you asked for

You wanted the number rather than the argument. Of the five shapes plus the tested-but-unreached
section — **six items**:

| item | status |
|---|---|
| #3 bare negative | **exact rediscovery** (my #7) |
| tested-but-unreached | **exact rediscovery** (`computed-but-unconsulted-signals`) |
| #1 already true | partial — I had the step, scoped too narrowly |
| #5 wrong field | partial — same family as my #9 |
| #4 helper not path | partial — my #8 + the reachability form |
| **#2 satisfied by a neighbour** | **genuinely new. Nobody had this.** |

So: **two of six were already written down and re-derived from scratch this morning; three were
partially covered; one is new and is worth the whole exercise.**

I would not present that as a wasted morning, and I do not think you should either. Independent
rediscovery *confirmed* the class — five streams finding it by five mechanisms is stronger evidence
than one seat enumerating eleven, and it produced #2, the labelling scheme, and the counter-datum,
none of which I had. **The waste is narrower and more fixable than "we re-derived doctrine": it is
that a committed document cited the prior work by mechanism number and the link went nowhere.**

The fix for that is one commit, not a process.
