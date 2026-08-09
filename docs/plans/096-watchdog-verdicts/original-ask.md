# Original ask

Stream `watchdog-verdicts` (s096), wave `w1-hardening`, prime `pij-continuing-ermine`.

Brief on disk:

- `~/.pij/pij-continuing-ermine/briefs/00-fleet-onboarding.md`
- `~/.pij/pij-continuing-ermine/briefs/05-watchdog-verdicts.md`

## Issues

- **pij#161** — `responsive` is the initialisation value, so a fire that examined no
  evidence emits a health verdict. Live instance: a `lifecycle: dissolved` seat with a
  0-byte capture from a pane that no longer exists was certified `responsive` to its
  watcher.
- **pij#148** — for an idle seat with no dispatch, `stalled` is an absorbing state, and
  the only self-service escape is to misreport its own state.

## Charter constraints (from the brief, verbatim in substance)

- **Deliverable**: implementation PR. Green CI, PR up, **do not merge**.
- **Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s096-watchdog-verdicts`
  on branch `s096/watchdog-verdicts`. Never the main checkout.
- **Plan ordinal**: 096 (the stream ordinal, not the next free plan number).
- **Owned files (exclusive)**:
  - `.pi/extensions/pij/core/watchdog.ts`
  - `.pi/extensions/pij/core/daemon/watchdog-manager.ts`
- **Explicitly not owned**: `core/anomalies.ts` (stream 6), `core/state.ts`,
  `core/platform/types.ts` (stream 4), `core/cli.ts`, `cli.ts`, `pa-capability.ts`,
  the daemon bootstrap.
- **#155 is not mine** (stream s095). What eligibility *consults* is mine; how
  `terminal` is *set or cleared* is theirs.
- **Scope of the new verdict value**: the verdict type, the manager, and the watcher
  notice. Not `pij list`, not the status surfaces. Any consumer that would silently
  mis-render a new enum value is **reported**, not fixed here (pij#153 shape).
- **Do not weaken the recovery disqualification** — it correctly encodes pij#136.

## Done

A green PR where a fire that examined nothing cannot emit a healthy token, a seat that
answers every nudge cannot reach `stalled`, and both are proven by tests that **fail
without the fix**.
