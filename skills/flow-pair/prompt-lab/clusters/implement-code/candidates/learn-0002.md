# Learning Candidate — learn-0002

- **Cluster**: implement-code
- **Run**: 2026-06-23T0835Z-flowpair-p8-dogfood-d1
- **Delegation**: dlg-0032
- **Miss type**: implement-code
- **Created at**: 2026-06-23T09:20:57.729Z

## Summary

Dedup keys must be the resolved identity, not a rendered display string. A dedup keyed on notice TEXT passed 44 tests + cross-model review yet failed in real use because overlapping/nested watch roots render the SAME file under different rel-path strings. Always dedup on the normalized absolute identity (path/inode), keep the display string separate.

## Evidence

- dlg-0030 lifecycle fix APPROVED gates+review but failed in real use (screenshot: flow-pair/lib/identity.ts vs lib/identity.ts dupes)
- dlg-0032 fixed by deduping on <kind>\0<absPath> key while preserving human-facing text
- independent mutation 2 RED->47 GREEN

## Candidate prompt delta

Dedup keys must be the resolved identity, not a rendered display string. A dedup keyed on notice TEXT passed 44 tests + cross-model review yet failed in real use because overlapping/nested watch roots render the SAME file under different rel-path strings. Always dedup on the normalized absolute identity (path/inode), keep the display string separate.

## Promotion status

Pending manual review. No automatic promotion: do not edit `active.md` automatically. Record any promotion decision in `changelog.md`.
