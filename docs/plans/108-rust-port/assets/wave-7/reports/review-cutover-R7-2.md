# Reviewer finding R7-2 — the per-unit worktrees share one branch ref

Reviewer `pij-central-crane`. Raised against the **arrangement**, not against either unit.
Filed as a file because the PM may act on it and a chat log is not a receipt (COMMON § 5).

**Severity: blocker for both wave-7 units, while no commit has yet been made from either new
tree.** The window is open; after the first commit it closes silently.

## Observed

The split into per-unit worktrees isolated the working trees but not the history:

```
$ for w in s108-rust-port s108-w7-cutover s108-w7-sidecars; do
    cat "$(git rev-parse --git-common-dir)/worktrees/$w/HEAD"; done
ref: refs/heads/s108/rust-port
ref: refs/heads/s108/rust-port
ref: refs/heads/s108/rust-port
```

Three working trees, **one branch ref**. Git normally refuses to check the same branch out
twice; this is only reachable with `--force`, and once forced git never re-checks.

## Demonstrated, not asserted

Throwaway repo, two worktrees forced onto one branch `work`. B holds uncommitted WIP; A
commits; **nothing touches B**:

```
=== both on the same ref? ===
wt-a  ref: refs/heads/work
wt-b  ref: refs/heads/work
=== wt-b (the OTHER unit) after wt-a committed — nobody touched wt-b ===
M  shared.txt
?? unit-b.txt
wt-b HEAD is now: a91cb90 unit A commits
wt-b shared.txt on disk: one
=== what a routine 'git checkout -- .' in wt-b would do to unit A's commit ===
after checkout, shared.txt: one
```

Three separate hazards in that output:

1. **B's HEAD moved without B doing anything.** B is now based on a commit it has never seen.
2. **A's committed change is presented to B as B's own staged local modification** (`M
   shared.txt`). Nothing distinguishes it from work B did.
3. **A routine restore in B reverts A's landed commit** and stages the reversion as ordinary
   work. B's next commit would then revert A's commit while looking like normal authorship in
   the log — no conflict, no warning, and a plausible commit message.

## Why this is the same defect the split was made to remove

The shared working tree meant a gate result could not be attributed to one unit. This means a
**commit** cannot be attributed to one unit — the instrument still cannot separate the thing it
measures from something else that was also true, one layer up. Isolating edits without
isolating history moves the collision from a place where it is visible (`git status` showing
two units' files) to a place where it is not (a clean-looking commit that silently reverts).

## Why it is live rather than theoretical

The fence amendment of 2026-08-31 grants `pij-mammoth-ostrich` the root workspace `members`
line, its crate manifest, and its allowlist block, and requires it to **regenerate the arch
fixtures** in its own typed commit. Those are exactly the files
`pij-mere-blackbird`'s gate verdict depends on, and fixture staleness has already been
independently rediscovered three times in one day. Two units regenerating and committing
derived files against a shared ref is the precise shape above.

## Remedy, and it is the plan's own precedent

Per-unit branches, merged by the composer — which is what every prior wave did:
`s108/w1-events`, `s108/w1-store`, `s108/w2-*`, `s108/w3-*`, `s108/w4-*`, `s108/w6-uds-open`.
It is also the merge-not-cherry-pick ruling the PM cited this morning: true ancestry, one
author per commit, composition as shared history. Suggested: `s108/w7-cutover` and
`s108/w7-sidecars`.

## RESOLVED 2026-08-31 — before any commit was made from either tree

The PM adopted the remedy inside the window: `s108-w7-cutover` → `s108/w7-cutover`
(`pij-mere-blackbird`), `s108-w7-sidecars` → `s108/w7-sidecars` (`pij-mammoth-ostrich`),
`s108-rust-port` → `s108/rust-port` (composer, unchanged); both pushed, composer merges at
composition as in waves 1-6. **No commit was lost** — the finding was raised while both units'
WIP was still uncommitted in the shared tree. A gate run in either tree now compiles one
unit's code on one unit's history, which is what makes the delta grading measurable.

## State at the time of writing

The shared `s108-rust-port` worktree still carries both units' WIP; neither coder has moved or
committed. **No commit has been lost.** Both coders have been told to move but not commit until
the branching is ruled.

Scratch repo used for the demonstration was created under `/tmp` and deleted afterwards; no
repository state was touched to produce this evidence.
