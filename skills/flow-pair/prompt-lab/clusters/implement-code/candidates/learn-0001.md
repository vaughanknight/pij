# Learning Candidate — learn-0001

- **Cluster**: implement-code
- **Run**: 2026-07-11T05-56-25Z-github.com-jakkaj-Fr
- **Delegation**: dlg-0001
- **Miss type**: implement-code
- **Created at**: 2026-07-11T06:29:34.719Z

## Summary

Coder placed a config-snapshot read (TerrainTuning.Current) on a public blind-query path (CanUse/CanDig) callable outside SimHost.Step — violating the platform's declared-read-points rule; caught by cold review one hop downstream of the contract doc

## Evidence

- rev-0001 HIGH
- consumer-guide-draft-s020.md:72-78
- fix-0001 subtractive

## Candidate prompt delta

Packet template line: config/tuning snapshots may be read ONLY at declared deterministic seams (command-drain resolutions); blind/availability queries must stay snapshot-free or route through a declared query seam

## Promotion status

Pending manual review. No automatic promotion: do not edit `active.md` automatically. Record any promotion decision in `changelog.md`.
