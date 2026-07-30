# Phase 4 — Execution Log

**Run**: 2026-07-29T01-17-05Z-github.com-AI-Substr
**Agent**: pij-panicky-caribou
**Delegation**: dlg-0007

---

## Surface ruling

The generated task prose and dispatch initially described `--note` as replaced by
the positional commands. The authoritative report-family ruling retains both
speech acts:

- `report question|blocked "<text>"` for a standalone ask.
- `report now "<did>" "<next>" --state question|blocked --note "<text>"` for
  progress plus an ask.
- `report state <word>` never accepts `--note`.

Parser work paused while shared HAZARD-1 work continued. The parent confirmed that
the plan wins and corrected the task file in commit `b9d55b5`.

## RED-first proof

The first report-family run failed 12 new tests. The failures covered missing
standalone/compound parsing, shared validation, first-person refusal, stateNote
stamping, clearing, and projection.

After implementing only the parser, shared validator, stamping, and projections
but deliberately leaving the stale-clearing destructure unchanged, the targeted
run isolated exactly the dangerous behavior:

```text
Test Files  1 failed (1)
Tests  3 failed | 307 skipped (341)

× state clear removes a stale stateNote with the semantic state
× a note-free report state removes the prior stateNote
× a fresh task set removes stateNote but preserves the opposite-lifetime status denorm
```

This proves the clearing failures were not parser or fixture failures.

## Implementation

- Added first-class `report question` and `report blocked` positional commands.
- Added compound `report now --state question|blocked --note`.
- Kept `report state` structurally note-free.
- Shared one 200-character, one-line validator across standalone and compound
  notes. Whitespace collapses before the length check; inline markdown remains
  verbatim.
- Reused the existing `state-set` write path and event shape. The note is a
  descriptor denorm only; no note field was added to the spine event.
- Stamped `stateNote{text,state,at}` from the stamped state event timestamp.
- Added `semanticState` and `stateNote` to `list --json`; added `stateNote` to
  JSON and human `node show`.
- Added `stateNote` to the stale-field destructure. `semanticState/stateNote`
  clear on state clear, note-free state changes, and task swaps, while
  `statusPrev/statusNext/statusAt/statusSeq` survive.
- Recorded the no-caller forward obligation beside `closeAssignment`, naming the
  assignment-pointer, semantic-note, and status field families.
- Enrolled both new commands and compound `--note` in control-plane usage; the
  real-bin help regression asserts all three spellings.

## HAZARD-1 mutation proof

Removed only `stateNote` from the stale-clearing destructure and ran each guard
separately:

```text
state clear:
Tests  1 failed | 340 skipped (341)
AssertionError: expected { text: 'which path?', ... } to be undefined

note-free report state:
Tests  1 failed | 340 skipped (341)
AssertionError: expected { text: 'which path?', ... } to be undefined

fresh task set:
Tests  1 failed | 340 skipped (341)
AssertionError: expected { text: 'waiting on review', ... } to be undefined

restored:
Tests  3 passed | 338 skipped (341)
```

Each transition independently proves the one-line guard; none relies on a sibling
test happening to fail.

## Harness observations

- `CONF-002`: the packet/task contract contradicted a later authoritative ruling;
  packet compilation needs an effective-contract check.
- `SUGG-001`: `/eng-harness-flow` documents `--kind command`, but the live
  `harness observe` CLI rejects it. The skill examples and CLI vocabulary should
  be aligned.

## Final gates

| Gate | Result |
|------|--------|
| `just typecheck` | exit 0 |
| `just lint` | exit 0; 9 existing warnings and one Biome schema-version info remain |
| `just test` | 200 files passed, 4 skipped; 3,723 tests passed, 0 failed, 19 skipped |
| `harness checks` | all 8 sensors passed; none skipped |

The suite grew by exactly 12 passing tests from the approved P3 baseline:
3,711 → 3,723.
