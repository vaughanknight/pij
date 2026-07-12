# Validation — Phase 3 Push-Path Convergence and Guidance Tasks

- **Validated**: 2026-07-12T20:59:28+10:00
- **Target**: `tasks/phase-3-push-path-convergence-and-guidance/tasks.md` (`sha256:5caaa3f42b93dd109101bd1356fc97c178096b54137951c0d4e46a8845013006`)
- **Contract sources**: `pij-inbox-no-tmux-plan.md` AC-06/07/11/12/13/14 and Phase 3; `requested-fences.md`; `rulings.md` R-004; `reviews/phase-2-inbox-review.md`; current source at `a798bf269a79`; s043 R8 approval and PR #11 state
- **Checks**: `harness boot` (typecheck + tests); 13-task/AC/path resolution; exact s043 source commit/blob assertions; clean-rebase/path-only/no-stack ordering assertions; T004 fence/watermark assertions; targeted independent revalidation of both prior findings
- **Verdict**: VALIDATED WITH FIXES
- **Thesis / proof**: Phase 3 is implementation-ready: the green Phase 1-2 baseline, exact shared-document integration protocol, and marker/runtime-watermark ownership provide Implementation-level proof.
- **Consumers**: T001-T013 implementation dispatch is unblocked after the Seq 74 clean planning checkpoint, `origin/main` rebase, and recorded path-only document restore.

## Findings

| Severity | Finding | Evidence | Status |
|---|---|---|---|
| HIGH | T008 did not name a safe source or method for the approved-but-unmerged PR #11 domain-document change. | Spine Seq 74 now records clean planning commit → rebase `origin/main` → path-only restore from commit `a831930b…`, blob `844464ee…`; no s043 commits may be stacked or merged; PR #11 must merge before #9. | Resolved |
| MEDIUM | T004 could be read as removing the watcher’s process-local `seen` set or editing out-of-fence `adapters/channel.ts`. | T004 now keeps `FsChannel.watch()` and `seen` unchanged for runtime deduplication, makes durable markers authoritative across reloads, and confines post-`onInbound` marking to `index.ts`. | Resolved |

## Repairs

- Encoded the exact Spine Seq 74 pre-dispatch integration sequence, source ref/blob, path-only boundary, and PR merge ordering.
- Clarified durable marker ownership versus the unchanged process-local watcher watermark and revalidated both corrections.
