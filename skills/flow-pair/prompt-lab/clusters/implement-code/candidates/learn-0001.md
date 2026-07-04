# Learning Candidate — learn-0001

- **Cluster**: implement-code
- **Run**: 2026-07-04T00-54-46Z-github.com-Open-Sauc
- **Delegation**: dlg-0001
- **Miss type**: implement-code
- **Created at**: 2026-07-04T01:40:38.875Z

## Summary

Worker packet template hardcodes just-gates (just flow-pair-test/typecheck/lint) and pij_send tool; neither exists for a non-pi worker in a harness-CLI repo — orchestrator addendum had to override both

## Evidence

- dlg-0001 Stop Conditions vs addendum: gate is 'harness checks', transport is 'pij send <id>' CLI
- coder followed addendum cleanly (review rev-0001 Dim9 clean)

## Candidate prompt delta

Template should parameterize {gate_commands} and {report_transport} from repo signals (harness CLI present? worker harness mode?) at dispatch time

## Promotion status

Pending manual review. No automatic promotion: do not edit `active.md` automatically. Record any promotion decision in `changelog.md`.
