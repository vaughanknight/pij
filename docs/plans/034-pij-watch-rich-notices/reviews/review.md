# Code Review: Subtask 001 — Watch collate window + diff pointer delivery

**Plan**: `/Users/jordanknight/pi-hacking/pij/docs/plans/034-pij-watch-rich-notices/pij-watch-rich-notices-plan.md`  
**Spec**: `/Users/jordanknight/pi-hacking/pij/scratch/plan-034-watch-followup-ideas.md`  
**Phase**: Simple Mode — Subtask 001 (ST001-ST006)  
**Date**: 2026-07-10  
**Reviewer**: Automated (GitHub Copilot CLI peer `pij-1qo62ah`)  
**Testing Approach**: Hybrid (tests-first implementation plus pending live smoke)

**Scope**: This review covers Subtask 001 implementation through ST006. Parent
Phase 1 was separately reviewed and APPROVED by flow-pair run
`2026-07-09T01-36-49Z`. ST007 (daemon restart and live smoke) is deliberately
pending and is not part of this approval.

## A) Verdict

**APPROVE**

No material correctness, domain, reinvention, testing, or doctrine findings were
identified in the reviewed scope.

## B) Summary

The implementation satisfies ST001-ST006 and the dossier's three governing
decisions. Subscription persistence remains debounce-blind while upserting the
cadence, and daemon runtime identity includes the effective cadence so a change
disposes the old watcher and starts a new one. The 750 ms default is isolated to
pij peer-watch while `file-watch-notify` retains its 30 ms default, and computed
diffs now pointer-deliver while deleted and no-diff changes retain plain notices.
The CLI parser and integration tests cover supported duration forms and prove
invalid values fail before sidecar creation. No new domain or duplicated
component was introduced; the implementation reuses the existing `FolderWatcher`.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Core validation tests present
- [x] Critical paths covered
- [x] Key verification points documented
- [x] Tests exercise D1 upsert and runtime watcher restart independently
- [x] Tests exercise D2 default and explicit cadence plumbing
- [x] Tests exercise D3 small/large computed diffs and plain-notice branches
- [x] CLI integration tests cover bare ms, `ms`, `s`, invalid, and non-positive values
- [x] Invalid CLI input is proven to fail before a sidecar write
- [x] Only in-scope implementation files are included in the computed diff
- [x] Full `npm test` suite is green
- [x] Domain compliance checks pass
- [ ] ST007 daemon restart and live smoke (deliberately pending)

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| — | — | — | — | No material findings | Proceed to the pending ST007 runtime validation |

## E) Detailed Findings

### E.1) Implementation Quality

No material findings. The key tests are non-vacuous: changing the store key to
include cadence would make the upsert count assertions fail; omitting cadence
from the daemon key would prevent the second watcher from being constructed and
fail disposal/count assertions; retaining inline small diffs would fail both the
body and pointer assertions; and writing on invalid CLI input would fail the
sidecar absence assertion.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All changes remain under the existing `pij-control-plane` paths or its guide/dossier. |
| Contract-only imports | ✅ | No new cross-domain internal dependency was introduced. |
| Dependency direction | ✅ | pij continues to consume the pi-free `file-watch-notify` core in the existing direction. |
| Domain.md updated | N/A | No new domain or public domain composition was introduced by this subtask. |
| Registry current | N/A | No domain registry change is required. |
| No orphan files | ✅ | Every reviewed file maps to the existing pij-control-plane domain or documentation. |
| Map nodes current | N/A | No domain node was added or changed. |
| Map edges current | N/A | No new domain relationship was introduced. |
| No circular business deps | ✅ | The existing dependency direction is unchanged. |
| Concepts documented | N/A | No new public contract concept was introduced beyond the additive subscription field and CLI flag documented in the guide. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| None | `FolderWatcher` reused directly | file-watch-notify | ✅ Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 98%

| AC / Decision | Confidence | Evidence |
|---------------|------------|----------|
| D1 store upsert | 100% | `core/watch-subscription.test.ts` asserts one stored subscription and cadence replacement. |
| D1 runtime restart | 100% | `core/daemon/watch.test.ts` asserts two watcher constructions, old disposal, one active watcher, and the new timer delay. |
| D2 750 ms pij default | 100% | Daemon test observes `750`; source inspection confirms `file-watch-notify/store.ts` remains `30`. |
| D3 computed diff pointer | 100% | Core tests cover small and large diffs; daemon test verifies pointer body and persisted diff content. |
| D3 plain-notice preservation | 100% | Core tests cover absent `c.diff`; core and daemon tests cover deleted files. |
| CLI duration parsing | 100% | Integration tests cover `750`, `750ms`, and `2s`. |
| CLI rejection before write | 100% | Integration tests cover `0`, `-1`, `NaN`, and `1m`, asserting exit 64 and no sidecar. |
| ST007 live behavior | 80% | Deterministic tests are green; daemon restart and real-peer burst/pointer smoke remain pending by design. |

### E.5) Doctrine Compliance

