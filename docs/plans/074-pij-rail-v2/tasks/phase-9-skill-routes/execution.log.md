# Phase 9 execution log

## Baseline and scope

- Verified the packet worktree and binding at commit `9e61640`.
- `harness boot` passed typecheck and the full test suite before edits.
- The ambient machine `pij` comes from the canonical checkout and is pre-report;
  branch behavior is proved through the branch-local TypeScript CLI and tests.
- The P9 packet originally excluded `core/watchdog.ts`, but the live nudge still
  prescribed completion self-pause. Scope was granted for the nudge copy and its
  co-located test.

## Contract corrections

- **Role arrives from above, always.** `/pij ready` remains role-unknown.
  Governors designate at placement with
  `pij link <seat> --parent <governor> --role pm|worker`. Self-designating
  `worker` would manufacture the same false fact as JC-2 D5-b's rejected
  backfill and erase the role-unknown state.
- **P5 fixed the one-way door but left the sign pointing at it.** New work
  re-armed a self pause, but the watchdog nudge still said "If done, pause me."
  That instruction was the cause of the 47-of-51 paused population. The nudge
  now sends finished seats to visible, correctable, verifiable
  `pij report state done`.

## RED proof

Targeted command:

```text
npm test -- .pi/extensions/pij/core/watchdog.test.ts .pi/extensions/pij/cli.integration.test.ts .pi/extensions/pij/acceptance-sweep.test.ts
```

Result before route/product edits: **3 failed, 131 passed, 1 skipped**.

1. Watchdog copy still prescribed pause instead of `report state done`.
2. Skill guidance did not expose the report family axis.
3. PM routes lacked start/stop report steps and governor designation.

## Implementation

- Added mandatory start-of-work and stop-of-work `pij report now` steps to the
  pair and stream-orchestrator routes.
- Taught the report-family axis, inline-markdown support, newline refusal,
  `report question`, `report blocked`, and deliberate absence of a `working`
  semantic state.
- Made o-prime placement designate stream PMs and pair placement designate
  fleet workers through `link --role`; seats never self-designate.
- Removed completion/blocker self-pause teaching from routing and watchdog docs.
- Changed the self-teaching nudge's done branch to `pij report state done`.

## Final proof

- Focused P9 suite: **134 passed, 0 failed, 1 skipped**.
- `just typecheck`: passed.
- `just lint`: passed with the existing nine warnings and Biome schema notice;
  no P9 lint errors.
- Full suite: **200 files passed, 4 skipped; 3,734 tests passed, 0 failed,
  19 skipped**.
- `harness checks`: **8/8 sensors passed**, none skipped:
  local paths, typecheck, lint, test, Windows compatibility, smoke, package
  audit, and snapshots.
- `just self-check`: exit 0. The report-only package audit retained its existing
  REVIEW findings; snapshot closeout was
  `✓ snapshot-check: briefing.md SHA matches snapshots (cdf5f5b25001...)`.

## Harness observations

- `DL-003`: the ambient canonical-checkout CLI is intentionally behind this
  branch, so branch feature dogfooding needs a paved local CLI command.
- `DL-004`: the installed harness CLI rejects the routed skill's documented
  `observe --kind command`, showing skill/CLI schema drift.
- `COORD-004`: phase contracts should be checked mechanically against prior
  non-goals; 9.1 contradicted P2's explicit rejection of self-designation.
- `SUGG-002`: a behavior repair should trigger a live prescriptive-copy audit,
  or instructions can keep generating the state the mechanism just fixed.

The shared observe buffer contains 14 entries from this multi-phase seat. It was
left intact because materializing `.harness/records/retro/**` is outside the
flow-pair packet allowlist; the four P9 entries above are persisted here so the
phase report does not lose them.
