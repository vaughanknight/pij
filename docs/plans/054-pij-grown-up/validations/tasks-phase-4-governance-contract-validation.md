# Validation — tasks/phase-4-governance-contract/tasks.md

**Date**: 2026-07-17 · **Mode**: adaptive (lead + 1 independent critic) · **Verdict**: ✅ VALIDATED WITH FIXES

- **Contract**: cold-coder-actionable FINAL-phase dossier — rows 4.1–4.6 + all 12 ACs (via the sweep) + T006c carry-in; R3/R4 hard stops enforceable in task text.
- **Deterministic proof (lead)**: rows 4.1→T001/T002, 4.2→T003, 4.3→T004, 4.4→T005, 4.5→T007, 4.6→T008, T006c→T006 — complete; critic confirmed R3/R4 language execution-proof and the coverage sweep clean.
- **Critic findings (1 HIGH + 2 MED + 1 LOW, all folded)**:
  1. F1 HIGH — sweep chain couldn't GENERATE ~5 ACs (no project list/set, no spine-events filter exactness, no duplicate-append idempotence, no node show, no legacy seed) → chain extended with five explicit steps + AC-04's three verdicts spelled out.
  2. F2 MED — pij-skill-check.sh anchors wrong (:50/:78 → :47/:69; :78 pointed at the advisory soft_budget trap) → corrected both places.
  3. F3 MED — fence status of the gate script ambiguous (declining the edit leaves the check silently green) → explicit fence amendment ruled (IN-fence for T004 only) + mechanical grep proof in Done-When.
  4. F4 LOW — T002 core↔bin handoff unspecified → mechanism ruled: bin intercept before core dispatch (cli.ts:2693 precedent), core tables keep parity.
- **Consumers**: P4 coder packet; ship checklist; SW-7 reconciliation (T008).
