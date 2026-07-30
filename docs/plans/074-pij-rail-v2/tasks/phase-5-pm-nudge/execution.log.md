# Phase 5 — Execution Log

**Run**: 2026-07-29T01-17-05Z-github.com-AI-Substr
**Agent**: pij-panicky-caribou
**Delegation**: dlg-0008

## Contract

- Phase 5 is governed by the plan's Phase 5 section plus findings F-16 and F-17.
- `evaluateResponse` remains blind to semantic state in this plan. Live evidence:
  this PM seat was classified SUSPECT while declared `waiting`, after the declaration
  had been refreshed twice. Generalising that detector is platform scope, not P5.
- Interval language records observed behaviour, not the configured setting: measured
  turns overshoot the configured interval by roughly 1.57x.

## Baseline

- `harness boot --json`: ready; typecheck and the full suite passed at `7ff92cf`.
- Existing `isFireDue` regression lock: 4 passed, 33 skipped. It pins activity
  re-anchoring, periodic freeze cadence, and disabled/paused/exempt short-circuits.

## RED

The three scoped test files produced 9 failures and 429 passes before production
changes:

- strict projected-PM eligibility admitted worker, unknown, prime, and
  prime-plus-PM-conflict descriptors;
- the never-reported and status-keyed PM schedules remained anchored to fresh
  ordinary activity;
- the floor and new-work helpers did not exist;
- neither task-set nor delivered-dispatch re-armed a self pause;
- the nudge omitted the paste-ready `pij report now` command.

## Implementation

- `WatchdogManager` now admits only `projectOrchestrationRole(session) === "pm"`.
- PM fire cadence uses `statusAt`, with `startedAt` as the always-present floor.
  Ordinary activity remains available to response/liveness detection but no longer
  postpones a PM report nudge.
- The nudge frame includes
  `pij report now "<what I just did>" "<what's next>"`.
- A new-work transition removes only a `self` pause. Disabled/operator state,
  compact pauses, and exemptions remain unchanged.
- Successful delivered dispatches and committed task assignments both apply that
  transition. A failed dispatch delivery leaves the self pause intact because no
  new work reached the seat.

## Mutation transcript

Each mutation reddened exactly its own guard:

1. Removed the exact-PM eligibility line: the eligibility test received
   `pm, worker, unknown, prime, conflict` instead of only `pm`.
2. Removed `startedAt` from the schedule-anchor candidates: the never-reported PM
   test produced zero fires instead of one at 100 ms.
3. Removed the task-set re-arm call: the assignment test retained
   `{ pausedBy: "self", pausedAtMs: 1 }`.
4. Removed the delivered-dispatch re-arm call: the dispatch test retained the same
   self pause.

After restoration, the three targeted files passed 438/438.

## Scope observation

- The packet allowed both production files but omitted their co-located integration
  tests. Scope was extended to `core/daemon/watchdog-manager.test.ts` and
  `core/cli.test.ts` before implementation. Allowing a subject while forbidding its
  existing proof home is an effective-contract defect that packet generation can
  detect mechanically.
- The first full suite then found the same omission for allowed `daemon.ts`:
  `daemon.test.ts` held one shipped watchdog fixture with no PM designation.

## Gate repair

- First full suite: 3,731 passed, 1 failed, 19 skipped. The sole failure was a
  daemon watchdog fixture with unknown role. Declaring that fixture PM restored
  the intended coalescing proof; no other `daemon.test.ts` scenario constructs a
  watchdog sidecar or expects a fire.
- First `harness checks`: 7 sensors passed; smoke alone failed because its live
  `smoke-peer` fixture was likewise undesignated. The executable proof lives under
  Plan 055's `proofs/` directory, but is invoked by `harness/scripts/smoke.ts`; it
  is a live test surface, not frozen narrative history.

## Final gates

| Gate | Result |
|---|---|
| `just typecheck` | passed |
| `just lint` | passed; 9 existing warnings and one schema-version notice |
| `just test` | 200 files passed, 4 skipped; 3,732 passed, 0 failed, 19 skipped |
| `just smoke` | all 11 scenarios passed, including `pij-watchdog` |
| `harness checks` | all 8 sensors passed; none skipped |

Suite reconciliation: Phase 4 ended at 3,723 passing tests. Phase 5 adds nine:
three pure watchdog tests, three manager tests, and three CLI re-arm tests.

## Harness lesson

Packet allowed-path validation must derive proof surfaces rather than rely on a
handwritten list:

- an allowed production file implies its co-located test file;
- any file reached by an executable gate is live regardless of whether its path
  looks historical;
- when one file mixes narrative and executable fixture code, change only the
  executed portion.
