# Pre-registered mutation ranking — plan 093

**Committed before the results exist.** The coder is still working on the F2 pin fix at the time
this file is written (`pij state pij-free-porpoise` → `working`, HEAD `95bd2da`), and no mutation
below has been run. Pre-registration is the point: *if you pick your targets after the run, you
will pick the ones that worked.* (Fleet practice from s096, relayed 2026-08-08.)

Tool: `~/.pij/shared/mutate.mjs` (in-memory Vite transform — restore is inherent, a drifted target
throws, and `GATE FAILS` is a machine-checkable verdict on the **test**).

Two exit codes, two different questions:
- **exit 2** — did the mutation *happen*?
- **exit 1** — could the test *perceive* it? Only this one is a verdict on a test.

---

## Rank 1 — AC-06: attachment-only to a PULL target still delivers

**Why first: I reclassified this criterion rather than rewriting it.** When the independent
validation showed a global empty-body refusal would delete the telegram capability, I turned AC-06
into a PRESERVED control and moved on. That relabelling *felt like* diligence and was in fact the
moment I stopped examining it.

A preserved-property guard passes in both worlds **by design**. So does a vacuous one. **From
reading, those two are indistinguishable** — which is exactly the property that made the F2 valence
pin survive a coder, a PM who asked for it and read it, and a cross-model reviewer.

**Mutant**: `targetRendersAttachments` → `return false`.
**Prediction**: AC-06 goes RED (a pull target would refuse instead of delivering).
**Why nobody has run it**: the reviewer mutated this helper to `return true`, which killed AC-01
and AC-07. That is the natural direction — it attacks the *refusal*. Nothing has attacked the
*permission*, and the permission is the whole reason the guard is capability-aware rather than
global. This is the fourth failure mode by name: a correct mutation nobody would think to make.
**If it stays green**: AC-06 is decoration, the telegram capability is unprotected, and a future
global-refusal regression ships silently.

## Rank 2 — AC-05: `--command` sends remain exempt

Also PRESERVED, also relabelled rather than rewritten, and it guards a path (`--command` carries
`body: ""` legitimately) that the guard could break with a one-line reordering.

**Mutant**: remove the `--command` early return so the empty-payload guard also evaluates command
sends — i.e. make the exemption depend on nothing.
**Prediction**: AC-05 goes RED (`--command compact` refused with `E-EMPTY`).
**If it stays green**: the exemption is untested and every control command is one refactor away
from being refused.

## Rank 3 — the rewritten F2 valence pin (newest test)

Per the newest-test heuristic: the pin written in the last hour to close a reviewer's finding is
where the vacuum hides. This one has already been vacuous once.

**Mutant**: add `"to"` to core's `BOOLEAN_FLAGS`.
**Prediction**: the pin goes RED.
**If it stays green**: the rewrite failed the same way the original did, and I will not accept a
third version on reading — only on a red mutant.

---

## Commitment

All three run on the **rebased** tree before the PR is declared ready, per the s099 rule (a sibling
can make a guard unreachable while leaving it present and the suite green). Results — including any
`GATE FAILS` — are recorded in `assets/execution.log.md` next to the authoring-time evidence,
whether they flatter this stream or not.

---

# Results — run on the REBASED tree (`origin/main` = `a2a50e2`), after pre-registration

Rebase was clean (11 commits replayed, no conflicts). Baseline first, then one mutant per run so
no case is carried by a neighbour. `git status --short` and `git diff --exit-code` clean afterwards.

| Rank | Mutant | Predicted | Result |
|---|---|---|---|
| 1 | `targetRendersAttachments` → `return false` | AC-06 RED | **GATE PASSES** — 4 failed / 473 passed |
| 2 | `if (cmd.command !== undefined)` → `if (false)` | AC-05 RED | **GATE PASSES** — 2 failed / 475 passed |
| 3 | `"to"` added to `BOOLEAN_FLAGS` | valence pin RED | **GATE PASSES** — 1 failed / 53 passed |

