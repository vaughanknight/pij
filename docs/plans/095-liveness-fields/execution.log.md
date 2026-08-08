# s095 — execution log

**Stream**: s095-liveness-fields · branch `s095/liveness-fields`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s095-liveness-fields`
**Coder**: `pij-guilty-skunk` · **PM**: `pij-fair-aphid`
**Base commit**: `d4efbd3` · **Not committed, not pushed, not rebased.**

---

## 1. The bar this log is written to

A pre-fix red is weaker evidence than it looks, in three specific ways, and each
one changed what is written below.

1. **`expect` throws, so a red proves only the FIRST assertion that fired.** A
   five-assertion criterion that goes red has proven one fifth of itself.
2. **Which assertion fires is selected by writing order, and nobody chooses it.**
   It looks like structure rather than a decision, so the selection is invisible.
3. **A claim about a mechanism that does not exist pre-fix is not FALSE pre-fix,
   it is VACUOUS.** Its natural home is "behavioural", where it then quietly
   never reds and nobody can distinguish *did not fail* from *could not fail*.

So every criterion below is **one claim, one named observable**, and each is
labelled by asking **"could this have failed pre-fix?"** rather than "did it".

**The load-bearing design decision** is what the observable reads. Early drafts
read *the update row the sweep emitted*, which made a pre-fix red mean "no row
was written" — a precondition, not the claim. The criteria now read **the seat as
the sweep leaves it** (the update when there is one, otherwise the input seat),
so the same red means **"the field is still there."**

---

## 2. Pre-fix evidence, per criterion

Run at base `d4efbd3` with **production code restored to pre-fix** (verified: the
loop still opened with `if (descriptor.lifecycle === "dissolved" ||
descriptor.terminal !== undefined) continue;`) and the behavioural tests present.

```
npx vitest run .pi/extensions/pij/core/daemon/death-reconciler.test.ts --reporter=verbose
      Tests  13 failed | 23 passed (36)
