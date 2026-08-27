# Item 14 report — C9 watchdog mute wording

**Outcome**: PARTIAL — item gates and both line budgets are clean; the mandatory
repository-wide gate remains red outside this item fence.

## Claim

C9 now distinguishes reporting completion from muting supervision: `done` is a claim for
a verifier, `ready` is an active standing-assignment state, and neither silences the
watchdog. Only `blocked`, `question`, `hold`, and `waiting` park a seat and mute nudges.

## Runtime quote decision

The existing C9 quote was not faithful to current `buildWatchdogTurn`. Runtime now says
"If this unit of work is finished" and separately offers `ready` for an idle standing
assignment, so the quote was corrected. The pinned older substring "If done, run
`pij report state done`" remains only as a shorthand that the next sentence explicitly
calls "not a silencer".

## Operator guidance

- A finished unit reports `done` and remains watched for verification.
- An idle but available standing assignment reports `ready` and remains watched.
- A seat truly parked with no open work uses `hold`/`waiting`.
- Human/external blockers use `question`/`blocked`.
- Legitimate slow cadence uses `watchdog interval`; a seat never self-`pause`s.

## Orient mirror

Duty 7 in `orient-oprime.md` now states in one existing line that `done` is not a mute and
`ready` stays watched. The mirror was taken because it fits without line growth.

## Budget

- `00-routing.md`: 205 -> 205 lines.
- `orient-oprime.md`: 193 -> 193 lines.
- Net line delta: 0.

## Item gates

- `just pij-skill-check`: **PASS**, zero failures.
- CLI integration + acceptance sweep: **PASS**, 116 passed and 1 skipped.
- `harness checks`: **FAIL** in repository-wide lint, full test, windows compatibility,
  and smoke; local paths, typecheck, package audit, and snapshots pass.

## Blast radius

This is skill wording only. No watchdog runtime, state vocabulary, or nudge construction
changed.
