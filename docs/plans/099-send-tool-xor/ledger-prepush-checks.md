# s099 — ledger move: pre-push checks

Run these **on the merged working tree, after resolving, before pushing**. Not earlier — see
why below. Encoded here rather than left in a broadcast, because a rule that lives only in a
message is one I have to remember at the moment I am least likely to.

## Order

```bash
# 0. only proceed once #203 has landed — probe an artifact EXCLUSIVE to #203
git show origin/main:docs/how/fleet/ledger/s092-install-blocker.md >/dev/null   # errors => wait

# after rebase + resolve, in the working tree:

# 1. exactly one index section. THREE meaningful values, not two:
#      0 = not rebased yet (NOT a violation)   1 = pass   2 = the failure this exists to catch
#    never assert `< 2` or `!= 2` — a renamed heading passes silently as 0
test "$(grep -c '^## Per-stream' docs/how/fleet/ledger.md)" -eq 1

# 2. my rows are PRESENT in my own file
grep -c '^#\{2,4\} ' docs/how/fleet/ledger/s099-send-tool-xor.md

# 3. and GONE from the body — the half no presence-check can see
grep -c 's099' docs/how/fleet/ledger.md    # index row only; body rows => 0

# 4. my index cell flipped to `moved` and linked, at s099's numeric position

# 5. UNSCOPED — what did I touch AT ALL, not what did I touch where I was looking
git diff origin/main --name-status
```

## Why each, so a later reader can falsify them

**0 — exclusivity of producer.** `s092-…md` is downstream of #203 *and nothing else*. The
directory, the index table, and `s097-silent-detectors.md` all exist on main already because
s097 shipped first, so all three answer "has the migration landed" with a wrong **yes**. My own
file is downstream of *my* action, never of prime's merge, so it can never be evidence about it.
General rule: **a probe must be downstream of the event it claims to detect, and among those,
prefer the one with an exclusive producer.**

**1 — timing is the whole difficulty.** My own section is what makes the count 2, so it reads
as **1 in every check run before the merge** — on main, in #203, in my tree pre-merge. The
number only becomes wrong at the instant my change lands, which is after the last point anyone
looks. And `0` is not a pass: it means the heading text changed, which is also what a broken
pattern returns. **Assert exactly 1**; any weaker comparison lets a renamed heading through
silently.

**2 + 3 together, and 3 is the one nobody specified.** Relocation must hold in **both
directions**: rows present in the per-stream file *and absent from the body*. A half-migration
that left the body intact reads as correct from the index, and **every probe proposed today —
directory, index table, own file, exclusive producer — returns yes for it**, because they all
ask *what is present* and a duplicated row is present in both places.

> **Presence-checks cannot detect duplication.** Detecting it needs a count or an explicit
> absence assertion. That is the same blind spot as an unpaired absence assertion, pointed the
> other way.

**4 — the index enumerates all nine ordinals as `moved | pending`**, so no belief is formable
from an absence: a probe indexes one key and gets a definite answer. The residual is that a
forgotten flip makes "are there pending rows" say *not landed* forever — a false negative that
is silent to the prime and definite-looking to whoever is waiting. Flipping my own cell is
therefore not bookkeeping; it is the thing that unblocks other readers.

**Ownership of that last link, as of 2026-08-08**: prime now verifies the cell is flipped as
part of accepting close-out (`close-out.md`). I still flip it; prime still checks it; neither
side depends on the other remembering. The residual is closed by a second actor, not by care.

## Why check 5 exists — my own gate missed a stray file in my own PR

The earlier form of this checklist scoped its path assertion to `docs/how/fleet/`. A
`scratch-c1-brief.md` sitting at the **repo root** is outside that scope *by construction*, so
the check passed and the stray went into PR #218. Prime caught it by eye.

**The predicate was right and the scope was narrower than the blast radius.** A scoped check
answers *"what did I touch in the place I was thinking about"*; the question is *"what did I
touch"*. Those differ exactly where you were not thinking — which is where strays are, by
definition.

Same shape one axis over as s100's `600ms` vs `600 ms`: correct pattern, wrong extent. The
unscoped diff is one command and has no scope to get wrong.

## Applicability check, run 2026-08-08

s099 has **no** ledger heading and **no** `ledger.md` change — the two-index path does not apply
to me. My only diff against main under `docs/how/fleet/` is my branch being *behind*
(based on `a2a50e2`, predating s097's work at `81223c9e`), which shows as deletions in that
diff direction and is not an edit of mine.
