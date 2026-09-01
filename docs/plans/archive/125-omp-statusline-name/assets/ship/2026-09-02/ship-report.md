# Ship Report — omp-statusline-name

**Generated**: 2026-09-02T09:31:00+10:00
**Branch**: `125-omp-statusline-name` → **Base**: `main`
**PR**: https://github.com/AI-Substrate/pij/pull/347 (#347) · **State**: open

## Checks

| Check | Status | Details |
|---|---|---|
| check (22) | ✅ pass | https://github.com/AI-Substrate/pij/actions/runs/33571151213/job/100065163326 |
| check (24) | ✅ pass | https://github.com/AI-Substrate/pij/actions/runs/33571151213/job/100065163110 |
| rust | ✅ pass | https://github.com/AI-Substrate/pij/actions/runs/33571151213/job/100065163380 |
| windows-compat | ✅ pass | https://github.com/AI-Substrate/pij/actions/runs/33571151213/job/100065163196 |

**Verdict**: all green on the implementation push.

## Repo guidance applied

- PR template: none; used plan summary plus pinned deterministic acceptance-criteria table.
- Base: `main` (repository default).
- Review: Claude Opus 5 r3 — APPROVE FOR PR, no finding open.

## Deferred & Noteworthy

| Kind | Item | Where | Reason / note |
|---|---|---|---|
| Noteworthy | OMP worktree witnesses must disable the globally linked main extension and load the worktree extension explicitly. | `assets/live-footers.md` | Otherwise a green footer may be running main rather than the branch. |
| Deferred | OMP+rs keyed fallback row omits the `rs-v1` suffix. | review r1 R-07 | Out of scope, not a regression, and no plan goal covers it. |
| Accepted | `source:user` pij naming may take precedence over a later user rename. | impl-guide risk r2 | Explicitly accepted by the plan. |

No task or acceptance criterion remains open; no `TODO`, `FIXME`, or `HACK` was introduced.

## Resume

- PR: `gh pr view 347`
- Re-check: `gh pr checks 347`
- Merge remains owner-controlled; no auto-merge was armed.
