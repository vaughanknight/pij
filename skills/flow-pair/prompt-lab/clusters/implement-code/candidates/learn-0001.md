# Learning Candidate — learn-0001

- **Cluster**: implement-code
- **Run**: 2026-07-11T03-49-50Z-github.com-jakkaj-Fr
- **Delegation**: dlg-0001
- **Miss type**: implement-code
- **Created at**: 2026-07-11T04:16:52.188Z

## Summary

Coder self-invoked a code-review skill over its own diff mid-packet; human stopped it in-pane. Worker-implement packets must explicitly forbid review-skill invocation and state the role boundary: tests+gates green is the coder's bar; review happens in a separate clean agent.

## Evidence

- pane showed Code-review(gpt-5.6-sol) 'Review config platform phase' + git show HEAD diffing during dlg-0001
- Jordan ruling 2026-07-11

## Candidate prompt delta

Add to worker-implement template forbidden-actions: 'Do NOT invoke code-review or any review skill — your own tests/gates are your only quality bar; the fleet's cold reviewer owns review.'

## Promotion status

Pending manual review. No automatic promotion: do not edit `active.md` automatically. Record any promotion decision in `changelog.md`.
