# Phase 1 CI-Reopen Review

**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s041-inbox-no-tmux`
**Branch**: `s041/inbox-no-tmux`
**Date**: 2026-07-12
**Reviewer**: `pij-tender-leech`

## Verdict

**APPROVE**

The two CI fixes are correctly scoped and satisfy the reopen contract. No
behavior, assertion, dependency, package, or Linux-job changes were introduced.

## Files Reviewed

| File | Result |
|---|---|
| `.github/workflows/ci.yml` | Adds only `git config --global core.autocrlf false` before the Windows checkout. |
| `.pi/extensions/pij/adapters/fs-registry.test.ts` | Adds only an options-second-argument `timeout: 30_000` to the one remaining `runAllocationRace()` caller that lacked it. |
| `docs/plans/041-pij-inbox-no-tmux/tasks/phase-1-portable-backpressure-and-durable-inbox/execution.log.md` | Accurately records the hosted failures, approved fixes, local proof, and rerun condition. |

## Findings

| ID | Severity | Evidence | Fix |
|---|---|---|---|
| — | — | No findings. | None. |

## Contract Evidence

| Contract | Status | Evidence |
|---|---|---|
| Disable CRLF conversion before Windows checkout | PASS | Windows step order is `git config --global core.autocrlf false` then `actions/checkout@v4`. YAML parsed successfully; structural assertion reported `ORDER_OK`. |
| Preserve Linux job | PASS | The workflow diff contains no Linux-job hunk; only one line is added inside `windows-compat.steps`. |
| Sweep every real-subprocess race caller | PASS | `await runAllocationRace(...)` occurs at lines 349 and 382 only. Their enclosing tests declare `timeout: 30_000` at lines 344 and 366. |
| Options-second-argument form | PASS | Both tests use `it(name, { timeout: 30_000 }, async () => ...)`. |
| Timeout-only test change | PASS | The scoped diff adds only the three-line Vitest options object; assertions and test behavior are unchanged. |
| Package surfaces unchanged | PASS | `package.json` and `package-lock.json` have no worktree changes and match their `HEAD` SHA-256 hashes. |

## Local Proof

| Command | Result |
|---|---|
| `harness boot` | PASS — typecheck and test readiness stages green. |
| `just test .pi/extensions/pij/adapters/fs-registry.test.ts` | PASS — 31/31 tests; both four-round multiprocess races completed. |
| `just windows-compat` | PASS — typecheck, lint, and focused portable tests 24/24. |
| YAML parse plus Windows step-order assertion | PASS — `CI_YAML_VALID ... ORDER_OK`. |
| `git diff --check -- <three scoped paths>` | PASS. |

Biome emitted the same nine pre-existing warnings and schema-version
informational message; none originate from these three changes.

## Scope

Only the three granted paths were reviewed. This review did not edit the main
checkout or any implementation/configuration file. The sole review-authored
write is:

`/Users/jordanknight/pi-hacking/pij-worktrees/s041-inbox-no-tmux/docs/plans/041-pij-inbox-no-tmux/reviews/phase-1-ci-reopen-review.md`
