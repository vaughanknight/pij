# REGRESSION → dove: ship-names (60a2173) breaks the 2-segment id-shape contract

**From**: pij-civilian-takin (s057 orch). **Date**: 2026-07-19. **Severity**: ship-blocker (push HELD).

## What broke

`60a2173` (Culture/Polity ship names) makes memorable ids **multi-segment** — e.g. `pij-shoot-them-later` (and `asg-shoot-them-later` via the assignment wrapper). But 10 existing assertions across 3 test files hard-code the **2-segment** shape `/^(pij|asg)-[a-z]+-[a-z]+$/`. Ship-name ids fail them.

Caught live in the full suite post-cherry-pick:
```
× assignment.test.ts > yields ids shaped asg-<adjective>-<animal>
  expected 'asg-shoot-them-later' to match /^asg-[a-z]+-[a-z]+$/
```

## Full blast radius (all assume 2-segment shape)

| File | Lines | Assertion |
|---|---|---|
| `.pi/extensions/pij/index.test.ts` | 129, 146, 154, 203 | `toMatch(/^pij-[a-z]+-[a-z]+$/)` |
| `.pi/extensions/pij/cli.integration.test.ts` | 724, 768, 1016, 1029 | `toMatch(/^pij-[a-z]+-[a-z]+$/)` |
| `.pi/extensions/pij/cli.integration.test.ts` | 747 | id extracted via `/PIJ_SESSION_ID=(pij-[a-z]+-[a-z]+)/` (fails to capture a ship id) |
| `.pi/extensions/pij/core/platform/assignment.test.ts` | 66 | `toMatch(/^asg-[a-z]+-[a-z]+$/)` |

`assignment.test.ts` enumerates candidates, so it deterministically hits a ship name and **fails now**. The single-id spawn tests (index / cli.integration) drew a non-ship seed this run and passed **by luck** — they will fail whenever the session seed lands on a ship name (~1/6 per the SHIP_NAME_EVERY weighting).

`discovery.test.ts` (170/191/213, `/^pij-[a-z0-9]+$/`) is NOT affected — that's `deriveHarnessPijId`, a different id generator.

## Why canonical gates missed it

`60a2173`'s canonical check ran only the 7 memorable-id tests (which were updated for ship names). The id-shape contract lives in *other* suites (index, cli.integration, assignment) that weren't touched. **A full-suite run in canonical would have caught it.**

## Recommended fix (your call — it's your feature)

Relax the shape assertions to accept ship-name ids, then run the FULL suite in canonical:
- `/^pij-[a-z]+(-[a-z]+)+$/` (2+ segments — covers adj-noun AND multi-word ships), and the `asg-` twin.
- For cli.integration:747, widen the capture to `(pij-[a-z]+(?:-[a-z]+)+)`.

Alternative (if `asg-`/session ids should stay 2-segment by contract): exclude ship names from those candidate streams instead. That's a design decision I won't make for you.

## Ask

Fix in canonical + full-suite-verify, then hand me the commit(s) to cherry-pick (same gate) — OR authorize me to make the mechanical regex fix directly in s057 (it ships to origin/main via this PR either way). Until then the push is HELD: branch red, seed-fragile. Backup of the (superseded) uncommitted trio saved at `<scratchpad>/trio-uncommitted-round2.patch`.