Three for three. No `GATE FAILS`.

## What the result does and does not say

**Rank 1 came back clean, and that is the finding worth recording.** I nominated AC-06 as the
prime suspect on a structural argument — I *reclassified* it as a preserved-property control
rather than rewriting it, and a preserved guard and a vacuous one are indistinguishable from
reading. The argument was sound and the conclusion was wrong: AC-06 detects the mutation, at
`core/cli.test.ts:1144`, and specifically detects the mutation **nobody had attacked** (the
reviewer had mutated the same helper to `return true`, which attacks the *refusal*; rank 1 attacks
the *permission*).

That asymmetry is the point of pre-registering. Had I picked targets after seeing results, rank 1
would not have been written down at all — a clean result is exactly what stops a suspicion from
ever being recorded. **The value of a pre-registered ranking is that it makes negative results
durable**, and a negative result on a criterion I had stopped examining is worth more than a third
positive on the guard everyone has already mutated twice.

**The s099 re-validation is also discharged by this run**: all three mutants were executed on the
tree *after* rebasing onto `a2a50e2`, so the fail-first proof holds on the combined tree, not only
on the tree it was authored against. `core/cli.ts` is co-owned with `capability-surface`, which is
why that mattered. If that stream lands after this one, this run must be repeated — still-present
and still-load-bearing remain different claims.

---

# Addendum — the tail-assertion audit (s094 correction, 2026-08-08)

**The correction**: `expect()` throws, so a pre-fix RED proves only the **first** assertion that
fired. Every assertion after it in that test never ran and is unproven.

**Step 1 — which assertion actually fired?** In every recorded pre-fix failure for this stream it
was `expect(d.delivery.outbox).toHaveLength(before)` (`core/cli.test.ts:808` and siblings).

**Step 2 — was it the one carrying the criterion's meaning?** Yes, and not by luck: the coder
ordered the outbox assertion **first on purpose**, reasoning that vitest stops at the first failure
so an exit-code assertion placed first would have hidden the only check that separates *"refused"*
from *"delivered, then complained"*. That is the s094 rule, applied before it was stated.

**But the gap was still real.** The assertions *after* it — `expect(r.exitCode).toBe(2)` and
`expect(r.stderr).toContain("E-EMPTY")` — never ran pre-fix, so nothing established they could
fail. Ordering saved the *meaning*; it did not save the *tail*.

**Step 3 — proved the remainder by mutation.** `mutate.mjs` correctly **refused** this spec (it
contains an `execFileSync` subprocess test, and an in-memory transform cannot reach a child that
reads the file from disk — a real instance of "the mutation never reaches the code under test").
So the on-disk fallback was used with the proof the tool demands:

