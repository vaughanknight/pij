# Phase 1 execution log

## Baseline

- Git-index lease: `lease-8fe94a5d-506e-4faa-8275-e8c9be012773`, healthy and held by stream orchestrator `pij-1yz3gyy`.
- `package.json` and `package-lock.json` were byte-clean against `HEAD` before mutation.
- `harness boot --json`: ready; typecheck and 1,732 tests passed.
- `npm audit --json`: 34 findings (1 critical, 9 high, 24 moderate).
- Registry latest: `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` are all `0.80.6`.
- minih latest tag remains `minih-v0.2.4`; PR 73 remains open/unstable with the Node 22 CI job failing.

## Task outcomes

| Task | Status | Evidence |
|------|--------|----------|
| T001 | complete | Clean package baseline, healthy lease, audit 34, Pi latest 0.80.6, and no green minih release. |
| T002 | complete | Vitest/tsx reached audit 29; the initial Vitest 4 compatibility stop was resolved under ruling §8 by reordering arguments in exactly three granted live-test files. Full gates passed and commit `6cd6506` records the batch. |
| T003 | complete | Temporary exact Pi peer pins regenerated the lock, wildcard peers were restored, root `ws` was updated to 8.21.0, CI moved to Node 22/24, audit reached 26, and commit `16a57e1` records the batch. |
| T004 | complete | Fresh `npm ci` installed 502 packages; Pi resolved at 0.80.6, root `ws` at 8.21.0, the minih contract test passed, and every vulnerable node path resolved from minih. |
| T005 | complete | The two commits contain only six granted shipping/test files; package manifest and lock assertions exclude work item 040, Dependabot, minih-ref, and unrelated direct updates. |
| T006 | complete | Both attributable commits and `reports/phase-1-checkpoint.md` exist; holder `pij-1yz3gyy` returned the git-index lease at `2026-07-11T12:28:27.762Z`. |

## Audit snapshots

| Point | Total | Critical | Package ancestry |
|-------|-------|----------|------------------|
| baseline | 34 | 1 | Vitest, Pi, and minih roots overlap through `esbuild` and `ws`. |
| after Vitest/tsx | 29 | 0 | Vitest roots removed; Pi and minih roots remain. |
| after Pi/ws | 26 | 0 | `minih` is the only direct vulnerable package; all 27 vulnerable node paths representing 26 findings resolve from its lock closure. |

## Full-suite discriminator

| Bump | Pre-bump failure set | Post-bump failure set | New failures? |
|------|----------------------|-----------------------|---------------|
| Vitest/tsx | Empty: 123 files passed, 4 skipped; 1,732 tests passed, 10 skipped. | Initially three failed suites used removed Vitest 4 signature `test(name, fn, { ... })`; after ruling §8's reorder-only migration, 123 files passed, 4 skipped; 1,732 tests passed, 10 skipped. | No remaining delta; the initial failure was stopped and escalated before the granted fix. |
| Pi/ws | Empty: 123 files passed, 4 skipped; 1,732 tests passed, 10 skipped. | Empty: 123 files passed, 4 skipped; 1,738 tests passed, 10 skipped. Six sibling tests arrived during the window and all passed. | No. |

## Gates

- Vitest/tsx batch:
  - `just typecheck`: passed.
  - `just lint`: passed with nine non-blocking warnings and one schema-info diagnostic in concurrent files.
  - `just test`: 123 files passed, 4 skipped; 1,732 tests passed, 10 skipped.
  - `harness checks`: all six sensors passed (typecheck, lint, test, smoke, package audit, snapshots).
- Pi/ws/CI batch:
  - `npm ci --no-fund --no-audit`: passed; 502 packages installed.
  - minih contract: 1 file and 2 tests passed.
  - `just typecheck`: passed.
  - `just lint`: passed with nine non-blocking warnings and one schema-info diagnostic in concurrent files.
  - `just test`: 123 files passed, 4 skipped; 1,738 tests passed, 10 skipped.
  - `harness checks`: all six sensors passed (typecheck, lint, test, smoke, package audit, snapshots).
- Closeout:
  - `just flow-pair-test`: 16 files and 148 tests passed.
  - `just typecheck`: passed.
  - `just lint`: passed with nine non-blocking warnings and one schema-info diagnostic in concurrent files.
  - Git-index lease returned; no staged paths remain.

## Commits

- `6cd6506` — `chore(deps): upgrade vitest and tsx`
- `16a57e1` — `chore(deps): update pi family and ci`

## Final dependency state

- Manifest: Vitest `^4.1.10`, `tsx` `^4.23.0`, minih still pinned to `minih-v0.2.4`, Pi peers restored to `"*"`, and no direct `ws` declaration.
- Lock: Vitest 4.1.10, `tsx` 4.23.0, root `esbuild` 0.28.1, Pi family 0.80.6, root `ws` 8.21.0, minih 0.2.4, and preserved `picomatch` 4.0.4.
- Final audit: 26 findings (16 high, 10 moderate, 0 critical); `minih` is the only direct vulnerable package.

## Observations

- Vitest 4 removed the third-argument test-options signature. The discriminator stopped correctly; ruling §8 granted argument reordering in exactly three live-test files.
- `npm install ws@8.21.0 --no-save --package-lock-only` did not refresh the hoisted root resolution; targeted `npm update ws --package-lock-only` did.
- `npm audit`'s `effects` field is not a complete ancestry graph. Exact proof required resolving every vulnerable node through the package-lock dependency closure rooted at `node_modules/minih`.
- Two transient npm brownouts were observed while `node_modules`/`.bin` was repopulated: one briefly removed minih and interrupted a pij send; another caused empty-output subprocess tests. Both recovered at install quiescence and are environmental retry cases, not persistent regressions.
- The git-index return omitted `--evidence` commit SHAs. Future baton returns should carry the commits so the release notice and proof travel together.
