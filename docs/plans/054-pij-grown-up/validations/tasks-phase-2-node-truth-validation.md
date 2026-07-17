# Validation — tasks/phase-2-node-truth/tasks.md

**Date**: 2026-07-17 · **Mode**: adaptive (lead + 1 independent critic) · **Verdict**: ✅ VALIDATED WITH FIXES

- **Target**: `docs/plans/054-pij-grown-up/tasks/phase-2-node-truth/tasks.md`
- **Contract**: cold-coder-actionable P2 dossier; every plan §Phase 2 row (2.1–2.8) + AC-04/05/06/07/09/11 + V-05 + cycle-6 tombstone carry-in covered; no contradiction with P1 exported contracts.
- **Deterministic proof (lead)**: plan-row coverage 2.1→T001/T002 … 2.8→T010, carry-in→T011, wrap→T012 — complete; WS-6 vocabulary verbatim; anchors sourced from a fresh code-surface map of the worktree.
- **Critic findings (4, all verified + folded)**:
  1. HIGH — T010 axis-disagreement predicate contradicted AC-07/WS-6 (ruled case is semantic-active + system **idle** > threshold, the 1ca01u5 44h shape) → predicate corrected.
  2. HIGH — AC-06 verify-write half (`verifiedBy` flip) had no task/verb → `pij state verify` added to T004/T005 with AC-06 Done-When.
  3. HIGH — `core/platform/journal.ts` adjudication extension untasked (resolveOp hard-rejects non-project intents; resolveCommitted would hasOnce-replay assignment ops = J1-class forge; recoverPendingOps lacks assignment store) → T005 scope + contract-change flags corrected (expected signature change, port-first).
  4. MED — daemon-side platform architecture untasked (no ports on daemon; sync lock in tick loop; latch-vs-append ordering) → T008 extended: own adapters, skip-honestly on contention, latch-after-successful-append.
- **Consumers**: coder packet (fix dispatch), Phase 4 acceptance sweep (4.5 verify roundtrip now reachable).