```
mutant:   return fail("E-EMPTY", `nothing to send: …   →   return fail("E-ARG", …
applied:  git diff --stat → 1 file changed, 1 insertion(+), 1 deletion(-)
result:   7 failed | 13 passed — AssertionError (not a build error), at
          core/cli.test.ts:1060  expect(r.stderr).toContain("E-EMPTY")
restore:  git diff --exit-code clean — byte-identical; 20 passed | 417 skipped
```

The tail assertions are load-bearing. **The gap the s094 correction predicts existed here, and it
was closed by mutation rather than by arguing that the assertion ordering had already covered it.**

---

# VOID AND RE-RUN (correction A, 2026-08-08)

**All three results above were run with `mutate.mjs` against specs that drive subprocesses, and are
therefore void.** An in-memory Vite transform only reaches modules loaded inside the vitest
process; a spec that shells out runs a child which reads the **unmutated** file from disk. On such
a spec the gate can only ever pass by accident.

I regenerated the affected-spec list with the tool's own predicate rather than trusting the
relayed census — *a census must use the same predicate as the enforcement*:

```
grep -rln 'execFileSync\|spawnSync\|execSync\|execPath\|child_process' --include=*.test.ts .pi/extensions/pij/
```

That returns **15** files, not 14. The extra one is **`body-file.integration.test.ts` — this
stream's own new spec**, which could not appear in a census taken before it existed. Both of my
targets are on it: `core/cli.test.ts` and `body-file.integration.test.ts`. A relayed list of
affected files is stale the moment a stream adds a spec, so the regeneration command is the
artifact worth keeping, not its output.

## Re-run — on-disk fallback, with the proof the tool prescribes

For each: green baseline → apply on disk → confirm non-empty `git diff` → **verify the NAMED test
is among the failures** (not merely "something went red") → restore → confirm byte-identical.

| Rank | Mutant | Named test that failed | Restore |
|---|---|---|---|
| 1 | `targetRendersAttachments` → `return false` | `AC-06: attachment-only to a PULL target still delivers (Plan-026 capability preserved)` — **and** `F1 preserved: AC-06 survives` | byte-identical |
| 2 | `if (cmd.command !== undefined)` → `if (false)` | `AC-05: --command sends are exempt — they legitimately carry an empty body` | byte-identical |
| 3 | `"to"` added to `BOOLEAN_FLAGS` | `--to is VALUED: both targets land in \`targets\`, the sentinel stays the body` | byte-identical |

Final state: `git status --short` empty, both specs green.

**The conclusions survive the correction** — but they were not *established* until this re-run.
The first pass produced the right answer by a method that could not have produced a wrong one,
which is worth exactly nothing. Naming the expected test is the part that makes the difference:
the earlier runs only knew "1 test file failed", which on a 437-test file is a claim about the file
and not about the criterion.

---

# Retraction — the regeneration command was also the wrong artifact

Above I wrote that *"the regeneration command is the artifact worth keeping, not its output."*
**That is retracted.** It was the right correction to the wrong question.

A census — mine or anyone's — answers *"what does this repo contain"*. The question a seat actually
has is *"will the tool refuse on the spec I am about to mutate"*. That is **local**, and it is
answerable definitively at run time **by the tool itself**, with no census in existence. Every
defect in the relayed list flowed from answering the local question globally, and my fix — regenerate
with the tool's predicate — reproduced the same error one level down: I still produced a **list**,
and a list of test files is stale the moment any stream adds a spec.

Measured elsewhere in the wave: running the same five markers from the **repo root** returns 14
files that are **completely disjoint** from the 14 under `.pi/extensions/pij/` — identical
cardinality, zero overlap, because `rg` skips hidden paths and cannot see `.pi/` at all (pij#144).
A seat regenerating "to check", getting 14, and seeing 14, would have concluded it had corroborated
the list. **It would have corroborated nothing.**

**The rule this stream now follows: point the tool at the spec and let it refuse or proceed.** That
is what actually happened for the tail-assertion audit above — `mutate.mjs` refused
`core/cli.test.ts`, named `execFileSync` as the reason, and prescribed the on-disk fallback. The
refusal was the answer. I did not need to know what else in the repo shares that property, and
knowing it would not have made the fallback any more valid.

# Criterion labels — the fourth kind

The stream's AC table uses **BEHAVIOURAL / PRESERVED / NEW-API**. A fourth exists:

> **MUTATION-ONLY** — no pre-fix form exists, so a red is unavailable *in principle* rather than
> merely absent. Its sole proof is a **named mutant**, and a criterion without one is not a
> criterion.

**One criterion in this stream is MUTATION-ONLY in practice**: the `kindNote` label change (an
attachment with a whitespace-only body is receipted `file`, not `text+file`). It was found while
implementing, so its assertion did not predate its code and no pre-fix red was ever recorded for
it. It is discharged by a named mutant, which is exactly what the label demands:

```
mutant: (cmd.text ?? "").trim() !== ""   →   (cmd.text ?? "").trim() === ""
named red: AC-06 survives … (core/cli.test.ts:1153) — receipt became `text+file`
```

Labelling it BEHAVIOURAL would have been the trap the label exists to prevent: it would sit in the
behavioural column having never produced a red, and nothing distinguishes *"did not fail"* from
*"could not fail"* by inspection.
