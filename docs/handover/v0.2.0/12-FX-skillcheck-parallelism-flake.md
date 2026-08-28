# 12-FX — pij-skill-check.test.ts full-suite parallelism flake (DONE, pending merge)

**Item id / stream at handover:** 12-FX · s392-day3-codex-doctrine
**Status at v0.2.0 (tag `d120c53`):** IN FLIGHT — implementation **DONE** on branch `s392/item12-fx-falcon` (pushed, HEAD `8237e78`; 12-FX commit `3f0849e`). Not yet merged to main; land as a small harness-hygiene code PR. Orchestrator-verified (verdict `docs/plans/392-day3-codex-doctrine/reviews/item-12-fx-verdict.md`, on main).
**Size estimate:** DONE (~S) · **Order / dependencies:** none.

## 1. Why this exists (the observed failure, with evidence)
`harness/scripts/pij-skill-check.test.ts` failed ~1 of 5 FULL-SUITE runs, passed in isolation. Root cause (pinned): the test copies the real `skills/pij` tree in beforeEach and then spawns a synchronous shell checker that re-discovers and reads the SHARED git worktree; under full-suite parallel I/O + process contention, the first canonical-order case exceeds Vitest's 30 s timeout. It is a timeout under contention, not a data race.
- Repro kept: `docs/plans/392-day3-codex-doctrine/tasks/item-12-FX/pre-fix-full-suite-run-6.log` (on branch `3f0849e`): 1 failed at `pij-skill-check.test.ts`, 4769 passed.

## 2. What was ruled / done
TRUE isolation (not a timeout bump): the checker honors `PIJ_REPO_ROOT`, and the test builds ONE isolated repo snapshot per file, restoring only mutated fixtures between cases — removing the shared-worktree dependency.

## 3. Where the code is
Branch `s392/item12-fx-falcon`, commit `3f0849e`:
- `harness/scripts/pij-skill-check.sh:7-8` — `REPO_ROOT=${PIJ_REPO_ROOT:-$(git rev-parse --show-toplevel …)}`; `cd "$REPO_ROOT"`.
- `harness/scripts/pij-skill-check.test.ts` — one isolated repo snapshot per file; restore-only-mutable-fixtures between cases.
Pattern also recorded on main: `docs/plans/392-day3-codex-doctrine/tasks/item-12-skillcheck-hardening/tasks.md`; investigation `docs/plans/392-day3-codex-doctrine/tasks/item-12-FX-DRAFT-HOLD.md`.

## 4. Acceptance (mechanical) — MET
Flake fix, no mutant; the gate is determinism under full-suite parallelism, repro + logs kept (E22). On branch `3f0849e`: pre-fix repro (above) + THREE consecutive post-fix parallel full-suite runs each **4771 passed | 19 skipped, 0 failed** (`post-fix-full-suite-run-{1,2,3}.log`; proof runs excluded `release-age-policy.test.ts` pwsh-ENOENT, separately skip-with-reason'd in commit `8237e78`). Orchestrator ran an independent full-suite confirmation.

## 5. Live verification
CI/test-infra only — no daemon restart. Run the full suite under concurrent load N times; `pij-skill-check.test.ts` must not flake.

## 6. Risks / gotchas that already bit us
- **E22** — keep the failing log in full; fix isolation, never retry into green (done). **E35** — full-suite counts on a fresh-from-main worktree.
- The .gitignore drops `*.log`; the proof logs were committed on the branch — if they must reach main, re-add as `kept-logs/*.log.txt` (E48/E49) or rely on the tallies quoted here.

## 7. Open questions for the human
- None for the fix. Merge decision only: land `3f0849e` (+ `8237e78` pwsh) as a harness-hygiene code PR.