```

All 13 are `AssertionError` — **no compile errors, no crashes**. The behavioural
file runs against unfixed production code because it uses only the pre-095
`isAlive` input; every symbol introduced by this stream lives in
`death-reconciler.snapshot.test.ts`, declared NEW-API.

| criterion | claim (the named observable) | fired assertion — verbatim | carries the meaning? |
|---|---|---|---|
| **AC-8a** | `terminal` is absent from the seat | `expected { …(3) } to be undefined` | **yes** — the received value IS the stale terminal record |
| **AC-8b** | `deathNoticeLatchedAt` is absent | `expected '2026-08-07T23:14:05.850Z' to be undefined` | **yes** — names the latch, separately from AC-8a |
| **AC-6a** | no `terminal` after an unavailable observation | `expected { disposition: 'unavailable', …(3) } to be undefined` | **yes** — the received value is the fabricated record |
| **AC-10a** | exactly the two live seats of 15 are written | `expected [] to deeply equal [ 'pij-mental-dajeil', …(1) ]` | **yes** — zero moved pre-fix |
| **AC-10c** | the named returned seat's `terminal` is gone | `expected { …(3) } to be undefined` | **yes** — member-level, not the set |
| **AC-17c** | the returned seat IS written on tick 2 | `expected [] to include 'pij-came-back'` | **yes** |
| **AC-17d** | that seat's `terminal` is gone on tick 2 | `expected { …(3) } to be undefined` | **yes** — see §3, this one was fixed |
| **AC-18a** | production sweep is handed one capture | `expected [] to have a length of 1 but got +0` | **yes** |
| **AC-18b** | the daemon captures the table once | `expected [] to have a length of 1 but got +0` | **yes** |
| **AC-19a** | the spawn-limbo detector fires again | `expected [] to include 'spawn-limbo'` | **yes** |
| **AC-19b** | revive refuses, **for the right reason** | `expected 'accepted' to contain 'no terminal observation'` | **yes** — see §3 |
| **AC-19c** | re-bind is re-permitted | `expected false to be true` | **yes** |
| *(existing, reversed)* | a throwing probe mutates nothing | `expected [ { id: 'pij-child', …(10) } ] to deeply equal []` | **yes** |

## 2b. AC-18 re-discharged ON THE REBASED TREE

The rule: **fail-first is discharged at authoring time AND AGAIN after
convergence.** §2's AC-18 rows were established at base `d4efbd3`. A proof
established pre-merge does not survive a rebase for free, because AC-18 is
source-shaped over `daemon.ts` — the one file s092 also merged into. The
specific failure mode is that a sibling rewriting regions around the hunk can
leave the guard **still present and no longer load-bearing**: grep finds it, the
suite stays green, and nothing reports the loss. *Still present* and *still
reachable* are different claims and only the first survives a rebase for free.

Tree state: branch rebased onto `origin/main` (`19a9a8e`), implementation commit
`c533ccd`, hunk now at `daemon.ts:647`. Verified `git merge-base --is-ancestor
origin/main bc039f6` → true, so the strip target below is genuinely the
**post-rebase unfixed** tree, not the pre-rebase one.

**First, the reachability precondition — checked, not assumed.** AC-18a slices
the `reconcileDeaths({ … })` argument object by brace depth. If s092 had added a
second call site, or moved the hunk out of the object, the slice could inspect
the wrong region while still passing. Dumped it:

```
=== SLICE THE AC-18 GUARD ACTUALLY INSPECTS (rebased tree) ===
reconcileDeaths({
    descriptors: this.registry.list(),
    …
    processSnapshot: this.ports.processSnapshot?.(),
    …
})
=== slice contains the hunk: true
```

`grep -c 'reconcileDeaths({' daemon.ts` → **1**. The guard still points at the
production call site.

**Then the strip.** `git checkout bc039f6 -- .pi/extensions/pij/daemon.ts`
(post-rebase parent = post-rebase unfixed daemon), confirmed
`grep processSnapshot daemon.ts` → *(none)* while `reconcileDeaths({` survives at
line 639 — i.e. the call site exists and simply is not handed a capture:

```
 FAIL  …/death-reconciler.test.ts > AC-18 … > AC-18a hands the production death sweep exactly one process capture
AssertionError: expected [] to have a length of 1 but got +0
 ❯ …/death-reconciler.test.ts:610:20
    609|   const captures = productionSweepCall().match(/processSnapshot:/g) ??…
    610|   expect(captures).toHaveLength(1);

 FAIL  …/death-reconciler.test.ts > AC-18 … > AC-18b asks the port for a process capture exactly once in the whole daemon
AssertionError: expected [] to have a length of 1 but got +0
 ❯ …/death-reconciler.test.ts:620:58
    620|   expect(source.match(/processSnapshot\?\.\(\)/g) ?? []).toHaveLength(…

      Tests  2 failed | 34 skipped (36)
```

Both red **as assertion failures**, both on the assertion carrying the claim —
identical text to the pre-rebase proof. The sentinel design matters here: a
missing call site returns the string `<no reconcileDeaths call in daemon.ts>`
rather than throwing, so absence is *a value the claim disagrees with*, never a
precondition that aborts before the claim is reached.

**M3 — the mutant that tests the rebase failure mode directly.** A strip proves
the guard is load-bearing for *presence*. It does **not** prove it is
load-bearing for *reachability*, which is the property a rebase actually
threatens. So: keep `processSnapshot` in `daemon.ts` but move it **out** of the
`reconcileDeaths` object.

```
-           processSnapshot: this.ports.processSnapshot?.(),   (removed from the call)
+   const _orphanedCapture = this.ports.processSnapshot?.();   (added above it)
```

| criterion | shape | under M3 | what that proves |
|---|---|---|---|
| **AC-18a** | slice of the call site | **RED** — `expected [] to have a length of 1 but got +0` | it is reachability-sensitive |
| **AC-18b** | grep of the whole file | **GREEN** | a whole-file grep **cannot** see this defect |

M3 is the interesting result of this re-run, and it is the PM's stated fear made
concrete: under M3 the capture is still taken once per tick, `grep` still finds
it, `processSnapshot` is still wired end to end — and the death sweep receives
nothing. **AC-18b alone would have shipped that.** The two assertions are not
redundant; they fail in different directions, and only the brace-depth slice
distinguishes *present* from *passed to the thing that needs it*.

Restored to `c533ccd`; `git status --short` empty, `git diff HEAD --stat` empty.

## 3. Two criteria that were WRONG, caught by applying the bar

Both passed pre-fix while looking like evidence. Neither would have been found by
counting assertions.

**AC-17d — a vacuous pass.** The observable fell back to the *pristine* seat,
which never had a `terminal` to begin with, so it compared `undefined` against
`undefined` and reported green. The fixture now threads the seat **tick 1 left
behind** (the stamped descriptor), and the criterion reds pre-fix. *A vacuous
pass looks exactly like a real one.*

**AC-19b — a red for the wrong reason.** The first version fed `planRevive` a
`null` when the sweep produced nothing. It went red — but on `'no session with
that pij id'`, i.e. it proved the descriptor was missing, not that revive changed
its mind. This is the s094 shape exactly. The helper now returns a verdict
**string** for a real descriptor, so the red reads `expected 'accepted' to
contain 'no terminal observation'` — revive was **accepting a live seat**, which
is the actual harm.

## 4. MUTATION-ONLY criteria — no pre-fix red is available, in principle

For these the observable is **byte-identical in both worlds**; only the reason
differs. Pre-fix the sweep is silent because it is **latched**; post-fix because
**transition row 3** says so. A pre-fix red here would have been an artefact of
something else in the test.

**Mutant M1** — transition row 3 (`if (descriptor.terminal !== undefined)
continue`) deleted, so a terminal+absent descriptor goes down the stamping path:

```
FAIL AC-10b does not write the still-dead butterfly at all
AssertionError: expected [ 'pij-90wkbu', 'pij-able-eel', …(13) ] to not include 'pij-unwilling-butterfly'
FAIL AC-17a writes nothing on tick 2 when both seats are still dead
AssertionError: expected [ …(2) ] to deeply equal []
FAIL AC-17b notifies nobody on tick 2 when both seats are still dead
AssertionError: expected [ { to: 'pij-parent', …(3) }, …(1) ] to deeply equal []
FAIL AC-17f does not write the still-dead seat on that same tick
AssertionError: expected [ 'pij-came-back', 'pij-still-dead' ] to not include 'pij-still-dead'
      Tests  6 failed | 30 passed (36)
```

All 15 seats rewritten every tick — the notice storm, reproduced.

**Mutant M2** — row 4 emits a notice on the clear path. Used because M1 reds
AC-17e only via the *other* seat, which is not that criterion's claim:

```
FAIL AC-17e notifies nobody about a seat that came back
AssertionError: expected [ { to: 'pij-parent', …(3) } ] to deeply equal []
      Tests  1 failed | 35 passed (36)
```

| criterion | label | sole proof |
|---|---|---|
| AC-10b, AC-17a, AC-17b, AC-17f | MUTATION-ONLY | M1 |
| AC-17e | MUTATION-ONLY | M2 |
| AC-1..AC-5, AC-12..AC-16, snapshot path, real-adapter capture | NEW-API | cannot fail first — symbols absent pre-fix |
| row 5, AC-19a/b/c controls | PRESERVED | pass before and after; never counted |

## 5. The flake question — three-world matrix, not a judgement

`harness checks` failed twice and passed twice on this tree, with a **different
red set each time**. Rather than call it a flake, all three worlds were run under
one identical induced condition (`--testTimeout=5000 --hookTimeout=5000`, the
pre-D-035 budget), serially, same machine:

| world | commit | contains s095? | total failures | `cli.integration` | `chores/drive` |
|---|---|---|---|---|---|
| **clean main** | `a2a50e2` | **no** | **19** | **10** | 9 |
| **control @ base** | `d4efbd3` | **no** | 7 | 1 | 6 |
| **this diff** | base + s095 | yes | 11 | 2 | 9 |

**Clean main — with none of this stream's code — fails the most, including ten
`cli.integration` cases.** This diff fails fewer than main, and the membership
varies across worlds. Only one named case appears in all three
(*"real pi and daemon-bound spawns carry unresolved and not-probeable plan
warnings"*), and it is present in clean main.

This is not a new discovery: `vitest.config.ts` already documents it (D-035) —
*"at 5s the full suite on a loaded dev box failed a DIFFERENT set of tests every
run … Every one of them passes when its file is run alone … a BUDGET problem, not
shared-state contention."*

**One thing that note does not cover, and should.** D-035 raised `testTimeout` to
30s but left **`hookTimeout` at vitest's 10s default**, and `testTimeout` does not
apply to hooks. The `harness checks` run at 05:16Z failed as
`Error: Hook timed out in 10000ms` inside `beforeEach` in
`skills/flow-pair/test/observe.test.ts` and `cli-observe.test.ts` — `cli-observe`
being one of the files D-035 names by name. **The documented fix is incomplete on
the hook path.** Recorded for the fleet; not fixed here (not this stream's files).

Unloaded runs, for completeness: whole repo green on this diff (**4090 passed**)
and on the control (**4040 passed**).

### 5b. Post-rebase re-measurement — and a firmer answer

The matrix above compared `a2a50e2` / `d4efbd3`. After the rebase, `origin/main`
is `19a9a8e`, which **is** this branch's base — so "clean main" and "my base"
collapse into one world, and the question becomes two-world.

Full `.pi/extensions/pij` suite, **no induced timeout**, same box, sequential:

| world | commit | contains s095? | run 1 | run 2 |
|---|---|---|---|---|
| **clean main** | `19a9a8e` | **no** | **green** (3456 passed) | **1 failed** (3455 passed) |
| **this diff** | `c533ccd` | yes | 2 failed (3516 passed) | 1 failed (3517 passed) |

**Clean `origin/main`, carrying none of this stream's code, fails on repeat** —
and it fails with the *same* error as this diff's run 2:

```
 FAIL  …/core/worktree.test.ts > WorktreeManager — AC-01 refusal matrix > refuses a dirty source checkout
Error: ENOTEMPTY, Directory not empty: /var/folders/…/T/pij-worktree-4knGNP
 ❯ .pi/extensions/pij/core/worktree.test.ts:31:38
     30| afterEach(() => {
     31|  for (const root of roots.splice(0)) rmSync(root, { recursive: true, f…
```

This diff's run 2 was byte-identical in shape, differing only in the temp-dir
name and which `AC-01` case happened to be holding the directory
(`refuses an existing destination before invoking worktree add`). Run 1's other
failure was `cli.integration.test.ts` on `display-message -p -t %7` — the
D-035 file, and a case that needs a live tmux server.

**Why this is not attributable to the diff, stated as evidence rather than
judgement:** the failure reproduces on a tree that does not contain the diff.
That is the discriminator the PM asked for, and it is now shown rather than
argued.

**Why "each passes alone" is *not* the argument being made.** Both named files
pass in isolation in both worlds (98 passed | 1 skipped, identically). That is
the signature of pollution or concurrency and proves nothing on its own — it is
recorded only to locate the mechanism, never as exoneration. The exoneration is
the clean-main red.

**The mechanism, which is worth naming.** `worktree.test.ts` shells out to real
`git` (`git init`, `git worktree add`) into `mkdtemp` directories and tears them
down with a recursive `rmSync` in a shared `afterEach`. On macOS a `git`
subprocess still flushing index/lock files into that tree while `rmSync` walks it
yields `ENOTEMPTY` — the directory is re-populated between the readdir and the
rmdir. It is load-dependent by construction, which is exactly why it never
appears when the file runs alone and why *which* case dies varies per run. This
is a distinct defect class from D-035's timeout budget: not a slow test, a
cleanup race. **Not fixed here — untouched by this stream — but it is a real bug
in a test, not noise, and it should be owned.**

## 6. A guard this stream nearly disabled — and the repair

`core/liveness-cost.test.ts` is a pre-existing structural guard whose stated
purpose is *"if someone swaps the ProcessPort for `ps`/`tmux`, liveness silently
becomes N forks per listing"* — **R2, this plan's headline risk, written down by
someone else months before this stream existed.**

It forbids `node:child_process` in `adapters/process.ts`, and it is right to: that
adapter is what `pij list` / `pij state` lean on. So the capture went into a new
module, `adapters/process-snapshot.ts`.

**That move silently narrowed the guard.** It watches a fixed file list that does
not include the new module, so after the move the property was defended nowhere:
a future author could make the snapshot per-descriptor — ~500 `ps` spawns per
600ms tick — and every sensor in the repo would stay green. *A check that
survives the thing it was watching, by watching where it no longer is, is worse
than no check: it reports safety it is not measuring.* That is this stream's own
defect, one level up.

Extended additively, with the reason recorded in the file so the narrowing is not
read as intentional:

- **exactly one adapter may read the process table**, and it is
  `process-snapshot.ts` (matched on `ps`/`pgrep`/`-Awwo`, not on "forks" — eight
  adapters fork, and most are tmux command lines with nothing to do with liveness);
- the snapshot module exposes a **whole-table** capture, not a per-pid probe;
- **`death-reconciler.ts` never captures the table** — it receives it as a value,
  which is what makes the per-row shape unwritable inside the ~500-descriptor loop.

Verified load-bearing by mutation — importing `NodeProcessSnapshot` into the
reconciler:

```
FAIL  liveness-cost.test.ts > … > the death reconciler RECEIVES the process table and never captures it
AssertionError: expected '// Pure cross-harness terminal-absenc…' not to match /NodeProcessSnapshot|process-snapshot\…/
```

## 7. What the build itself caught

The first `ps` parser matched only GNU's `lstart` order (`Sat Aug  8`); macOS
renders `Sat  8 Aug`. Every row fell through to the unreadable branch with an
empty command — **and an empty command is not a harness process, so the ladder
returned `absent` for every seat on the machine.** One capture bug would have
stamped the entire fleet terminal on the first tick.

Two guards, both tested: `resolveAgentLiveness` will not declare
`no-harness-process` over a subtree containing rows it could not read (that is
`unknown`), and `capture()` returns `{ ok: false }` when no row carries a readable
command line. **A classifier that treats "unreadable" as "not the thing I was
looking for" converts every capture defect into a confident negative.**

## 8. Incidental finding

`tsconfig.json` excludes `**/*.test.ts`, so `just typecheck` **never typechecks
test files**. A test may reference a symbol that does not exist and typecheck
stays green; only vitest catches it, at transform time. This is why "NEW-API tests
cannot fail first" is precisely *"they fail at vitest import time"*, not *"they
fail `just typecheck`"*.

## 9. Gates

Left column: at base `d4efbd3` (authoring time). Right column: **on the rebased
tree**, `c533ccd` atop `origin/main` `19a9a8e`.

> **Which tree was measured.** The AC-18 re-proof and the §5b matrix were run at
> `c533ccd`. The PM then committed `0278258` (comment-only in
> `adapters/process-snapshot.ts`, encoding F-406, plus the fleet ledger) while
> those runs were in flight. `harness checks --quick` was re-run at `0278258`
> and is green on all seven sensors; `daemon.ts` is byte-identical between the
> two commits, so the AC-18 evidence is unaffected.

| gate | at base | **rebased** |
|---|---|---|
| `tsc --noEmit` | PASS | **PASS** (exit 0) |
| `biome check` | PASS | **PASS** (exit 0; 6 warnings, all pre-existing, none in touched files) |
| `npx vitest run .pi/extensions/pij` | PASS | **3517 passed, 15 skipped, 1 failed** — the `worktree.test.ts` `ENOTEMPTY` cleanup race that **also fails on clean `origin/main`** (§5b) |
| AC-18 targeted | RED pre-fix / GREEN post-fix | **RED pre-fix / GREEN post-fix** (§2b), plus M3 |
| `npx vitest run` (whole repo) | PASS — 4090 passed | see above; delta is the same shared race |
| `harness checks --quick` | PASS | **PASS — all 7 sensors**: local-paths, typecheck, lint, test, windows-compat, pkg-audit, snapshots (smoke skipped) |

The `harness checks --quick` `test` sensor passes on the rebased tree, which is
consistent with §5b: the race is load- and interleaving-dependent, so it does not
reproduce on every run in either world.

## 10. Outstanding — for the PM

**AC-18 re-discharged — see §2b.** Done on the rebased tree: reachability slice
verified against the post-s092 `daemon.ts`, pre-fix red reproduced verbatim, and
M3 added to prove the guard is sensitive to *reachability* and not merely
presence. M3's result is the one to read: a whole-file grep (AC-18b) stays green
while the sweep receives nothing, so the brace-depth slice is the load-bearing
half. The pre-rebase proof in §2 is retained alongside rather than replaced.

**Two defects found in other people's files, neither fixed here:**

1. `core/worktree.test.ts` — real `git` subprocesses race the recursive `rmSync`
   in the shared `afterEach`; reproduces on clean `origin/main` (§5b).
2. `vitest.config.ts` D-035 — the documented fix raised `testTimeout` but left
   `hookTimeout` at the 10s default, and `testTimeout` does not cover hooks (§5).

**Nothing committed, pushed, or rebased by me.** Tree is at `c533ccd` with
`git status --short` empty.
