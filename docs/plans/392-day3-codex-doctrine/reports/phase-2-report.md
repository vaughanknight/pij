# Phase 2 report — pi receiver queue consumer

## Claim

Phase 2 is implemented. The in-process pi receiver and `pij_send` now use the selected
message channel; sqlite performs claim -> `onInbound` -> ack, while fs retains its previous
watch and mark-read behavior.

## Artifacts

- `.pi/extensions/pij/index.ts`
- `.pi/extensions/pij/index.test.ts`
- `docs/plans/392-day3-codex-doctrine/tasks/phase-2-pi-receiver-queue-consumer/tasks.md`
- `docs/plans/392-day3-codex-doctrine/tasks/phase-2-pi-receiver-queue-consumer/execution.log.md`

## SHAs

- Phase 1 dependency: `69f1c4524c39340ff63c26ba498fd489ca3faeec`
- Phase 1 handover: `3501f8558276ade4e10e40a42e3ffd1d5e56816b`
- Phase 2 implementation: `621c846d9faa83140c6fd997f4fb2e9b49202481`

## Gates

- Full pij extension suite: **PASS** — 3923 passed, 15 skipped.
- Typecheck: **PASS**.
- Changed-file Biome: **PASS**.
- Repository lint and pij skill checks: known out-of-fence red debt.
- Harness composite: deterministic phase surfaces pass; aggregate remains red on the
  known missing-`pwsh`, lint, Windows-at-lint, and smoke sensors.

## Observations

- The consumer's handler is async only to preserve the acknowledgement boundary:
  `PijSession.onInbound` runs before `claimUnread`.
- Receipt rows reuse `onInbound`'s existing record-not-inject behavior, then become acked.
- `noteInboxScan` advances on sqlite polling as it already did on fs polling.
- Both long-lived receiver queues and short-lived `pij_send` queues have explicit close
  ownership.

## Open

- No live pi session was restarted; existing seats adopt the receiver on their next boot.
- Aggregate repository gate debt remains owned outside this phase.
