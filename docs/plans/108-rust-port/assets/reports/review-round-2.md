# Review round 2 — findings, fixes, evidence

**Reviewer**: `pij-right-wasp` · verdict **CHANGES**, 3 blocking · 2026-08-28
**PM**: `pij-revolutionary-lungfish` · **All three accepted; none refuted.**

Round 1 fixed the reported paths. Round 2 found that two of those fixes held only
for the cases I had checked, and that the commit itself was not reproducible. Same
shape all three times: *a promise that was true of the instances I looked at.*

## 1 — staging was unique per PROCESS, not per ATTEMPT

`daemon.key.staging.<pid>`, plus a pre-delete, meant two boots **inside one
process** shared a file: attempt A stages, attempt B deletes A's file and writes
its own, A publishes B's bytes and starts holding a credential nobody has. The
reviewer proved it with an out-of-tree probe that printed two unequal token/file
pairs on consecutive runs.

Fixed: staging names carry pid + clock + a process-local atomic counter; nothing
pre-deletes a path it did not create; a `create_new` collision retries rather than
adopting the existing file.

Regressions: `two_staged_keys_in_one_process_never_share_a_file` (publishes the
second while the first is still staged, then the first, asserting each publishes
its OWN bytes and no staging litter survives) and
`an_unpublished_staged_key_removes_itself`.

**Why round 1 missed it**: my regression booted two daemons in one process and
passed — because the second boot failed at the BIND, before staging mattered. The
test exercised the path without exercising the property.

## 2 — the schema guard covered every operation I remembered

`SqliteQueue::live_len` read the database without `require_current_schema`, while
the module doc claimed every db-touching operation checks. Round 1's regression
covered Registry get/put/tombstone and Spine append — a sample, not the surface.

Fixed: `live_len` guarded. The new regression **enumerates all ten public database
operations** across Registry, Spine and Queue, so the next operation added is
covered or the test fails. That is the difference between a test that checks the
cases I thought of and one that checks the surface.

## 3 — the commit was not reproducible with its own lockfile

`crates/daemon/Cargo.toml` gained `sqlx` as a dev-dependency; `Cargo.lock` did not
record it. Every local build passed because cargo **silently updated the lock** —
and the gate, running plain `cargo test`, was one of those builds. A fresh
`--locked` checkout could not build at all.

Fixed twice over: the lock is committed, and the gate gains a **`lock` stage**
(`cargo metadata --locked`) so a tree that only builds because the gate mutated it
can never report green again.

Proof from a clean export of the fixed commit (this is also ac-0001's real
receipt, which had been resting on documented steps rather than an execution):

```
$ git archive b7e18a19 | tar -x -C /tmp/locked-check
$ cd /tmp/locked-check
$ CARGO_TARGET_DIR=… cargo build --locked --workspace     → Finished in 34.56s
$ CARGO_TARGET_DIR=… cargo test  --locked --workspace     → passed=81 failed=0
$ git status --short (in the worktree)                    → 0 lines
```

## 4 — the one the probe surfaced without anyone reporting it

While diagnosing, the reviewer noted that a gate invocation "reused a binary
compiled from the probe export because its manifest path is embedded". That is a
defect in **my** gate, not in their probe: `arch::workspace_manifest_path` used
`env!("CARGO_MANIFEST_DIR")`, which bakes in the directory the binary was
*compiled* in. A `pij-gate` built once inside a temporary export tree judged that
tree from any working directory.

It was visible here only because the temp tree had been deleted, producing six
"No such file or directory" stages. **The dangerous shape is the silent one**: a
stale tree that still exists, and a gate reporting green for a checkout nobody is
looking at. Resolution is now at runtime — `$CARGO_MANIFEST_DIR` for THIS run,
then the current directory, then the compile-time path — and every candidate must
exist and declare `[workspace]` before it is used.

Recorded because a defect found while investigating another one is exactly the
kind that never gets written down.

## Gate

```
pij-gate verdict
  toolchain PASS  rustc 1.98.0 == pin
  lock      PASS  cargo metadata          ← new stage
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      PASS  cargo test
  arch      PASS  8 crates, 0 violations
```

Tests 78 → 81. Working tree clean after the gate (`git status --short` empty),
which is now a property the gate itself defends.


---

# Rounds 3 and 4 — the fixes were checked by tests that could not fail

Both later rounds found the same class, and it is the most useful thing this
review produced: **a regression that exercises the path without exercising the
property.**

## Round 3

1. **The lock stage could not detect a stale lock.** It ran
   `cargo metadata --locked --no-deps`, and without resolving the graph there is
   nothing to disagree with — 0 against a lock missing a dependency. The reviewer
   proved it by building the gate from one export and running it against a
   doctored one. Now an in-process full resolve, with the documented invocation
   `cargo run --locked` so the build that produces the gate cannot repair the lock
   first. Three tests over a generated two-crate workspace: current lock passes;
   stale lock fails **and is left byte-identical**; and `--no-deps` still returns
   0 on that same tree — kept executable so nobody re-adds the flag as a speedup.
2. **`StagedKey` was `Clone`** while its `Drop` deletes the staging file, so two
   values owned one path: dropping a clone destroyed the original attempt's key
   and `publish` failed with "No such file or directory". `Clone` removed.

## Round 4

The `Clone` removal shipped with a regression that **could not detect it coming
back**: the reviewer re-added `#[derive(Clone)]` and
`a_staged_key_survives_other_attempts_coming_and_going` still passed. It proves
attempts do not share paths; it does not prove the guard cannot gain a second
owner.

Fixed with a compile-time assertion — autoref specialisation, no proc-macro
dependency — that answers "does this type implement `Clone`" as a constant the
compiler chose. It carries its own sanity check (the probe must SEE `String` and
`BootKey` as `Clone`, or it would pass for the wrong reason), and the mutation was
re-run:

```
$ sed  #[derive(Debug)] -> #[derive(Clone, Debug)]   on StagedKey
$ cargo test --locked -p pij-daemon --test review_regressions \
    staged_key_must_not_be_clone_or_two_owners_share_one_drop -- --exact
test ... FAILED
  StagedKey must NOT be Clone: its Drop deletes the staged file, so a second owner
  deletes the first owner's key and `publish` fails with 'No such file or
  directory'. A guard that can be duplicated is not a guard.
$ (restore)                                          → 1 passed
```

clippy flagged the borrow on the two probes where the inherent method applies —
correctly — and stayed silent on the one where the borrow is the mechanism. The
two were removed; the load-bearing one is commented as such.

## Final gate

Six stages green under `cargo run --locked`, 86 tests, working tree clean.
