# s082 — `pij chore` primitive

## Plan 076 — implementation

- **Window**: 2026-08-02T01:16:32Z–01:46:52Z
- **Outcome**: all 17 tasks complete; final `harness checks` green.
- **Delivered**: union-merged seat/repo/fleet chore definitions, per-seat
  fingerprint and pending-delta state, ack-only baselines, bounded shell probes,
  durable full-probe cadence, receipt-first removal, CLI/docs/domain wiring, and
  fresh-process drive-it proof.
- **Proof**: 51 focused chore/PA tests plus the full local-path, typecheck, lint,
  test, Windows, smoke, package-audit, and snapshot inventory.

### Difficulties

1. The first full smoke run lost a disposable tmux pane during package
   bootstrap and timed out; the focused retry and final complete gate passed.
2. Plan 078's newer PA capability boundary required subverb-aware classification
   so a PA can run/list/ack chores without authoring or removing roster entries.
3. Cold review found that deleting a roster row before state purge could make a
   failed removal non-retryable; the order is now receipt, purge, delete.

### Magic wand

Make the smoke driver classify a vanished disposable pane during bootstrap as a
named retryable harness failure and retry that scenario once, rather than
surfacing a generic capture error followed by an idle timeout.
