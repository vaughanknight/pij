# Item 10b execution log — pane-misbind bind guard

**Delegation**: `dlg-0015`
**Worker**: `pij-remote-falcon`
**Base**: `10483d8` + item 10a `03d7bac`

## TDD RED

The first five-file run reported 7 failed, 345 passed, and 2 skipped:

- terminal history plus a live pane reuse stayed ambiguous in `resolveSelf`;
- caller-parent derivation returned no parent for the same reuse;
- duplicate live pane owners did not return `E-AMBIG`;
- the source sweep found nine ad-hoc runtime comparisons;
- a foreign planned Copilot session still bound;
- a stale pending snapshot rebound over durable dissolved truth;
- the real daemon replay mutated the dissolved incident seat.

A separate Claude discovery mutant also proved RED: a fresh transcript bound even though
the pane process explicitly named a foreign native session.

## Implementation

- Added tagged-union `resolveLivePane` in `core/discovery.ts`. It excludes `dissolved` and
  `failed`, returns undefined for no live target, and returns `E-AMBIG` for duplicates.
- `IndexState.resolvePane` now exposes the same contract over its lifecycle-filtered
  delivery-target index.
- Routed discovery, spawn parent derivation, core CLI self attribution, focus registration,
  orchestration, agent spawn, chore attribution, current registration, and daemon gone-pane
  ownership through the shared resolver.
- Added a runtime source sweep that rejects any new direct `.paneId ===` resolution. The
  only exemptions are the shared resolver and `pendingPaneOccupant`'s explicit
  pending/ready pre-bind check.
- `driveSession` reads current registry truth before any pane mutation and refuses terminal
  descriptors. Planned Copilot/branched-Claude binding requires an exact parsed session-id
  match from the process subtree; Copilot planned ids must be canonical UUIDs.
- Auto-id Claude/Codex binding still derives the native id from the new transcript/rollout,
  then requires a matching harness process with no contradictory native id.
- The daemon caches one process-table snapshot per tick and shares it between bind guards
  and death reconciliation, preserving the existing one-capture source tripwire.
- Incident replay drives two real `Daemon.tick` passes with a durable pane-less dissolved
  seat, queued preamble, stale pending snapshot, and fresh unregistered foreign Copilot
  pane. It observes zero pane sends, zero bind persistence/logs, and zero ready notice.
- Finding C's `sqliteOf(this.channel)` gate was not changed.

## Gates

- Targeted item/integration set: 408 passed, 4 skipped.
- Full `npx vitest run .pi/extensions/pij/`: 3,974 passed, 15 skipped.
- `just typecheck`: passed.
- Scoped Biome over all changed TypeScript: passed.
- `harness checks`: local paths, typecheck, package audit, and snapshots passed;
  repository-wide lint, full test, windows compatibility, and smoke failed.
- `just self-check`: stopped at the same out-of-fence repository lint failures.

## Outcome

All four item-10b parts are implemented. The phase remains `PARTIAL` because the
repository's mandatory full gate is red on out-of-fence work.
