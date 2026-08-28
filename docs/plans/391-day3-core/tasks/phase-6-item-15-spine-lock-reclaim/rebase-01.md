# dlg-0019-rebase — rebase item 15 onto origin/main (45f3e89)

**Branch**: `s391/item15-spine-lock-reclaim` @ `0ea687f` (= 49893fb approved + one docs commit). **Target**: `origin/main` @ `45f3e89`.
**Why you, not me**: `git rebase origin/main` conflicts in `.pi/extensions/pij/daemon.ts` on 49893fb — main's `f1d72f3` (item 29: bridge supervisor) and your FX-01 both add a trailing optional `Daemon` constructor param (`bridgeSupervisor?: BridgeSupervisor` vs `dispatchSpineLog?: SpineLogPort`) and both rewire `runDaemon` (main: `registry`/`bridgeSpine`/`bridgeSupervisorForDaemon(...)`; yours: `createDaemonRegistry(pijHome, log)` + injected sweep spine log). The import hunks are trivial unions; the constructor/wiring is a design choice.

**Do**
1. `git rebase origin/main` on the branch (worktree here; no other branch moves; no stash — WIP-commit if you must).
2. Resolve `daemon.ts`: keep BOTH params. Positional order is the only question — pick the order that keeps every existing `new Daemon(...)` call site on main (`daemon.test.ts`, `daemon.delivery.test.ts`, `daemon-push.test.ts`, `runDaemon`) compiling WITHOUT touching main's tests; adjust only the call sites this branch added. Prefer: main's `bridgeSupervisor` first (it merged), yours after. In `runDaemon`, main's `registry` becomes `createDaemonRegistry(pijHome, log)` (one registry, your reclaim logging + main's owner lookup share it).
3. Gates: `npx tsc --noEmit -p .`, `npx biome check` on changed .ts, then FULL `npx vitest run .pi/extensions/pij/` → `docs/plans/391-day3-core/kept-logs/vitest-item15-rebased.log.txt`. Expect 0 failed except the known pwsh row if it appears.
4. Do NOT push. Report by completion JSON: new head SHA, `git range-diff origin/main..0ea687f`-style summary of what the resolution changed beyond mechanical (files+lines), counts from the log, and `git diff 45f3e89..HEAD --stat` line count.

Forbidden: `.the-flow-state.json`, `the-flow.json`, `the-flow.md`, `government/**`, other worktrees, `.flow-pair/**`, review-01.md.
