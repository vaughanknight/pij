# s040 T009 live proof
**Daemon lease**: `lease-28b97565-749c-4406-86cd-b336d367f306`
**Reviewed patch**: `5e17053e023457184a86605dc36f39c6fe0f442ed5dafe949b512c3709ecc877`
**Review verdict**: APPROVE

| Probe | Evidence | Verdict |
|-------|----------|---------|
| Reviewed daemon restart | PID `66261` -> `39754`, window `@415`, fresh tick | PASS |
| Existing memorable delivery | `pij-concrete-reptile` replied `reptile-post-restart-ack S040-REPTILE-612` | PASS |
| Fresh memorable spawn | `pij-medieval-jaguar`, bound, self-reported exact id | PASS |
| Safe pending adopt | `pij-endless-cuckoo` began pending with no-global diagnostic | PASS |
| Autonomous recovery | daemon init -> in-pane phonehome -> exact UUID bound, no manual injection | PASS |
| F004 no identity theft | env-only resolver + reviewer delayed-directory byte/tuple proof | PASS |
| Review | F001-F004 closed; Dim-0 mutation RED/restore/GREEN | PASS |
| Full deterministic gate | typecheck, lint, test, smoke, package audit, snapshots | PASS |

## Notes

- Receipt wait can time out before eventual delivery/peer acknowledgment.
- `pij-gigantic-goat` was dead at probe time and was not presented as evidence.
- Full deterministic gate and cleanup follow this report.
- Owned coder/reviewer/probe peers were dissolved after evidence capture.
- `harness checks` passed all six sensors; report-only package-manifest timestamp churn
  was restored to its pre-check bytes.
