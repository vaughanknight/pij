# Execution log — plan 096, watchdog verdicts

## Pre-fix gate (before any implementation)

**The bar** (prime, fleet practice correction 2026-08-08): *for each acceptance
criterion, RUN IT AGAINST PRE-FIX CODE AND WATCH IT FAIL. Not reason about it. Run it.*
A criterion that passes on the unfixed tree is not testing the fix.

Commit under test: `e86a7ce` (plan only — **no source change**).
Command: `npm run test -- .pi/extensions/pij/core/daemon/watchdog-manager.test.ts -t "s096"`

### Result: 4 behavioural criteria fail, 1 preserved-property passes — as designed

| AC | Kind | Pre-fix result | Failure is the defect? |
|----|------|---------------|------------------------|
| AC-01 | Behavioural | **FAIL** | Yes — emits `watchdog responsive: peer` on a fire that examined nothing (pij#161). |
| AC-04 | Preserved-property | PASS | Correct — cannot fail pre-fix; guards this PR's own change. |
| AC-05 | Behavioural | **FAIL** | Yes — renders a capture pointer for a 0-byte pane instead of `capture unavailable` (pij#161's live instance). |
| AC-06 | Behavioural | **FAIL** | Yes — the pane-death tick alone manufactured a `responsive` (KF-02). |
| AC-07 | Behavioural | **FAIL** | Yes — a seat that answered every fire climbed `suspect → stalled → stalled` (pij#148). |

### Three of these first passed for the wrong reason — recorded, because that is the finding

The first draft of this block had **AC-04, AC-06 and AC-07 all passing** against pre-fix
code. None of them was testing what its name claimed:

- **AC-06** never reached the bug. The pane died while a fire was still outstanding, so
  `paneChangeWasWatchdog` was true and the watchdog's own attribution absorbed the delta.
  The test measured a **neighbour** — s097's exact shape, reproduced here by the author of
  the warning. Fixed by forcing a real recovery first (so `awaitingResponse` is false),
  then snapshotting `responses.length` so the assertion is about the pane-death tick alone.
- **AC-07** fired **zero times**. Holding `statusAt` equal to `now` on every tick re-anchors
  the schedule (`watchdogScheduleAnchorMs`, `isFireDue` takes `max(lastFireAt, anchor)`), so
  no fire was ever due and the "never stalled" assertion passed **by absence**. Fixed by
  answering *after* each fire and running the clock a full interval past the answer.
- **AC-04** cannot fail pre-fix at all — pre-fix the verdict *is* `responsive`, so the
  property already holds. It was mislabelled behavioural; it is a **preserved-property**
  guard against noise this PR could introduce, and is now labelled as such.

**Both failure modes in one block**: an assertion satisfied by a *neighbour* (AC-06) and an
assertion satisfied by *absence* (AC-07). Reasoning alone would have shipped all three.

### Verbatim failure output

```
[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 4 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m .pi/extensions/pij/core/daemon/watchdog-manager.test.ts[2m > [22ms096 watchdog verdicts: no-evidence, unreadable panes, answered fires[2m > [22mAC-01 does not certify health on a fire that examined no evidence
[31m[1mAssertionError[22m: expected 'watchdog responsive: peer\ncapture: /…' to contain 'watchdog unknown: peer'[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- watchdog [7munknown: peer[27m[39m
[31m+ watchdog [7mresponsive: peer[27m[39m
[31m+ capture: /pij/owner/watchdog-captures/100-peer.txt[39m
[31m+ healthy[39m
[31m+ idle[39m

[36m [2m❯[22m .pi/extensions/pij/core/daemon/watchdog-manager.test.ts:[2m1801:22[22m[39m
    [90m1799|[39m   [34mexpect[39m(notices)[33m.[39m[34mtoHaveLength[39m([34m1[39m)[33m;[39m
    [90m1800|[39m   // Positive identification of the no-evidence verdict, not "is not r…
    [90m1801|[39m   [34mexpect[39m(notices[[34m0[39m])[33m.[39m[34mtoContain[39m([32m"watchdog unknown: peer"[39m)[33m;[39m
    [90m   |[39m                      [31m^[39m
    [90m1802|[39m  })[33m;[39m
    [90m1803|[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯[22m[39m

[41m[1m FAIL [22m[49m .pi/extensions/pij/core/daemon/watchdog-manager.test.ts[2m > [22ms096 watchdog verdicts: no-evidence, unreadable panes, answered fires[2m > [22mAC-05 reports an unreadable pane as unavailable, not as an empty capture
[31m[1mAssertionError[22m: expected 'watchdog responsive: peer\ncapture: /…' to contain 'capture unavailable'[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- capture unavailable[39m
[31m+ watchdog responsive: peer[39m
[31m+ capture: /pij/owner/watchdog-captures/100-peer.txt[39m
[31m+[39m

[36m [2m❯[22m .pi/extensions/pij/core/daemon/watchdog-manager.test.ts:[2m1843:22[22m[39m
    [90m1841|[39m   [35mconst[39m notices [33m=[39m [34mnoticesTo[39m(h[33m,[39m [32m"owner"[39m)[33m;[39m
    [90m1842|[39m   [34mexpect[39m(notices)[33m.[39m[34mtoHaveLength[39m([34m1[39m)[33m;[39m
    [90m1843|[39m   [34mexpect[39m(notices[[34m0[39m])[33m.[39m[34mtoContain[39m([32m"capture unavailable"[39m)[33m;[39m
    [90m   |[39m                      [31m^[39m
    [90m1844|[39m   [90m// A 0-byte capture must never be written as if it were content.[39m
    [90m1845|[39m   [34mexpect[39m(h[33m.[39mstore[33m.[39mcaptures)[33m.[39m[34mtoEqual[39m([])[33m;[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯[22m[39m

[41m[1m FAIL [22m[49m .pi/extensions/pij/core/daemon/watchdog-manager.test.ts[2m > [22ms096 watchdog verdicts: no-evidence, unreadable panes, answered fires[2m > [22mAC-06 does not read a vanishing pane as recovery
[31m[1mAssertionError[22m: expected [ 'responsive' ] to not include 'responsive'[39m
[36m [2m❯[22m .pi/extensions/pij/core/daemon/watchdog-manager.test.ts:[2m1884:64[22m[39m
    [90m1882|[39m   // A disappearing pane is absence of evidence. This tick alone must …
    [90m1883|[39m   [90m// manufacture a recovery.[39m
    [90m1884|[39m   expect(h.responses.slice(before).map((r) => r.response)).not.toConta…
    [90m   |[39m                                                                [31m^[39m
    [90m1885|[39m  })[33m;[39m
    [90m1886|[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯[22m[39m

[41m[1m FAIL [22m[49m .pi/extensions/pij/core/daemon/watchdog-manager.test.ts[2m > [22ms096 watchdog verdicts: no-evidence, unreadable panes, answered fires[2m > [22mAC-07 never stalls a seat whose statusAt advances after every fire
[31m[1mAssertionError[22m: expected [ 'suspect', 'stalled', 'stalled' ] to not include 'stalled'[39m
[36m [2m❯[22m .pi/extensions/pij/core/daemon/watchdog-manager.test.ts:[2m1938:50[22m[39m
    [90m1936|[39m
    [90m1937|[39m   // It answered every single fire, by its own hand. `stalled` must me…
    [90m1938|[39m   [34mexpect[39m(h[33m.[39mresponses[33m.[39m[34mmap[39m((r) [33m=>[39m r[33m.[39mresponse))[33m.[39mnot[33m.[39m[34mtoContain[39m([32m"stalled"[39m)[33m;[39m
    [90m   |[39m                                                  [31m^[39m
    [90m1939|[39m  })[33m;[39m
    [90m1940|[39m })[33m;[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
```

---

## Mutation gate — PRE-REGISTERED targets (written before any result was seen)

Fleet heuristic (s093 finding, s097 tool, relayed 2026-08-08): **run the mutation gate
against your NEWEST and least-examined test, not your headline one.** A vacuous test is
invisible to *reading* by construction — it looks exactly like a correct one — and the pin
written in the last hour to satisfy someone else is where the vacuum hides. s093's instance
passed an opus coder, a PM who explicitly asked for it and read it, and a full review round;
it was only visible to execution against a mutant.

These targets are registered **now**, before the coder has finished and before any mutation
has been run, so the choice cannot be rationalised after seeing results.

| Rank | Test | Why it is the highest vacuum risk | Mutation that MUST turn it RED |
|---|---|---|---|
| **1** | **AC-04** (anomaly selectivity) | **Newest and least examined.** It is the one criterion I *reclassified* (behavioural → preserved-property) rather than rewrote, and I never re-scrutinised it afterwards. It passes in both worlds **by design**, which is exactly the shape a vacuous test also has. Its whole value rests on the *paired* always-watcher assertion actually discriminating. | Force the anomaly predicate true for every verdict (mutate the new positive predicate in `watchdog-manager.ts` to always-anomaly). AC-04 must go RED. If it stays green, the pairing proves nothing and the test is scenery. |
| 2 | AC-06 (pane death ≠ recovery) | The `before = h.responses.length` snapshot is subtle and new. If the slice is mis-indexed, the assertion inspects an empty array and passes trivially — absence again, one level down. | Restore the raw string inequality so a vanishing pane counts as a pane change. AC-06 must go RED. |
| 3 | AC-07 (answered ≠ silent) | Rewritten late after it first passed with **zero fires**. The `h.fires.length` precondition pin is the newest line in it. | Gate `stalled` on the answered flag inverted (or drop the flag from `evaluateResponse`). AC-07 must go RED. |

**Contract** (`~/.pij/shared/mutate.mjs`): exit `0` = mutation made tests fail → gate PASSES;
exit `1` = mutation applied and everything stayed GREEN → **inconclusive, see below**;
exit `2` = TARGET NOT FOUND → loud, never green.

**Exit 1 has two causes and the tool cannot tell them apart** (tool author's correction,
2026-08-08, after hitting it on their own branch twenty minutes after shipping it):

- **(a) vacuous test** — the tests genuinely cannot perceive the change; a real finding;
- **(b) equivalent/unreachable mutant** — the edit changed no behaviour at all (dead code, an
  arm shadowed by an earlier branch, a semantically identical rewrite). **The tests are fine
  and the mutant is wrong.**

**The check**: on exit 1, ask *can I construct **any** input whose observable behaviour
differs under this mutation?* If not, it is (b) — pick a reachable target and re-run. Only
after clearing that is exit 1 a verdict on a test.

**Why this is not a footnote**: acting on (a) when the truth is (b) means **rewriting a
correct test to chase a phantom**, and the natural "fix" is to weaken an assertion until
something moves. The failure mode of the vacuity tool is *manufacturing* vacuity.
Equivalent-mutant detection is undecidable in general, so the tool cannot resolve it — which
is why its exit-1 message now refuses to state a conclusion it has not earned.

Exit `1` is the case this heuristic is about, and it is the more common one: the mutation
lands cleanly and the test simply **cannot see it**. The earlier relay was about mutations
that silently no-op; this is the inverse.

**Independence**: the reviewer peer runs these against the branch itself. `mutate.mjs` needs
no write access, so the strongest check in this pipeline stops being self-reported by the
author whose fix it validates.

---

## Re-run obligation at convergence — which of MY proofs a rebase can invalidate

Fleet rule (s099, adopted 2026-08-08): **the fail-first bar is discharged at authoring time
AND AGAIN on the rebased tree**, before convergence, for any criterion whose file is touched
by another stream. After a sibling rewrites the code around a guard, `grep` still finds the
guard and the suite is still green — but the guard may have become **unreachable**.
*Still-present* and *still-load-bearing* are different claims, and only the first survives a
rebase for free.

### Triage of this stream's criteria

| Criterion | File | At risk? | Reason |
|---|---|---|---|
| **2.5** (edited assertion) | `docs/plans/055-pij-watchdog/proofs/run-proofs.ts:922` | **YES — highest** | Category 3 (a file my work *invalidates*, owned by nobody) **and** transitively dependent on a triple-contended file. Verified by reading, not inferred: my exact edit target sits downstream of a real `new Daemon(...)` + `daemon.tick()` (`run-proofs.ts:911-918`), and `run-proofs.ts` constructs a real `Daemon` in **10** places. `daemon.ts` has taken three streams this run (s092 merged `a2a50e2`, s095 `:639-648`, s097 `:354`). |
| AC-01 / AC-04 / AC-05 / AC-06, and edited assertion 1.1b | `core/daemon/watchdog-manager.test.ts` | No | Exclusively this stream's; no sibling writes it. Re-check only if the partition changes. |
| AC-07, and edited assertions 1.8 / 3.5 | `core/watchdog.test.ts` | Low | Exclusively this stream's. `mutesWatchdogNudge`'s **consumers** live in `core/anomalies.ts` (stream 6), so a shared-behaviour drift is conceivable even though the file is not shared. |

### The obligation, concretely

Before this PR converges, and **after** any rebase onto a tree carrying another stream's
`daemon.ts`:

1. Re-run the **full** `run-proofs.ts` (no `--smoke`) on the rebased tree.
2. Re-establish assertion 2.5's **both-ways** result there — not just "the suite is green".
   Green proves the assertion still runs; it does not prove it can still **fail**.
3. If 2.5 no longer fails without the fix, the proof is gone and must be rebuilt before merge.

**Note the irony worth keeping**: the one file I needed special permission to touch is also
the one proof of mine that a rebase can silently hollow out. Permission was the visible risk;
reachability is the real one.

### The observation underneath the rule (s099)

**The partition document knows which proofs are at risk; the fail-first document does not know
it needs to ask.** Two correct documents, and the fact connecting them lives in neither — the
same intersection shape as pij#148 itself (two correct rules, and the seat obeying both is
destroyed by the pair).

---

## Audit — which assertion actually fired in each recorded pre-fix RED

Fleet correction (s094, 2026-08-08): **a pre-fix RED on a multi-assertion test proves only
the FIRST assertion that fired.** `expect()` throws, so every assertion after it never ran
and is unproven. A criterion that went red is not thereby a validated criterion.

Audited against the recorded output at `8ba6e96` — reading which assertion the failure text
names, not assuming.

| AC | Assertion that fired | Assertions after it | Verdict |
|---|---|---|---|
| AC-01 | #2 `toContain("watchdog unknown: peer")` — **carries the meaning** (#1 `toHaveLength(1)` passed, so the delivery pin held) | none | **Covered** |
| AC-05 | #2 `toContain("capture unavailable")` | **#3 `expect(h.store.captures).toEqual([])` — NEVER RAN** | **GAP** |
| AC-06 | #2 the `responses.slice(before)` assertion — carries the meaning (#1 confirmed the legitimate recovery) | none | **Covered** |
| AC-07 | final `not.toContain("stalled")` (the in-loop `h.fires.length` pin passed each round) | none | **Covered** |

### The one real gap, and why it is a gap and not a technicality

AC-05 bundled **two different observable behaviours** into one test:

1. the watcher notice *says* `capture unavailable`, and
2. **no capture is written at all** for an unreadable pane.

They are separate claims about separate outputs — the notice body versus the capture store.
The pre-fix red fired on (1), so (2) — *a 0-byte capture must never be written as if it were
content*, which is the closest thing to pij#161's live instance — had **no evidence behind
it** while sitting inside a test I had recorded as red.

**Fix, preferring the split** (per the correction's guidance): AC-05 becomes **AC-05a**
(notice text, keeping the `toHaveLength(1)` delivery pin so the content assertion cannot be
satisfied by absence) and **AC-05b** (no capture written). One criterion, one claim, one
assertion that can fail.

AC-05b never had a genuine pre-fix red, so it is proved by a **revert-style mutation**
(restore the old behaviour that wrote the empty capture). Revert-style is deliberate: it
restores the exact path the fix changed, so it cannot be an unreachable/equivalent mutant.

### The division of labour, which is the general lesson

**A pre-fix red cannot reach past the first assertion; a mutation can.** The two gates are not
redundant and neither subsumes the other:

- *pre-fix red* — proves the criterion could fail **on the real unfixed code**, but only for
  one assertion;
- *mutation* — reaches **every** assertion in the test, but needs a reachability argument
  (F-610/F-611) that the pre-fix red gets for free.

**Corollary** (this stream): for a **revert-style** mutant, a recorded pre-fix red *is* the
reachability proof — the pre-fix state **is** the mutant state. That discharges reachability
for AC-06 and AC-07's mutants. It does **not** discharge AC-04's, whose mutant is a novel
perturbation rather than a revert — and AC-04 is also the criterion ranked #1 for vacuum risk.
Both facts have the same cause: it is the preserved-property guard, and passing in both worlds
is exactly what denies it a pre-fix red.

## Mutation-target validity — subprocess-spec census, regenerated not trusted

`mutate.mjs` works by Vite transform, so it only reaches modules loaded **inside** the vitest
process. A spec that shells out runs a child reading the **unmutated** file from disk: the
mutation never reaches the code under test, the targeted test *cannot* go red from it, and the
gate could only ever pass **by accident** (a sibling saw `GATE PASSES` supplied by an
unrelated `SIGTERM` flake while the targeted test showed a green tick). The tool now refuses
with exit 3 rather than guessing.

**Checked for this stream with the tool's own five markers** — not against a circulated list:

```
$ grep -rln 'execFileSync\|spawnSync\|execSync\|execPath\|child_process' \
    --include=*.test.ts .pi/extensions/pij/        # 14 files
```

Neither `core/daemon/watchdog-manager.test.ts` nor `core/watchdog.test.ts` appears. **Both
mutation targets are valid; no banked result of this stream's is void.**

The circulated census was later corrected in **both** directions (one file missing, one file
wrongly included) because it had been grepped with a *different* marker set than the tool
enforces on. This stream was unaffected only because the check was run against its own two
files with the tool's markers rather than by looking for its filenames in someone's list.

> **A census must use the same predicate as the enforcement, or it describes a different set
> than the one that will be acted on.** Both artefacts were internally correct and disagreed
> at the edges, and nothing signals — the list looked authoritative *because* it was grepped
> rather than guessed. Verifying by running a command feels like verification even when it
> establishes the wrong proposition. **Under-enumeration is the direction that hurts**: the
> owner of a missing file finds no entry, concludes "audited", and keeps a void result.

### Consequence for this stream's own criteria

AC-07 carries an in-loop precondition pin (`expect(h.fires.length).toBe(round + 1)`). It did
**not** fire pre-fix — the claim assertion did — so the recorded evidence is sound. But the pin
is a live instance of the trap that survives naive splitting: **a criterion must assert THE
CLAIM, never the setup that makes the claim reachable.** If a future change stopped the fires
happening, AC-07 would go red on its *precondition* and read exactly like a validated
criterion. Noted so a later reader does not mistake a precondition failure for evidence.

### Adjudication under the one-hop guard — this stream's file is MIXED, its result STANDS

The subprocess guard was later widened to scan the spec **plus its directly-imported relative
modules (one hop)**. Re-running that stricter scan against this stream's spec changes the
picture — and the earlier check here was **spec-source-only**, i.e. under-enumerating in
exactly the way the guard's own author found in their first version:

```
$ # one-hop scan of watchdog-manager.test.ts's 15 relative imports
TRIPS: daemon.ts (4)
TRIPS: core/spawn.ts (1)
```

So under the widened guard this spec **would now be refused (exit 3)** — correctly, as a
conservative default.

**The banked result nonetheless stands**, by the checkable rule (*a banked result is valid iff
the named red test executes the mutated module in-process*):

| Check | Evidence |
|---|---|
| Does the s096 block shell out? | **No** — zero `execFileSync\|spawnSync\|execSync\|execPath\|child_process`, and zero `new Daemon(...)` in the whole block. |
| Does it drive the mutated module in-process? | **Yes** — 12 × `managerHarness()`, 29 × `manager.reconcile(...)`, all direct in-process calls into `core/daemon/watchdog-manager.ts`. |
| Was the red test named? | **Yes** — the AC-05b mutation was run with `--expect` naming AC-05b; exit 0. |

The file trips the marker **solely** because of `daemon.ts` / `spawn.ts` imports used by
*other, unrelated* tests later in the same file. The defect is **per-test**, not per-file.

### Two things this stream is keeping from it

1. **A tool's conservative refusal is not a claim about the evidence.** A refusal says what the
   tool can no longer **certify**; it says nothing about what is **true**. Conservative defaults
   are right in tools and wrong in verdicts. The guard refusing this file and the result being
   valid are consistent, not contradictory.
2. **Recording the test name pays twice.** It is the same discipline as the first-assertion
   audit: record *which* test, never just the verdict. A result recorded as an exit code alone
   cannot be adjudicated at all and must be re-run; this one was adjudicated in a minute.

That is also the argument for `--expect` being mandatory rather than merely precise: under a
gate that asks only *"did anything go red"*, **a flake is indistinguishable from a kill**, so
any spec with an intermittent test silently satisfies **every** mutation run against it,
forever. `--expect` is what makes the gate falsifiable. Note the two guards cover **different**
vectors and neither subsumes the other: *green-before-mutating* kills the **pre-existing** red;
*`--expect`* kills the **concurrent flake**.

## AC-04 relabelled again — MUTATION-ONLY, and three lines converge on it

s100's fourth criterion label: **mutation-only** — a claim about a mechanism that **does not
exist pre-fix**, so a red is unavailable *in principle* rather than merely absent. The danger
named with it is that such a criterion's natural home is "behavioural", where it then quietly
never produces a red and nobody notices the difference between *did not fail* and *could not
fail*.

**AC-04 is one, and this stream had it mislabelled twice.**

| Labelling | Reasoning | Verdict |
|---|---|---|
| behavioural (original) | assumed it would fail pre-fix | **wrong** — it passed |
| preserved-property (after the gate) | "cannot fail pre-fix; guards this PR's own change" | **still wrong** |
| **mutation-only** (correct) | Pre-fix **there is no no-evidence verdict** — the fire emits `responsive`. The claim *"a no-evidence fire does not trip anomaly capture"* has no pre-fix form at all. | **correct** |

The distinction is not pedantry. A *preserved-property* guard asserts a property that **exists
before and after**. AC-04's pre-fix pass and post-fix pass are **different propositions**: pre-fix
it passes because the verdict is `responsive`; post-fix because the predicate explicitly
excludes `unknown`. Same test, same green, different mechanism — so the pre-fix run says
nothing whatever about the thing the criterion exists to check.

**Its sole proof is the named mutant** (pre-registered rank 1: force the anomaly predicate true
for every verdict). *If you cannot name the mutant, you do not have a criterion.*

### Three independent lines converge on AC-04, with one cause

1. Ranked **#1 for vacuum risk** — newest and least-examined, the criterion reclassified rather
   than rewritten.
2. The **only** one of the three mutants whose reachability is **not** already discharged by a
   recorded pre-fix red (it is a novel perturbation, not a revert).
3. **Mutation-only** — no pre-fix form exists.

All three are the same fact: **it passes in both worlds, and passing in both worlds is exactly
what denies it a pre-fix red.** The property that makes it suspect is the property that makes
it hard to check, and it is the property that made it look settled.

### On censuses — retired, and this stream stops regenerating one

The repo-wide subprocess census is retired: *the question is never "what does this repo
contain" but "will the tool refuse on the spec I am about to mutate"* — a **local** question,
answerable at run time by the tool itself. Measured hazard: the same five markers at repo root
return **14 files that are completely disjoint** from the `.pi/`-scoped 14, with **identical
cardinality**, so a seat "corroborating" by count would have corroborated nothing. (Cause:
`rg` skips hidden paths — pij#144 again. The trap is **scope**, not the tool.)

This stream's adjudication above stands because it was **local** throughout: it scanned its own
spec's imports and its own test block, and never looked its filename up in a list.

### The guard was graded — and this stream's adjudication anticipated it

The subprocess guard became **graded** rather than blanket, because the blanket form produced
a **false positive**: a sibling's spec was refused for importing `daemon.ts`, whose
`execFileSync` sites are `tmux display-message` and `ps -o state=` — external binaries that
could never load `daemon.ts` — while the spec constructed `Daemon` **in-process**. Two correct
rules composing into a refusal for a perfectly mutable spec: this wave's shape, inside the tool
built to police this wave's shape.

| Marker location | Grade | Why |
|---|---|---|
| the spec's **own** source | **REFUSE** (exit 3) | it very likely launches the subject in a child |
| **one hop** away | **WARN and proceed**, naming the file | genuinely ambiguous — a helper that launches the subject (unmutable), or the subject itself shelling out to something unrelated (mutable) |
| the module under `--file` | **ignored** | that the *subject* shells out says nothing about whether the *spec* does |

**This stream's spec now warns and proceeds** (via `daemon.ts` / `spawn.ts`, imported by
unrelated tests later in the file) — which is exactly the position reached here by hand before
the tool could express it. The adjudication above did not need revising; the tool caught up to
it.

**Vocabulary now shared across the tool, and worth adopting generally**: exit 3 is
**NOT-PROBEABLE, never FAIL** — the same distinction `pij chore` already implements. *The tool
says what it can no longer certify, never what is true.* Three surfaces share the rule now:
exit 3, exit 1's two causes, and detector rows reporting observations rather than deaths.

**Why grading beat tolerating a safe-looking default** (s099's asymmetry, acted on):
**over-voiding leaves no trace.** Nobody sees evidence discarded unnecessarily, nobody re-runs
to discover it was fine, and the cost is paid in work silently redone. A blanket refusal is
conservative *in the direction that hides its own cost*. Grading converts an unactionable
refusal into a named ambiguity a seat can settle in a minute.

## The `run-proofs.ts` flake is pij#188 — owned by the prime, NOT fixed here

`run-proofs.ts` exits 1 on scenario *"AC-07 anomaly/always capture pointers and caps"*
(*"scratch pane omitted deterministic capture markers"*, `run-proofs.ts:881`). **Proven
pre-existing**: all five files were reverted to pristine `HEAD` and the identical failure
reproduced with none of this stream's changes present. Root cause is `sleepSync(25)` at
`run-proofs.ts:879` waiting for a tmux scratch pane to render; under fleet load the capture
returns `len=0 lines=1` — the pane is **entirely empty**, not truncated.

**Deliberately not fixed here.** This stream holds a one-assertion budget in that file (`:922`)
and the reviewer was dispatched against a fixed scope; adding a second, unrelated hunk would
make the reviewer review a moving target. *"It was only one line"* is the reasoning that gets
a boundary crossed. Filed as **pij#188**, owned by the prime, to land after this PR merges.

### Why it is the same defect one layer out — and the headline of that issue

A 25 ms sleep produces an **empty** capture, and the proof reads that absence as *"the pane
omitted the markers"* — a **content** failure. **Absence of a reading rendered as a reading**,
inside the proof harness *for the fix about absence being rendered as health*. The
instrument's limit rendered as the world's property, in the instrument built to catch exactly
that.

The larger half is KF-03's: **the scenario runs in neither CI nor `harness checks`.** A proof
nothing executes is worse than a missing proof — it carries the full appearance of coverage at
zero cost to whoever breaks it.

The issue asks for a **poll-until-non-empty with a deadline**, not a bigger constant — *a fixed
sleep against an external renderer is the defect; a longer one is the same defect with a bigger
number* — plus distinguishing **empty** (NOT-PROBEABLE) from **missing markers** (FAIL), and
gating or deleting the scenario.

### Consequence for this PR's gates

`npx tsx docs/plans/055-pij-watchdog/proofs/run-proofs.ts` does **not** exit 0 on this branch,
for this pre-existing reason alone. The both-ways evidence for assertion 2.5 was obtained in a
run with the flake neutralised, and this must be stated plainly in the PR body rather than
letting a reviewer discover a red proof run and assume it is ours.

---

## Convergence — the obligation discharged, and what it exposed

`daemon.ts` changed under this branch (`a2a50e2`, merged into `main` while this stream ran),
which is exactly the condition the recorded obligation was written for. Merged `origin/main`
into the branch (**merge, not rebase** — the branch was already pushed, so no history rewrite
and no force-push).

### Assertion 2.5, re-established on the merged tree

| Tree | Result |
|---|---|
| merged + fix, flake neutralised | **PASS** — 9 passed, 0 skipped, 0 failed |
| merged, **source reverted to `origin/main`**, flake neutralised | **FAIL — `"always mode graded a no-evidence fire as healthy"`** |

That failure reason is **assertion 2.5's own**, not the flake's. So the assertion is still
*load-bearing* after a sibling changed `daemon.ts` beneath it — *still-present* and
*still-load-bearing* separately confirmed, which was the whole point of the obligation.

All three temporarily-modified files restored and verified **byte-identical** (`git status`
clean apart from the untracked seat record).

### What the exercise exposed: pij#188 does not merely add noise — it MASKS a proof

The flake fails at `run-proofs.ts:881`; assertion 2.5 lives at `:935`; **both are inside
`runBoundedCapture()`** (starts `:868`), the `run` for scenario *"AC-07 anomaly/always capture
pointers and caps"*. So when the flake fires, the scenario aborts **before** assertion 2.5 ever
executes.

**This is the first-assertion rule at the scenario level.** A red proof run says nothing about
any assertion downstream of the flake — and post-merge the flake fired on **3 of 3** runs, so
under fleet load assertion 2.5 was *never being reached at all*. Only neutralising the flake
made the convergence check possible.

That raises #188's severity: it is not a noisy scenario, it is a scenario whose **first**
failure conceals every proof after it — in the one file this stream was granted a single
assertion in, and which no gate executes (KF-03).

### Method note

The neutralisation followed the on-disk mutation discipline: **prove it landed** before
believing the run. The first `sed` targeted line 879 and changed **nothing** — `git diff` was
empty, which caught a mis-targeted mutation that would otherwise have produced a "clean" run
proving nothing. The real `sleepSync(25)` was at `:878`. That is `mutate.mjs`'s exit-2 case,
encountered by hand.
