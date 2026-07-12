# Ship Report — Telegram Last-Speaker Routing

**Generated**: 2026-07-12T08:56:22Z
**Branch**: `s043/telegram-last-speaker-routing` → **Base**: `main`
**PR**: https://github.com/AI-Substrate/pij/pull/11 (#11) · **State**: draft/open
**Reviewed implementation commit**: `c59500ba18e19919e460bd8ef438bc4494b20735`

## Checks

| Check | Status | Details |
|-------|--------|---------|
| Node 22 | PASS | https://github.com/AI-Substrate/pij/actions/runs/29186526807/job/86633542834 |
| Node 24 | PASS | https://github.com/AI-Substrate/pij/actions/runs/29186526807/job/86633542859 |
| Local signal inventory | PASS | Isolated `harness checks`: typecheck, lint, tests, all smoke, package audit, snapshots |
| Cold review | APPROVE | `../../reviews/review.phase-1-r3.md` |
| R8 repository-context review | APPROVE | `../../reviews/review.r8-r2.md` |
| R8 targeted tests | PASS | 100/100; text/caption limit mutation RED then byte-identical restore |
| Live Telegram proof | PASS | Two rounds flipped last speaker from o-prime to s043 and routed each bare reply accordingly |
| R9 idempotent-prefix review | APPROVE | `../../reviews/review.r9-r2.md` |
| R9 CI | PASS | Commit `7beb516`; Node 22 + Node 24 checks green |

**Verdict**: all green.

## Post-ship R8 Follow-up

- Agent messages now render `[pij-id] [repo]` on `main` and `[pij-id] [repo/branch]` otherwise.
- The sender descriptor folder supplies stable repository/branch context; missing git context degrades to `[pij-id]`.
- Text remains at most 4096 characters, captions at most 1024, and overflow captions are losslessly forwarded as text before prefix-only media.
- `[pij-id]` remains first, preserving Telegram reply-tag routing.

## Post-ship R9 Follow-up

- Exact same-sender canonical prefixes are normalized to one.
- Same-sender tag-only bodies/captions upgrade to the canonical prefix once.
- Different sender tags and arbitrary bracketed content remain message content.
- Normalization runs before the R8 Telegram payload budgets.

## Repo Guidance Applied

- PR template: none; plan summary used.
- Base: `main` (repository default).
- Reviewers: none configured through CODEOWNERS.
- PR mode: draft, explicitly authorized by the o-prime.
- Landing style: squash merge, held for Jordan's explicit word.

## Deferred & Noteworthy

| Kind | Item | Where | Reason / note |
|------|------|-------|---------------|
| Noteworthy | Worktree smoke needs isolated Pi agent/tmux state when global main extensions are linked. | Retro DL-003 | Normal worktree `harness checks` exits Pi on duplicate tool registration; isolated gate proves repo truth. |
| Noteworthy | flow-pair start/review cannot persist current roster/model and peer findings contracts. | Retro DL-001 / DL-006 | Plan-scoped roster and fix packets were the authorized durable truth. |
| Noteworthy | The implementation worktree initially omitted its validated plan folder. | Retro COORD-001 | Authorized byte-identical transfer resolved it; provisioning should encode this handoff. |

No acceptance criterion, task, review finding, or code marker remains deferred.

## Resume

- PR checks are green.
- Merge is not armed; await Jordan's explicit word.
- Re-check checks: `gh pr checks 11`
- Merge when authorized: `gh pr merge 11 --squash`
