# Coder packet — 059 modal guard cut

**Owner**: `pij-professional-capybara` · **Base**: `fb1bfbd1f617e9b4111c3c0f965b5fe9ffa8d80a`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/round-detection-state`
**Branch**: `round/detection-state-v2`

## Owned task
Implement only the granted mechanical guard for invariant #9: an exact `ask_user_question` tool call is blocked before execution **only for a pij-managed Pi peer**. A generic Pi session that merely auto-loaded the global extension must not be blocked.

Recommended managed predicate, to prove or improve from source: descriptor `harness === "pi"` AND it is structurally/orchestrationally managed (`parentId !== undefined` OR `spawnedBy !== undefined` OR `prime === true` OR `oldPrime === true`). Keep the decision pure and centralized; do not spread predicates through wiring.

The block reason must say the tool is forbidden by pij invariant #9 and direct the agent to ask inline through the active delivery channel using `pij_send`, persist the pending decision, and block only dependent work. Capture the attempted tool call as today; no modal/UI fallback.

## Allowed writes
- `.pi/extensions/pij/core/invariant-guard.ts` (new)
- `.pi/extensions/pij/core/invariant-guard.test.ts` (new)
- `.pi/extensions/pij/index.ts`
- `.pi/extensions/pij/index.test.ts`
- `docs/plans/059-detection-integrity/tasks/phase-1-modal-guard/execution.log.md`

Everything else is read-only. Do not touch watchdog, daemon, close, spawn, other plans, package/config/government files, or git state.

## Forbidden paths
- `.the-flow-state.json`, any `the-flow.json`, any `the-flow.md`
- `.flow-pair/**`, `government/**`, `.pi/packages.yaml`, `.pi/settings.json`
- watchdog/death/daemon files

## Method / proof
1. Read all four existing/new target contracts in full before editing.
2. TDD: add failing pure tests plus wiring tests first; record RED command/output in execution log.
3. Implement the smallest pure guard + one existing `tool_call` handler composition.
4. Run `npx vitest run .pi/extensions/pij/core/invariant-guard.test.ts .pi/extensions/pij/index.test.ts` and `just typecheck`.
5. Inspect `git diff --check` and exact changed paths. Do not commit.

## Done signal
Send parent `COMPLETE MODAL` with changed paths, RED→GREEN commands/results, and any material unknown. Stop after reporting.
