# Learning Candidate — learn-0001

- **Cluster**: implement-code
- **Run**: 2026-06-28T12-30-47Z-github.com-AI-Substr
- **Delegation**: dlg-0001
- **Miss type**: implement-code
- **Created at**: 2026-06-28T13:11:13.186Z

## Summary

Semantic regex split + AND-gated condition: coder left ambiguous tokens (model.*overloaded, resource_exhausted) in the TERMINAL class (should be transient) and implemented a liveness gate on 'not working' alone, dropping the plan's AND-staleness condition. Both needed a fix round.

## Evidence

- plan-024 dlg-0001 APPROVE? no -> FIX_REQUIRED -> dlg-0002 APPROVE_WITH_NOTES. Review: 529/resource_exhausted still classified quota (AC-02)
- gate keyed on state===working not (not-working AND lastEventAt stale > STALE_AFTER_MS) per AC-03/T004.

## Candidate prompt delta

When a packet asks to split a set by semantic class, instruct the worker to enumerate EVERY token's target bucket explicitly and quote the plan's exact transient-vs-terminal lists (no token left ambiguous). When the plan states a condition as 'A AND B' (e.g. not-working AND stale), require BOTH in the impl and a dedicated test for each half (incl. the negative: A-but-not-B must not fire).

## Promotion status

Pending manual review. No automatic promotion: do not edit `active.md` automatically. Record any promotion decision in `changelog.md`.
