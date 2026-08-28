# Item-29b-T001 PR — build and gate evidence

Base: origin/main 58c9cf100bea4a4b1348ae12ffa3e9763f0a6c3a
PR branch: s392/item-29b-t001-pr  ·  head: 0b749dc94ceb4c1485f9a3ffcd727a697b070457
Worktree: fresh-from-main (E35); node_modules symlinked from stream (lockfile IDENTICAL to base).
Raw run logs (green): scratchpad 29b-pr run1.log / run2.log (repo ignores *.log; tallies below are the kept evidence).

## Cherry-pick chain (onto fresh main)
  0b749dc test(daemon): pin notifier factory binding
  a05d3c2 fix(daemon): bind bridge notifier deps
  542d4be fix(daemon): harden bridge watcher wiring
  51f8eef test(pij): pin bridge restart wiring
  31e8044 fix(pij): harden bridge watcher notification
  1981a13 fix(pij): notify bridge restart watchers

Conflicts (daemon.test.ts import block + one plan-artifact), resolved union+drop per spec:
- 816a726: union main imports (createDaemonRegistry / installDaemonShutdownHandlers / DAEMON_BIN) + notifyBridgeRestartWatchers
- 87a0c13: +createBridgeRestartNotifier (union)
- ad32ecb: drop createBridgeRestartNotifier (incoming removes it), keep createDaemonRegistry
- 2773771: MUT-WIRING.patch DU -> took chain version
- 5b77c99: +bridgeNotifierDepsForDaemon (union, sorted)
- 34d189a: clean (W1+W2 hardening)
Final import block reconciled; tsc confirms all symbols used (no unused/missing).

## Gates
- typecheck: tsc --noEmit -> 0 errors
- biome: 3 changed .ts files (daemon.ts, daemon.test.ts, adapters/watchdog-store.ts) -> clean
- GREEN RUN 1: Test Files 172 passed | 2 skipped; Tests 4121 passed | 15 skipped, 0 failed
- GREEN RUN 2: Test Files 172 passed | 2 skipped; Tests 4121 passed | 15 skipped, 0 failed
- pij-skill-check.test.ts (12-FX flake) did NOT bite either run; warning lines are tests exercising tmux-failure paths (stderr noise, not failures).

## Mutant gates carried (verified authoritatively by orchestrator)
- Deps fold 5b77c99: MUT-CALLSITE-HOME RED at daemon.test.ts:326 (reviewer) — reviews/item-29b-t001-deps.md
- W1+W2 34d189a: MUT-CALLSITE-ARG + MUT-LITERAL-BYPASS both RED at :334, old pin blind, revert GREEN — reviews/item-29b-t001-w1w2-verdict.md
