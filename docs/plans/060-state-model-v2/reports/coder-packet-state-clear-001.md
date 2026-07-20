# Coder packet — 060 state clear

**Owner**: `pij-professional-capybara` · **Base**: `fb1bfbd1f617e9b4111c3c0f965b5fe9ffa8d80a`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/round-detection-state`
**Branch**: `round/detection-state-v2`
**Plan**: `docs/plans/060-state-model-v2/state-model-v2-plan.md`

## Owned task
Implement the full granted Simple phase for `pij state clear <node> [--assignment <id>] [--actor <label>] [--json]`.

Binding rules:
- clear is a verb/event, never a semantic state; `SEMANTIC_STATES` stays byte-identical;
- one shared state-family resolver (`chainStateOf`) answers current declaration for node/anomaly consumers;
- dedicated `state-cleared` spine event is journal-first under the existing platform write lock, appended exactly once, and chained to the existing assignment;
- never materialize a missing general assignment just to clear it;
- already-undeclared is a **loud deterministic result**, never silent success (choose a deterministic E-ARG result unless source precedent proves a stronger existing error contract); no event/write on that refusal;
- after success, remove only descriptor `semanticState`; preserve assignment/task and mechanical/runtime/identity fields;
- preserve existing WAS-recorded/recovery honesty at every cut point;
- anomaly inline self-remedy remains unchanged.

## Allowed writes
- `.pi/extensions/pij/core/platform/types.ts`
- `.pi/extensions/pij/core/platform/types.test.ts`
- `.pi/extensions/pij/core/platform/journal.ts`
- `.pi/extensions/pij/core/platform/journal.test.ts`
- `.pi/extensions/pij/core/platform/render-spine-md.ts`
- `.pi/extensions/pij/core/platform/render-spine-md.test.ts`
- `.pi/extensions/pij/core/platform/ports.ts` (contract comments only if needed)
- `.pi/extensions/pij/core/anomalies.ts`
- `.pi/extensions/pij/core/anomalies.test.ts`
- `.pi/extensions/pij/core/cli.ts`
- `.pi/extensions/pij/core/cli.test.ts`
- `.pi/extensions/pij/cli.ts`
- `.pi/extensions/pij/cli.integration.test.ts`
- `.pi/extensions/pij/acceptance-sweep.test.ts`
- `docs/how/pij.md`
- `docs/domains/pij-messaging/domain.md`
- `docs/domains/pij-control-plane/domain.md`
- `docs/plans/060-state-model-v2/tasks/phase-1-state-clear/execution.log.md`

Everything else is read-only. Do not touch plan 059 guard files, watchdog/death/daemon, package/config/government files, or git state.

## Forbidden paths
- `.the-flow-state.json`, any `the-flow.json`, any `the-flow.md`
- `.flow-pair/**`, `government/**`, `.pi/packages.yaml`, `.pi/settings.json`

## Method / proof
1. Read current state-family source/tests and affected docs in full.
2. TDD parser/reducer/journal/denorm/already-undeclared tests; record RED proof.
3. Implement by extending existing parser tables, `PlatformCommand`, shared reducer, and journal-first state write seam; no duplicate resolver.
4. Run focused tests for every touched suite, `just typecheck`, `just lint`, and `git diff --check`. Do not commit.
5. Report any baseline failures separately from owned failures.

## Done signal
Send parent `COMPLETE CLEAR` with changed paths, RED→GREEN commands/results, and any material unknown. Stop after reporting.
