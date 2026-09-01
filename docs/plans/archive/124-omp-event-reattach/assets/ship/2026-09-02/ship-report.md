# Ship Report — omp-event-reattach

**Generated**: 2026-09-02
**Branch**: `124-omp-event-reattach` → **Base**: `main`
**PR**: https://github.com/AI-Substrate/pij/pull/346 (#346) · **State**: open

## Checks

| Check | Status | Details |
|---|---|---|
| Local engineering harness | ✅ | `harness checks` — all eight sensors passed |
| Cross-model review | ✅ | Claude Opus 5 r3 **APPROVE** |
| GitHub CI | — | No checks reported on the branch |

**Verdict**: local deterministic gate green; no GitHub CI configured for this PR.

## Repo guidance applied

- PR template: none; used plan summary plus pinned ddoc acceptance table.
- Base: `main`.
- Reviewers: none manually assigned.

## Deferred & Noteworthy

| Kind | Item | Where | Reason / note |
|---|---|---|---|
| Coverage | Q2: no live frame was emitted during the daemon-down gap | `assets/reviews/review-r3.dd.md` | Accepted non-blocking: cursor-map unit coverage plus Rust `WHERE seq > since` authority cover replay semantics |
| Harness | Flowspace index excludes hidden `.pi/` by default | prime handoff | Flowspace prime confirmed `include_hidden=false`; awaiting Jordan's rescan decision |

All acceptance criteria are checked; `harness plan validate --complete` reports 0 errors, 0 warnings, 0 open items, 0 orphan claims.

## Resume

- PR is open; merge is prime-owned and not attempted by the PM.
- Re-check: `gh pr checks 346` (currently no checks reported).
