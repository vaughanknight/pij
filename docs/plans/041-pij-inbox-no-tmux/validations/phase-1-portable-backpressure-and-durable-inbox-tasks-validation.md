# Validation — Phase 1 tasks

- **Validated**: 2026-07-12T13:31:00+10:00
- **Target**: `docs/plans/041-pij-inbox-no-tmux/tasks/phase-1-portable-backpressure-and-durable-inbox/tasks.md` @ `43682867ee50e945212506b8aa68b40d6c39c3d3`
- **Contract sources**: Plan 041 Phase 1; `rulings.md`; `requested-fences.md` Seq 43 grant; `backpressure-coverage.md`; current Phase 1 source/harness files
- **Checks**: 7-column/ID/Done-When/heading script; existing/new path probes; plan task/AC mapping; shared-surface and explicit-timeout scans; current source signature checks; independent primary critic; targeted three-finding recheck
- **Verdict**: VALIDATED WITH FIXES
- **Thesis / proof**: The dossier is implementation-ready: task ordering, exact paths, shared fences, subprocess timeouts, Windows-safe runner mechanics, and Phase 2 handoff are explicit.
- **Consumers**: Phase 1 coder can execute T001–T009 without clarification; Phase 2 receives the claimed InboxPort/FsChannel/portable-fixture substrate.

## Findings

| Severity | Finding | Evidence | Status |
|---|---|---|---|
| MEDIUM | T002 required whole-tree typecheck before T003 implemented `FsChannel` methods. | T002 now explicitly defers whole-tree typecheck to T003 and forbids premature stubs. | Resolved |
| MEDIUM | T002 left fake tests unnamed and unfenced. | Exact `adapters/fakes.test.ts` path is prechecked and added to the Phase 1 fence addendum. | Resolved |
| MEDIUM | T006 did not constrain Windows-safe npm/tool executable resolution. | T006 mandates `process.execPath` + resolved npm CLI and forbids bare shim/shell execution. | Resolved |

## Repairs

- Scoped T002's completion to core/fake tests and deferred whole-tree typecheck to
  T003.
- Added exact `adapters/fakes.test.ts` path to the dossier precheck, task, and
  fence addendum.
- Added Windows-safe npm CLI launch and failure semantics to T006.
