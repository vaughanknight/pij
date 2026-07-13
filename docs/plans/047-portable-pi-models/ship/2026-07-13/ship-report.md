# Ship Report — portable-pi-models

**Generated**: 2026-07-13T02:37:00Z
**Branch**: `s047/portable-pi-models` → **Base**: `main`
**PR**: https://github.com/AI-Substrate/pij/pull/15 (#15) · **State**: draft at evidence capture; authorized to transition ready
**Evidence head**: `6139b0e2f442f5ff85d33da54aa98280b20eb538`

## Checks

| Check | Status | Details |
|-------|--------|---------|
| Node 22 | ✅ SUCCESS | https://github.com/AI-Substrate/pij/actions/runs/29219682744/job/86722215466 |
| Node 24 | ✅ SUCCESS | https://github.com/AI-Substrate/pij/actions/runs/29219682744/job/86722215482 |
| Windows compatibility | ✅ SUCCESS | https://github.com/AI-Substrate/pij/actions/runs/29219682744/job/86722215455 |
| Post-PR12 model + sync tests | ✅ 113/113 | local targeted run after rebase |
| Implementation cold review | ✅ APPROVE | `../../reviews/review.phase-1.md` |
| Model-discovery integration cold review | ✅ APPROVE | `../../reviews/review.model-discovery-integration.md` |
| Full local harness | ⚠️ external blocker only | typecheck/lint/test/windows/package/snapshots pass; smoke stops at the known shared worktree Pi trust selector |

**Verdict**: hosted CI all green; implementation and merged-doc integration independently approved with zero critical/high/medium findings.

## Repo guidance applied

- PR template: none → focused plan-derived body.
- Base: `main` (repository default).
- Reviewers: cold cross-session reviews recorded in plan artifacts; hosted PR reviewer assignment left to repository policy.
- PR #12 dependency: merged at `940557a`; s047 rebased, reread, and integrated without changing its GPT-5.6 effort/pass-through contracts.

## Deferred & Noteworthy

| Kind | Item | Where | Reason / note |
|------|------|-------|---------------|
| External harness debt | Worktree smoke reaches Pi’s `Do not trust (this session only)` selector and times out | `harness checks` smoke sensor | Shared/out-of-s047 scope; hosted Node 22/24 and Windows matrices are green. |

No product acceptance criterion, implementation task, review finding, or model-discovery integration item remains deferred.

## Boundary proof

- Repo source owns only `github-copilot`, `sakana`, and `openrouter`.
- Synchronization preserves every unmanaged/local provider.
- Auth, general skills, personal settings, and runtime state remain outside ownership.
- No real-home model synchronization, `npm link`, `pi-doctor` expansion, daemon restart, or merge occurred.
- Atomic direct-overwrite mutation goes RED; production restores byte-identically; final targeted suite is green.

## Resume

- Transition PR #15 from draft to ready under Spine Seq155 authorization.
- Verify ready state, clean mergeability, exact head, and hosted checks after the report-only commit.
- **Merge remains blocked until Jordan explicitly confirms it**; no auto-merge is armed.
- Re-check checks: `gh pr checks 15`.
