# Learning Candidate — learn-0001

- **Cluster**: implement-code
- **Run**: 2026-07-29T01-17-05Z-github.com-AI-Substr
- **Delegation**: dlg-0001
- **Miss type**: implement-code
- **Created at**: 2026-07-29T02:15:53.569Z

## Summary

A worker test written against the FIXED behaviour can pass straight through the guard that implements the fix, because it drives the success path where the guard is a no-op. Require a mutation transcript in the packet, not a claim that tests pass.

## Evidence

- s074 P6: the post-write verification guard in runAdopt was replaced with if(false) and T002 stayed GREEN
- reviewer found it, orchestrator independently reproduced it (T002 green in 578ms with the guard dead). Root cause: T002 drove the successful revive route, so the descriptor was bound whether or not the verification block ran. Fix required extracting a pure verifier (verifyPersistedAdoptDescriptor) so each of the three rejection arms was directly reachable
- after that, mutating any single arm turns T002 red - verified independently on the pane-mismatch arm.

## Candidate prompt delta

In worker-implement packets for CODE clusters, require the worker to state, per new guard or branch it adds, the mutation it ran to prove a test covers it (expression broken, command, RED output, restore, GREEN). Green tests are not evidence that a guard is tested; only a failing mutation is. Ask for the transcript in the report schema rather than trusting testsPassed.

## Promotion status

Pending manual review. No automatic promotion: do not edit `active.md` automatically. Record any promotion decision in `changelog.md`.
