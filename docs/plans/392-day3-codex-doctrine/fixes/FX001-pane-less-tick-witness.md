# Fix FX001: restore the pane-less tick witness for `daemonReceiptAuthoritative`

**Created**: 2026-08-27 · **Status**: Proposed (dispatch after dlg-0002) · **Plan**: `../day3-codex-doctrine-plan.md` (Phase 1, merged as PR #1) · **Source**: cold review `reviews/phase-1-review.md` mutation 6 (verdict FIX_REQUIRED) · **Domain(s)**: pij-messaging (modify, test-only)

## Problem
`core/cli.ts:691-696` `daemonReceiptAuthoritative` now uses `effectiveDeliveryMode(target)`. Reverting it to raw `target.deliveryMode` leaves `core/cli.test.ts` 462/462 GREEN (reproduced by the orchestrator), because Phase 1's `+paneId:"%9"` widenings at `cli.test.ts:1276/1299/1323` moved the pane-less claude/copilot fixtures — the only witnesses — out of the cell under test. Three call sites (`cli.ts:2245` sendSuccess, `:3344` plain `pij send`, `:3630` `pij state`) compute tick status from this function independently of the pull early-return, with zero coverage.

## Proposed Fix
Add ONE test in `core/cli.test.ts` (dispatch send family): a descriptor `{harness:"claude", lifecycle:"bound", paneId:undefined, deliveryMode:undefined, lastTickAt:<fresh>}`; `pij send` to it → `--json` has `receipt:"queued", reason:"pull-inbox"` AND a **negative** assertion that the daemon tick fields (`daemonTickStale`, `daemonTickAgeMs`) are ABSENT from the JSON (and the human line has no "tick" text). `harness:"pi"` cannot substitute (the harness gate excludes pi). Then prove: `just flow-pair-mutate .pi/extensions/pij/core/cli.ts 's/effectiveDeliveryMode\(target\) !== "pull"/target.deliveryMode !== "pull"/' 'npx vitest run .pi/extensions/pij/core/cli.test.ts'` → RED (≥1), restore → GREEN.

## Domain Impact
| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| pij-messaging | modify (test-only) | `core/cli.test.ts` +1 case |

## Tasks
| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | FX001-1 | Add the pane-less bound claude negative-tick test (above) | pij-messaging | `/Users/vaughanknight/GitHub/pij-worktrees/s392-day3-codex-doctrine/.pi/extensions/pij/core/cli.test.ts` | Test GREEN on HEAD; mutation 6 RED; `npx vitest run .pi/extensions/pij/core/cli.test.ts` GREEN after restore | Record the mutation output in the execution log |
| [ ] | FX001-2 | Pathspec commit (`git commit -- .pi/extensions/pij/core/cli.test.ts`) on a branch rebased onto origin/main; report | pij-messaging | — | Commit sha reported | Own small PR |

## Acceptance
- [ ] mutation 6 goes RED with the new test; GREEN after restore
- [ ] no production code change

## Discoveries & Learnings
| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
