# Phase 1 item 6 execution log

**Run**: 2026-08-27T08-43-00Z-github.com-vaughankn
**Agent**: pij-jolly-moose
**Delegation**: dlg-0001

## T001, T002, T006a - RED

- Added exact tri-state argv assertions for the pure spawn builder.
- Added registry annotation and resolver cases for raw-first duplicates,
  offline snapshots, empty registries, qualified ids, allowed ids, and unknown ids.
- Added fake-tmux composition cases for both `pij spawn` and `pij agent spawn`.
- The RED run produced five expected assertion failures plus the expected
  `validate.test.ts` import-suite failure; 290 existing assertions passed and one
  remained skipped.

## T003-T006 - GREEN

- Added `ModelEntry.longContext?`, the curated
  `COPILOT_NO_LONG_CONTEXT` deny-set, and pure post-merge annotation.
- Added `resolveLongContext()` with explicit-entry precedence and authoritative
  deny-set fallback after provider-prefix normalization.
- Added the builder's tri-state gate while preserving undefined as emit.
- Resolved and forwarded suppression at both executable spawn sites.
- The strengthened four-file targeted run passed 339 assertions with one
  existing skip.

## T007 - Documentation

- Updated the operator guide with the deny-set exception and expected smaller-tier
  canary result.
- Updated the control-plane registry contract with `contextWindow?` and
  `longContext?`.

## Gates

| Gate | Result |
|------|--------|
| `just typecheck` | Passed. |
| Scoped Biome check on the eight touched TypeScript files | Passed. |
| `just lint` | Repository baseline remains red on unrelated pre-existing files; all touched files are clean. |
| `harness boot` | Typecheck passed; broad test stopped on missing `pwsh` in `harness/scripts/release-age-policy.test.ts`. |
| `npx vitest run .pi/extensions/pij/` | Passed: 170 files passed, 2 skipped; 3,918 tests passed, 15 skipped. Log: `docs/plans/391-day3-core/kept-logs/vitest-phase1.log.txt`. |
| `harness checks --quick` | Local paths, typecheck, package audit, and snapshots passed. Lint/windows-compat remain red on pre-existing `osc-7337-producer` diagnostics; the broad test remains red because `pwsh` is unavailable. |

## Decisions

- Unknown capability remains `undefined`, preserving the prior emit-by-default
  behavior.
- Registry annotation is display metadata; the resolver consults the deny-set
  directly so empty/offline registries remain safe.
- Explicit capability values are preserved; annotation only fills absent values
  on `github-copilot` and `copilot` entries.
