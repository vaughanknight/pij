# Phase 2 review — dlg-0003

**Verdict: REQUEST_CHANGES**

## P1 — concurrent lifecycle prunes can retain a departed session's stamp

`FsTickHeartbeatStore.forget()` is no longer single-daemon-only in this phase:
every `FsRegistry` receives this store by default, and lifecycle operations call
`forgetTick()` (`.pi/extensions/pij/adapters/fs-registry.ts:195-201,627-645,703-706,787-792`).
Those operations run in registry/CLI and seat processes, not solely under the
daemon lock.

The store's new `forget()` is an unsynchronised read-modify-write
(`.pi/extensions/pij/core/daemon/tick-heartbeat.ts:177-192`). Two concurrent
prunes of `{a, b}` can both read that record, then persist `{b}` and `{a}`;
whichever rename is last restores the other departed id. Its fixed
`tick-heartbeat.json.tmp` staging name (`:149-158`) adds a second collision
mode: either process can move or remove the shared temporary path and the
other failure is silently swallowed as best-effort telemetry.

This violates AC-13's requirement before the next tick: a fast reincarnation
of the retained id reads the stale overlay and is incorrectly treated as
fresh. Phase 1's fixed-temp-path rationale only held while the daemon was the
sole production writer; Phase 2 introduced independent lifecycle writers.
Use a concurrent-writer-safe update protocol (and a collision-safe temporary
path), then add a deterministic concurrent-prune test covering two different
ids. PID/UUID staging alone is insufficient without preserving both removals.

## Independent mutation evidence

All mutation invocations included `--expect`.

| Mutant authored for this review | Expected criterion | Result |
|---|---|---|
| Replace `snapshot: this.scrubTick(descriptor)` with `snapshot: descriptor` | AC-12c | **Killed** AC-12c exactly. The identity snapshot scrub is real, not an assertion-only claim. |
| Replace the `forgetTick()` body with `this.ticks.read()` | AC-13 | **Killed** AC-13, AC-13b, AC-13c, and AC-13d. The aggregate prune mechanism is observable. |
| Remove only the `revive()` prune | AC-13 | No kill. The fixture's earlier `dissolve()` prune masks this site. |
| Remove only the `unarchive()` prune | AC-13 | No kill. No criterion currently observes restoration's prune. |

The latter two are evidence gaps, not a claim that the present calls are
unreachable: `unarchive()` is the documented restore operation
(`.pi/extensions/pij/core/ports.ts:87-98`) and `revive()` calls it before its
own lifecycle transition (`adapters/fs-registry.ts:306-336`). Add focused
tests that seed a stamp after the preceding lifecycle transition and assert
each restore/revive prune independently.

## Other adjudications

- **Scrub:** verified at the descriptor durable-write boundary
  (`fs-registry.ts:296`), the identity snapshot (`:1128-1148`), and each
  direct descriptor publish introduced by revive, claim, archive, and
  unarchive. AC-12 uses the real `FsRegistry`; AC-12b drives the real send
  receipt path.
- **Overlay:** hot records receive it and archived fallbacks deliberately do
  not (`fs-registry.ts:223-237`). This is correct: a terminal archived record
  must not claim fresh liveness.
- **Cost and documentation:** `list()` reads the stamp map once before its
  descriptor loop (`:203-220`), and the read/readFile divergence is documented
  at both ends (`:151-166,1221-1237`).
- **Focused validation:** overlay/store/revive/archive tests passed (108
  tests); the harness boot typecheck passed. Its full test stage hit unrelated
  concurrent-test teardown failures in git-repository/worktree tests.
