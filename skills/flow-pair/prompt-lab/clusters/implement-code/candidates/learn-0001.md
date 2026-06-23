# Learning Candidate — learn-0001

- **Cluster**: implement-code
- **Run**: 2026-06-23T0835Z-flowpair-p8-dogfood-d1
- **Delegation**: dlg-0030
- **Miss type**: implement-code
- **Created at**: 2026-06-23T08:47:54.295Z

## Summary

Steer-dedup lifecycle bug: a fix can pass gates + a unit mutation yet still be a false green if the reproduction skips the real host event ordering (current turn_end fires BEFORE the consuming turn_start). Always model the REAL lifecycle ordering, not the easy adjacent one; have the cross-model reviewer reason about the host lifecycle, not just the diff.

## Evidence

- dlg-0028 first fix (turn_start->turn_end) APPROVED by gates + orchestrator mutation but was a false green
- cross-model reviewer dlg-0029 caught the current-turn-end-survives gap
- dlg-0030 two-generation SteeredNoticeTracker fixed it
- independent onTurnEnd-clears-awaitingConsumption mutation 2 RED->44 GREEN

## Candidate prompt delta

Steer-dedup lifecycle bug: a fix can pass gates + a unit mutation yet still be a false green if the reproduction skips the real host event ordering (current turn_end fires BEFORE the consuming turn_start). Always model the REAL lifecycle ordering, not the easy adjacent one; have the cross-model reviewer reason about the host lifecycle, not just the diff.

## Promotion status

Pending manual review. No automatic promotion: do not edit `active.md` automatically. Record any promotion decision in `changelog.md`.
