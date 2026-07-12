# Rulings — s041 inbox without tmux

This file is the durable ruling ledger for Plan 041. Later direct Jordan rulings
supersede earlier relayed defaults; superseded text remains recorded verbatim.

## R-001 — Read-state persistence

- **Relayed ruling (verbatim)**: `sidecar read-state`
- **Relayed by**: o-prime `pij-3vetx8`
- **Recorded source timestamp**: `2026-07-12T01:56:11.537Z`
- **Direct in-pane selection (verbatim)**:
  `Keep message files immutable and write one atomic read marker per message (Recommended)`
- **Direct selection timestamp**: `2026-07-12T00:36:50.878Z`
- **Disposition**: CONFIRMED AND REFINED. Immutable message envelopes plus
  per-message atomic marker sidecars are authoritative.

## R-002 — `--wait` default

- **Relayed ruling (verbatim)**: `finite --wait default`
- **Relayed by**: o-prime `pij-3vetx8`
- **Recorded source timestamp**: `2026-07-12T01:56:11.537Z`
- **Superseding direct in-pane selection (verbatim)**:
  `Wait indefinitely; optional milliseconds set a timeout (Recommended)`
- **Direct selection timestamp**: `2026-07-12T00:37:05.965Z`
- **Disposition**: SUPERSEDED. Bare `pij inbox --wait` is indefinite; an
  optional numeric value supplies a finite timeout.

## R-003 — Windows proof timing

- **Relayed ruling (verbatim)**: `platform-tests-now/Windows-runner-LATER`
- **Relayed by**: o-prime `pij-3vetx8`
- **Recorded source timestamp**: `2026-07-12T01:56:11.537Z`
- **Superseding direct in-pane selection (verbatim)**:
  `Add a Windows CI job for portable typecheck/lint/tests (Recommended)`
- **Direct selection timestamp**: `2026-07-12T00:38:11.468Z`
- **Further direct in-pane ruling (verbatim)**:
  `i think windows checks in to harness pleease /eng-harness-flow`
- **Further ruling timestamp**: `2026-07-12T00:38:37.007Z`
- **Disposition**: SUPERSEDED. Platform-neutral tests, a real `windows-latest`
  job, and a named engineering-harness sensor are in Plan 041 now.

## R-004 — Shared smoke debt is non-blocking for s041

- **Priority ruling (verbatim)**:
  `unblock and deliver the inbox work first. Your Phase 2 inbox implementation/review is approved; the Pi folder-trust smoke timeout is shared, unowned harness debt and is NON-BLOCKING for s041. Do not spend further s041 time modifying the smoke harness or wait for its assignment.`
- **Ruled by**: Jordan via o-prime `pij-primary-carp`
- **Ruling timestamp**: `2026-07-12T09:35:17.887Z`
- **Disposition**: ACTIVE. D-032/D-033 remain shared harness debt; Phase 2 closes
  on its approved review, targeted/full non-smoke sensors, Windows proof, and
  quick harness inventory. No s041 smoke-harness scope expansion is permitted.

## Source evidence

Exact direct selections and timestamps are preserved in:
`~/.copilot/session-state/6e470b55-8474-49d7-87ce-50a325420d64/events.jsonl`.
