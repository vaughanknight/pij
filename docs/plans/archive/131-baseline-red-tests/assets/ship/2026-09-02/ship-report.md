# Ship Report — baseline-red-tests

**Generated**: 2026-09-02T04:22:20Z
**Branch**: `131-baseline-red-tests` → **Base**: `main`
**PR**: https://github.com/AI-Substrate/pij/pull/354 (#354) · **State**: open

## Checks

| Check | Status | Details |
|---|---|---|
| check (22) | pass | https://github.com/AI-Substrate/pij/actions/runs/33589766518/job/100121205565 |
| check (24) | pass | https://github.com/AI-Substrate/pij/actions/runs/33589766518/job/100121205523 |
| rust | pass | https://github.com/AI-Substrate/pij/actions/runs/33589766518/job/100121205343 |
| windows-compat | pass | https://github.com/AI-Substrate/pij/actions/runs/33589766518/job/100121205551 |
| local `harness checks` | pass | 2026-09-02T04:27:28.936Z; all eight sensors passed, zero skipped |

**Verdict**: all green

## Repo guidance applied

- PR template: none; used plan summary plus the pinned deterministic acceptance-criteria table
- Base: `main` (repository default)
- Reviewers: none configured

## Deferred & Noteworthy

| Kind | Item | Where | Reason / note |
|---|---|---|---|
| Proof improvement | Add an npm ≥11.10.0 matrix job for the quarantine-enforcement arm | `.harness/records/retro/2026-09-02/001-131-baseline-red-tests.md#SUGG-001` | Local npm 11.5.1 proves fail-closed refusal but cannot execute supported-path enforcement |

## Resume

- PR is open with all checks green; merge remains optional and was not requested.
- Re-check: `gh pr checks 354`
