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
