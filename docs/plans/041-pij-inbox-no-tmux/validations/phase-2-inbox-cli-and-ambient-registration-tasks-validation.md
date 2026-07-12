# Validation — Phase 2 tasks

- **Validated**: 2026-07-12T16:18:00+10:00
- **Target**: `docs/plans/041-pij-inbox-no-tmux/tasks/phase-2-inbox-cli-and-ambient-registration/tasks.md` @ `3394723c626792da222d0a81e050bed59b9a9c3c`
- **Contract sources**: Plan 041 Phase 2 and AC-01/04/05/08/09/10/11; `rulings.md`; Workshop 001; Phase 2 fence grants/addenda; current pij messaging/control-plane source
- **Checks**: 12-row/ID/absolute-path/Done-When/heading script; new/existing path probes; source signature searches; prior-phase handoff; independent primary critic
- **Verdict**: VALIDATED WITH FIXES
- **Thesis / proof**: The two-tranche dossier is implementation-ready; exact source/test fences, T006 safety ordering, portable proof, and Phase 3 handoff are explicit.
- **Consumers**: Ownership tranche T001–T005 may dispatch; the inbox tranche remains gated by T006 review/restart/live proof.

## Findings

| Severity | Finding | Evidence | Status |
|---|---|---|---|
| MEDIUM | T003/T005 modify `core/harness/types.test.ts` and `core/harness/pi.test.ts`, but the original Phase 2 fence named only their source siblings. | Task paths; natural source-test pair rule | Resolved — o-prime addendum granted and fence ledger updated |

## Repairs

- Added `core/harness/types.test.ts` and `core/harness/pi.test.ts` to the Phase 2
  granted modify set.
