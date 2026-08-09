# Pre-push checklist — s100, ledger rebase onto #203

> Written **before** the rebase, deliberately. I will do this later, possibly after a compaction,
> and every item here is something I currently know and will not necessarily still know then.
> **Capture-before-reap applied to my own future context.**

## Gate — PASSED 2026-08-08 20:38. #203 has landed; s092's file is on main.

> Verified with the sound probe below. Recorded here so a later reader does not re-run a gate that
> has already opened, and does not mistake this checklist for still-blocked.

### The gate that was used

```sh
git show origin/main:docs/how/fleet/ledger/s092-install-blocker.md
```

**Errors ⇒ #203 has not landed. WAIT.** This is the *only* sound probe.

**Do NOT use any of these — all three return a wrong YES**, because s097 landed first (inside
`81223c9e`, the #198 anomalies merge, *not* a separate docs PR) and a migration's first mover
necessarily creates the shared scaffolding its own change cannot land without:

| false-positive probe | why it lies |
|---|---|
| `docs/how/fleet/ledger/` exists | s097 created the directory |
| a per-stream index table exists | s097 wrote one (`ledger.md:1024`) |
| my own file exists | it is downstream of **my** action, not of #203 |

The class is **closed** — there is no fourth. Five of #203's six artifacts are exclusive to it;
the shared one (`ledger.md`) is the one everybody reached for first, because it has the
human-readable name.

## MANDATORY pre-push assertion — git may not warn me

My heading is `## Per-stream ledgers` (`ledger.md:9`). s097's on main is
`## Per-stream ledger blocks` (`ledger.md:1024`). **Different text, different table shape,
different line ranges ⇒ git may merge BOTH CLEANLY**, and I ship a `ledger.md` with two index
sections — having followed the "take theirs wholesale" instruction exactly.

**The de-collision file ending up with two indexes.** An absent signal read as an absent problem.

```sh
grep -c '^## Per-stream' docs/how/fleet/ledger.md   # MUST BE EXACTLY 1
```

**WHEN to run it — this is the whole difficulty.** *My own section is what makes it 2.* So it
reads **1** in every check I run **before** the rebase — on main, in #203, in my own tree. **The
number only becomes wrong at the instant my change lands, which is after the last point most people
look.** Run it on the **merged result**, in the working tree, **after resolving and before
pushing**. Any earlier moment returns the reassuring answer and proves nothing.

**THE GATE — two commands, neither naming a heading, a string, or a shape.**

The first constrains **what I touched**; the second constrains **what I did to the one shared
thing**. s095's single check covers only the second — I could pass it while having created a second
ledger file, edited a sibling's per-stream file, or dropped a stray file in the directory, because
**the hazard is not file-scoped.**

```sh
git diff origin/main --name-status -- docs/how/fleet/
#  EXACTLY TWO PATHS, no more:
#    M  docs/how/fleet/ledger.md
#    A  docs/how/fleet/ledger/s100-tick-heartbeat.md
#  Any third path, any M against a sibling's file, any D anywhere -> FAIL.

git diff origin/main -- docs/how/fleet/ledger.md
#  ONE hunk, ONE line: my own row, pending -> moved. Nothing else.
```

**Report the diff VERBATIM, never "it passed."**

This is stronger than anything keyed on a heading, a string, or a shape, because **it does not
identify my section — it asserts that I did not produce one.** It answers every question the
earlier versions were reaching for (did main's section survive · is mine gone · is exactly one
present · did I touch another stream's row) **without naming any identifier**, and it catches
things none of them do: a stray edit to another stream's row, a lost index, a whitespace change in
someone else's block. All fail it identically and loudly.

> **Assert that you generated NOTHING except the single cell you own.**
>
> **An assertion keyed on something you do not control is a bet on someone else's stability. An
> assertion keyed on your own diff cannot go stale, because its subject is your own action.**
>
> Three string-keyed versions of this check needed rewriting inside one hour — not because the
> reasoning was worse, but because they were **keyed on a moving object**. This is the
> exclusive-producer rule taken to its end: **the most exclusive producer of all is you.**

**Why this file previously carried four shape assertions, and why they stay as a DIAGNOSTIC:**
`#203` renamed main's heading to *my* wording, so both sections read `## Per-stream ledgers` and no
string distinguishes them. Shape did (main's is a nine-ordinal table; mine a bullet list). Those
assertions are sound and they compose usefully with the gate above — **the diff says PASS/FAIL, the
vector says WHICH STATE I am in when it fails:**

| | total `^## Per-stream` | table header | my bullet | my row |
|---|---|---|---|---|
| un-rebased | 1 | 0 | 1 | 0 |
| rebased, unresolved | 2 | 1 | 1 | 0 |
| resolved correctly | 1 | 1 | 0 | 1 |

Every state differs in a **different coordinate** — which is why no single scalar could separate
them, and five attempts to find one all failed. **A count collapses a set to a number; a single
assertion collapses a state space to a line.**

## The check no presence-probe can perform — BOTH DIRECTIONS

**Duplication is the failure mode every probe proposed today would miss**, because both halves are
present. Directory, index table, own file, exclusive producer — *every one of them asks what is
PRESENT*, and a duplicated row is present in both places, so all of them say yes.

A half-migration that left the body intact would read as correct from the index.

| assert | expected |
|---|---|
| my **s100** rows appear in `ledger/s100-tick-heartbeat.md` | present |
| my **s100** rows remaining in `ledger.md` body | **0** |
| my **s092** rows appear in `ledger/s092-install-blocker.md` | present — 11 of them |
| my **s092** rows remaining in `ledger.md` body | **0** |

> **I already ran half of this and did not notice.** Earlier I verified the eleven s092 rows were
> *present* in #203's file, listed individually rather than counted, and called it verified. **That
> was a presence check only.** Had #203 copied rather than moved them, my check would have passed
> and the duplication would have shipped. Presence was the easy half and I stopped there.

s092's relocation is o-prime's work, not mine — but I am the only party who knows all eleven of
those rows, so I am the only one who can check the absence half.

## The actual edit, once the gate passes

1. Rebase onto the new main.
2. Delete **my** `## Per-stream ledgers` section entirely — wholesale, never merged with theirs.
3. #203's index enumerates **all nine** wave ordinals as `moved | pending`. So my action is **not
   an insert** — it is **flip my own row (`s100`) from `pending` to `moved` and link it**. One
   cell, at my own ordinal's line. No insert-position question exists any more.
4. `grep -c '^## Per-stream'` ⇒ **1**.
5. `docs/how/fleet/ledger/s100-tick-heartbeat.md` unchanged throughout — it is my single-writer
   file and has never conflicted with anything.

## Then, and only then

Open the PR. **Not before the rebase** — a green earned against a base that moves within the hour
is stale rather than merge-ready, and has to be re-earned and explained. First green = only green,
against the base it will actually merge into.

## Why `pending` rows matter more than they look

A list of *what moved* makes an absence ambiguous between "not yet" and "no such stream". With
every ordinal present, **no belief is formable from an absence** — a probe indexes one key and gets
a definite answer, and *"has the migration landed"* becomes *"are there any pending rows"*, which is
downstream of the **whole** migration by construction rather than by hunting for an exclusive
producer.

## Rebase reconnaissance — measured before the rebase, not assumed

Main moved twice more (#200 s095's liveness fix, #205 a ledger column rename). Checked against my
own hunks rather than trusting a clean-merge assumption:

```
#200 in daemon.ts:  @@ -359,6 +359,40 @@   @@ -641,6 +675,10 @@
mine in daemon.ts:  @@ -63 @@ (import)   @@ -196 @@ (ctor)   @@ -286 @@ (tick loop)
```

**No overlap — and not by luck.** #200's regions are exactly the two granted to s095 (`:639-648`)
and s097 (`:354`) that I was told to stay out of. Three concurrent writers on the composition root,
zero semantic conflicts, in the one surface a file-ownership partition *cannot* partition.

**The `Daemon` constructor signature on new main is byte-identical to my base** (ends at
`watchdogManager?: WatchdogManager,`), so my parameter-property injection appends cleanly. #200's
`:359` change is inside an object literal in a *method body*, not the class constructor.

**Still re-derive, do not carry over.** My constructor hunk sits at `:196` and #200 inserts at
`:359`, so line numbers shift where content does not conflict. **A clean merge is evidence about
TEXT, never about WIRING** — re-verify the three hunks land where expected and re-run the gate
after rebasing, because still-present and still-load-bearing are different claims. That is my own
P1's lesson: the tombstone guard was still present, still correct, and no longer on the path.

**#205's column rename cannot affect the gate**, because the gate names no column, heading, or
shape — it asserts only what I touched and what I did to the one shared file.


## Verified against main AFTER #203 landed (not assumed from the ruling)

```
origin/main ledger.md:6    ## Per-stream ledgers
origin/main ledger.md:12   | stream | slug | ledger | rows relocated? |
origin/main ledger.md:22   | `s100` | tick-heartbeat | `ledger/s100-tick-heartbeat.md` | *pending* |
```

**My row already exists on main as `pending`.** So the edit is exactly what o-prime said it would
be — **flip one cell**, no insert, no position to choose. The column header is `rows relocated?`
(#205's rename), which is why the gate names **no** column: a header rename cannot invalidate it.

**Note my own section is still in my branch's `ledger.md` and must be deleted wholesale** — main's
heading is now identical to mine (`## Per-stream ledgers`), so only the SHAPE distinguishes them:
main's is the table above, mine is a bullet list.

## Rebase reconnaissance, re-run after main moved 14 more commits

```
main's daemon.ts hunks:  @@ -359 @@   @@ -641 @@
mine:                    @@ -63 @@ (import)  @@ -196 @@ (ctor)  @@ -286 @@ (tick loop)
```

**Still no overlap after 14 further commits** — main's regions remain the two granted to s095
(`:639-648`) and s097 (`:354`). The file-ownership partition has now held across two independent
waves of merges into the composition root.

**Still re-derive rather than carry over**: a clean merge is evidence about TEXT, never about
WIRING.
