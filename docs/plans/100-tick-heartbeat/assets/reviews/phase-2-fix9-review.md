# Phase 2 fix9 re-review - 2ce6ca43

**Verdict: REQUEST_CHANGES**

## P1 - an unconditional repair claim remains outside the two corrected copies

The two claims changed in this commit are now correct: a later heartbeat write
is explicitly conditional, and neither the terminal-to-terminal nor
spawn-bind over-drop is presented as a guaranteed repair.

But the same false premise remains in the heartbeat's own durability rationale:

- `core/daemon/tick-heartbeat.ts:3-4` says a `lastTickAt` lost in a crash is
  “regenerated 600ms later BY DEFINITION”.
- `core/daemon/tick-heartbeat.ts:170-175` justifies omitting `fsync` because
  “the next tick regenerates it 600ms later”.
- The plan and PR body repeat that assertion; the PR body also says a crash
  loses at most one tick's stamp.

None is an unconditional guarantee. `runDaemon()` merely registers a
`setInterval` callback; a stopped/crashed daemon has no next tick, and an
event-loop-delayed callback is not bounded to 600ms. Readers correctly
degrade a missing stamp to `unverified`, so the no-durability decision remains
sound, but its rationale must be conditional: the value is rebuilt on a
subsequent daemon tick if one runs. Until then, it is absent.

This is the same correction requested for the two new copies. It is a
documentation correctness P1 in the explicitly requested whole-PR repair
claim audit, not a behavior regression.

## Confirmed

- The current diff changes exactly one non-comment line: the criterion name.
  The renamed P1i correctly calls the later heartbeat write conditional.
- `Daemon.tick()` writes the heartbeat before `driveSession()` in the same
  synchronous tick. A successful pending-to-bound `applyBinding()` persists
  through the registry predicate and removes the entry that tick just wrote.
  A future interval callback, rather than expiry, is the only possible
  re-stamp.
- The revised source comments correctly explain that writer/repairer
  co-location supplies no causal guarantee for another tick. Their historical
  false claims are clearly recorded as deleted rather than retained as
  hedged assurance.

No reviewer-authored mutant was warranted: this commit has no behavioral code
change, and the remaining defect is an independently verifiable documentation
claim.
