# Validation — tasks/phase-3-enforced-tree/tasks.md

**Date**: 2026-07-17 · **Mode**: adaptive (lead + 1 independent critic) · **Verdict**: ✅ VALIDATED WITH FIXES

- **Target**: `docs/plans/054-pij-grown-up/tasks/phase-3-enforced-tree/tasks.md`
- **Contract**: cold-coder-actionable P3 dossier + the SW-7 drift-risk vehicle; plan rows 3.1–3.4 + AC-08 + WS-1 + 3 P2-review carry-ins covered; SW-7 controls coherent/enforceable; no P1/P2 contract contradictions.
- **Deterministic proof (lead)**: row coverage 3.1→T001/T002, 3.2→T002/T003, 3.3→T004, 3.4→T005, carry-ins→T006, wrap→T007 — complete; critic verified all 8 anchor families exact (one exception = F3).
- **Critic findings (3 MED, all verified + folded)**:
  1. F1 — `--root` link event shape unruled (envelope `next?` is string-typed; `parent:null` ref would be malformed) → ruled in T004: `next` omitted + refs `[node:<child>]`, root hop in the replay Done-When.
  2. F2 — pane-exact parent derivation candidate set unpinned (cwd-filtered set would still gate parents; adopted-peer-in-worktree gets gratuitous parent-absent) → pinned FULL-registry pane matching + cross-cwd pane case in T001/T002.
  3. F3 — denorm carry-in anchor pointed at bin `cli.ts:1673`; real site is `core/cli.ts:1682` (call sites :2055/:2152) → corrected in all three places.
- **Critic adjudications retained**: parent-ABSENT (not E-NOID) on unverifiable identity is sound (WS-1 never-a-boot-blocker; human-from-terminal spawns); pane-exact is caller-verified; "prime spawns root" = prime parentless is a legal root (spawn cannot mint primes); s051-zone untouched proof achievable.
- **Consumers**: P3 coder packet; SW-7 declaration to prime; ship 4.6 reconciliation point.
