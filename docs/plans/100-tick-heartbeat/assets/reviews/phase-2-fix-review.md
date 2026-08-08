# Phase 2 fix re-review — dlg-0003-fix

**Verdict: REQUEST_CHANGES**

## P1 — a tick from the departed incarnation defeats the stamp-qualified marker

The marker must distinguish an actually reincarnated id from a tick that
snapshotted the *previous* incarnation. It cannot: `Daemon.tick()` collects
`ownedIds` from `registry.list()` and only then calls `heartbeat.write()`
(`.pi/extensions/pij/daemon.ts:298-303`). Those processes are independent of
the lifecycle paths that call `forget()`.

The following permitted interleaving leaves a stale liveness overlay:

1. The map contains `pij-a: S`; the daemon snapshots a still-live `pij-a`.
2. Another process dissolves/removes `pij-a` and writes the marker for `S`.
3. The tick publishes its old snapshot as `pij-a: T`.

The exact-stamp rule then treats the marker for `S` as inert and either sweeps
it or ignores it, so `read()` returns `T`. The existing supposed-reincarnation
test establishes exactly that behavior for an old marker and later stamp
(`tick-heartbeat.test.ts:324-335`). A later stamp proves only that a tick ran;
it does not prove it ticked the new incarnation. The protocol therefore
reopens the AC-13 stale-reincarnation window whenever lifecycle and daemon
processes overlap.

The marker needs an incarnation/generation identity that both the tick snapshot
and lifecycle operation carry, or the two operations need a protocol that
serializes/fences the snapshot and lifecycle transition. An id plus timestamp
cannot make that distinction.

## P1 — marker-directory cleanup can silently drop a prune

The claimed no-shared-state property is also false between a prune and a tick:
the marker directory is shared mutable state. `forget()` creates it and then
writes the marker (`tick-heartbeat.ts:360-365`), while `write()` sweeps and
removes an empty directory (`:305-335`).

The daemon can remove the empty directory after a pruner's `mkdirSync()` but
before its `writeFileSync()`. The latter gets `ENOENT`, which `forget()` silently
swallows (`:363-369`), leaving the stale stamp visible. I reproduced that exact
filesystem ordering on Darwin: create directory -> `rmdirSync()` -> marker
write yielded `{"markerWrite":"ENOENT","staleStampStillVisible":true}`.

`rmdirSync()` does atomically refuse a non-empty directory on this platform
(`ENOTEMPTY`), so the deleted emptiness guard was correctly unnecessary for
that narrow check. It does not make parent-directory lifetime atomic with a
concurrent marker creation. The protocol must keep the marker parent stable or
coordinate/retry creation until its marker is durably present, with deterministic
coverage of this interleaving.

## Determinism and reincarnation adjudication

- Two independent prunes of distinct ids do commute in the absence of a
  concurrent sweep: they only create distinct marker files. The sequential
  tests at `tick-heartbeat.test.ts:245-262` demonstrate that narrow property.
  They are not a concurrency proof: the old map read-modify-write implementation
  would also pass when called sequentially. The simulated stale-map overwrite
  test at `:278-290` usefully covers the old lost-update shape, but neither
  test covers either prune--tick P1 above.
- The real reincarnation behavior itself is correct: a marker for `S` does not
  mask a map entry at `T`. The problem is that current inputs cannot tell a
  genuinely reincarnated `T` from an old-incarnation tick at `T`.

## Independent mutation evidence

All mutation invocations used `--expect`.

| Reviewer-authored mutant | Expected criterion | Result |
|---|---|---|
| Replace the marker `writeFileSync(...)` in `forget()` with `;` | `prunes one id and leaves every other stamp intact` | **Killed** (seven marker/prune tests failed). |
| Replace `marker && out[id] === stamp` with `marker` in `applyForgotten()` | `does not mask a stamp a LATER tick issued, with the marker still on disk` | **Killed** (the named test and the pure superseded-stamp test failed). |

The targeted heartbeat/store and overlay suites otherwise pass: 66 tests.