The changes preserve the repository rules: pi-free core boundaries, top-level
imports, `.js` relative import suffixes, typed additive contracts, constants
beside constrained peer-watch data, constructor-injected watcher effects, and
tests focused on pure/store and daemon seams. No `any`, dynamic import, global
mutable state, or new dependency was introduced.

## F) Coverage Map

| Task | Description | Evidence | Confidence |
|------|-------------|----------|------------|
| ST001 | Tests-first debounce storage, validation, upsert, and restart semantics | `watch-subscription.test.ts`; `daemon/watch.test.ts` | 100% |
| ST002 | Thread `debounceMs`, isolate 750 ms default, cadence-aware runtime key | `types.ts`; `watch-subscription.ts`; `watch-store.ts`; `daemon/watch.ts` | 100% |
| ST003 | Parse, persist, update, and reject `--debounce` values | `cli.ts`; `cli.integration.test.ts` | 100% |
| ST004 | Specify computed-diff pointers and preserved plain notices | `watch-subscription.test.ts`; `daemon/watch.test.ts` | 100% |
| ST005 | Remove inline threshold branch and return pointer writes | `watch-subscription.ts`; `daemon/watch.ts` | 100% |
| ST006 | Document collate, retune, pointer, and no-diff behavior | `docs/how/pij-peer-watch.md` | 100% |
| ST007 | Restart daemon and live-smoke burst/pointer delivery | Pending by explicit scope | 0% |

**Overall coverage confidence**: 98%

## G) Commands Executed

```bash
git --no-pager diff --stat -- \
  .pi/extensions/pij/core/types.ts \
  .pi/extensions/pij/core/watch-subscription.ts \
  .pi/extensions/pij/core/watch-subscription.test.ts \
  .pi/extensions/pij/core/daemon/watch.ts \
  .pi/extensions/pij/core/daemon/watch.test.ts \
  .pi/extensions/pij/adapters/watch-store.ts \
  .pi/extensions/pij/cli.ts \
  .pi/extensions/pij/cli.integration.test.ts \
  docs/how/pij-peer-watch.md

npm test

git --no-pager diff -- \
  .pi/extensions/pij/core/types.ts \
  .pi/extensions/pij/core/watch-subscription.ts \
  .pi/extensions/pij/core/watch-subscription.test.ts \
  .pi/extensions/pij/core/daemon/watch.ts \
  .pi/extensions/pij/core/daemon/watch.test.ts \
  .pi/extensions/pij/adapters/watch-store.ts \
  .pi/extensions/pij/cli.ts \
  .pi/extensions/pij/cli.integration.test.ts \
  docs/how/pij-peer-watch.md \
  > docs/plans/034-pij-watch-rich-notices/reviews/_computed.diff
```

`npm test` result: 117 test files passed, 4 skipped; 1580 tests passed,
10 skipped.

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: APPROVE  
**Plan**: `/Users/jordanknight/pi-hacking/pij/docs/plans/034-pij-watch-rich-notices/pij-watch-rich-notices-plan.md`  
**Spec**: `/Users/jordanknight/pi-hacking/pij/scratch/plan-034-watch-followup-ideas.md`  
**Phase**: Simple Mode — Subtask 001 (ST001-ST006)  
**Tasks dossier**: `/Users/jordanknight/pi-hacking/pij/docs/plans/034-pij-watch-rich-notices/tasks/phase-1-implementation/001-subtask-watch-collate-window-and-diff-pointer.md`  
**Execution log**: N/A — implementation status and discoveries are recorded in the tasks dossier; ST007 remains pending  
**Review file**: `/Users/jordanknight/pi-hacking/pij/docs/plans/034-pij-watch-rich-notices/reviews/review.md`

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/types.ts` | Modified | pij-control-plane contract | None |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/watch-subscription.ts` | Modified | pij-control-plane core | None |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/watch-subscription.test.ts` | Modified | pij-control-plane tests | None |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/daemon/watch.ts` | Modified | pij-control-plane daemon | None |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/daemon/watch.test.ts` | Modified | pij-control-plane tests | None |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/adapters/watch-store.ts` | Modified | pij-control-plane adapter | None |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/cli.ts` | Modified | pij-control-plane CLI | None |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/cli.integration.test.ts` | Modified | pij-control-plane integration tests | None |
| `/Users/jordanknight/pi-hacking/pij/docs/how/pij-peer-watch.md` | Modified | pij-control-plane documentation | None |
| `/Users/jordanknight/pi-hacking/pij/docs/plans/034-pij-watch-rich-notices/tasks/phase-1-implementation/001-subtask-watch-collate-window-and-diff-pointer.md` | Modified | planning evidence | Complete ST007 after coordination |

### Required Fixes (if REQUEST_CHANGES)

None.

### Domain Artifacts to Update (if any)

None.

### Handback

APPROVE for ST001-ST006. Complete the deliberately pending ST007 daemon restart
and real-peer live smoke before treating the subtask as fully complete.
