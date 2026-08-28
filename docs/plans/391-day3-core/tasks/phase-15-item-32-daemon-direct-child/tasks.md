# Phase 15: Item 32 — the production daemon must not die by the tsx relay — tasks dossier
**Plan**: § Phase 15, AC-32 · **Branch/PR**: `s391/item32-daemon-direct-child` off `main` · **Domains**: pij-control-plane (daemon launch) · daemon shutdown · tests
**Evidence**: 15-FX cold review (`tasks/phase-14-item-15fx-sigterm-flake/review-01.md`): tsx's CLI relay (`dist/cli.mjs relaySignalToChild`) waits 2×30 ms then SIGKILLs the child and exits 143; instrumented relay launch → `code=143, shutdownCompleted=false, lockLeaked=true` (18/18); direct child → clean (18/18); pid identity proved.
### Executive Briefing
- **Purpose**: `startDaemonWindow` (`cli.ts:~1592`) launches `npx tsx daemon.ts` — two wrappers above the daemon. Any signal to the pane's process (tmux `kill-window` → SIGHUP; OS shutdown; a kill of the wrapper pid) hits the relay, which SIGKILLs the daemon mid-shutdown and leaks `write.lock`/`events.lock`. Only `pij daemon stop` is safe (signals the inner pid from `daemon.lock`, `cli.ts:~1765`).
- **Goals**: ✅ AC-32 direct child (`process.execPath --import <abs tsx loader> daemon.ts`), SIGHUP handled, real-launch proof through the production argv builder, restore-relay mutation RED.
- **Non-Goals**: ❌ changing `pij daemon stop/status` semantics (pid from `daemon.lock` stays) · ❌ touching item 15's lock code · ❌ the Windows installer (only verify `harness/scripts/cli-invocation.ts` does not derive from this argv; if it does, STOP and report)
### Pre-Implementation Check
| File | Exists? | Notes |
|---|---|---|
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/cli.ts` | yes | `startDaemonWindow` `:~1590-1612` (`cmd: "npx", args: ["tsx", daemonPath]`); stop path `:~1760-1772` (inner pid) — fence: the launch function + a loader-resolution helper only |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/daemon.ts` | yes | `installDaemonShutdownHandlers` `:~1930-1947` at main 16a7c42 (SIGINT/SIGTERM) — add SIGHUP; `holdSignalTestLocks` test hook `:~1949` reused by T002 |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/daemon.test.ts` | yes | item 15's / 15-FX's direct-child SIGTERM test (`--import tsx`) is the template for T002 (spawn what the PRODUCTION builder returns, not a hand-written argv) |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/cli.integration.test.ts` | yes | fake-tmux composition harness (item 6 precedent: assert the final argv) |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/harness/scripts/cli-invocation.ts` | yes (READ ONLY) | windows-compat derivation — confirm it does not mirror the daemon launch argv |
| `/Users/vaughanknight/GitHub/pij/node_modules/tsx/dist/loader.mjs` | yes | the `--import tsx` entry (743 bytes, no relay) — resolve it ABSOLUTELY from the CLI's install (`import.meta.resolve("tsx")` or `createRequire(import.meta.url).resolve("tsx")` → loader), never from cwd |
### Tasks
| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | TEST (RED): extract the launch argv into a pure builder (e.g. `daemonLaunchArgv(daemonPath)`), assert via the fake-tmux harness that `startDaemonWindow` passes `cmd === process.execPath` and `args === ["--import", <absolute file URL/path of tsx's loader>, daemonPath]`, no `npx`; the loader path exists on disk | pij-control-plane | `cli.integration.test.ts` (+ `cli.ts` builder) | RED on base | AC-32 |
| [ ] | T002 | TEST (RED): real launch of EXACTLY the builder's argv in a temp `PIJ_HOME` with `PIJ_TEST_HOLD_LOCKS_ON_START=1`; signal the spawned (outer) pid — one case SIGTERM, one case SIGHUP — expect `{code: 0, signal: null}` and both locks gone; a third case proves the mutation: launching `npx tsx daemon.ts` the same way and signalling the outer pid does NOT release the locks (documents the defect; keep it as the restore-relay sensor) | daemon | `daemon.test.ts` | RED on base (SIGHUP unhandled; base argv is the relay) | AC-32 |
| [ ] | T003 | IMPL: builder + `startDaemonWindow` uses it; absolute loader resolution; `SIGHUP` added to `installDaemonShutdownHandlers`; the existing item 15 SIGTERM test stays green | pij-control-plane / daemon | `cli.ts`, `daemon.ts` | T001/T002 GREEN | |
| [ ] | T004 | DOCS (`docs/how/pij.md` daemon launch/stop paragraph) + GATE (full vitest via `pij bg` → `docs/plans/391-day3-core/logs/vitest-phase15.log`, tsc, biome) + PR-ready (no push); report the resolved loader path and the `process.execPath` you launched with | — | | 0 fail | AC-10 |
### Mutation evidence required in your report
- T003: restore `cmd: "npx", args: ["tsx", daemonPath]` → T001 RED and T002's SIGTERM/SIGHUP cases RED (143 / locks leaked); restore → GREEN.
- Remove `SIGHUP` from the handlers → T002's SIGHUP case RED.
