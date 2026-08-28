# Phase 15 execution log

## T001 — production launch argv

- Initial branch/base: `s391/item32-daemon-direct-child` at `f9e9b1f640a44749593e0d86504ff45ecb8e7d66`.
- Added `daemonLaunchArgv()` as the single source for the daemon window command and arguments, initially preserving `cmd: "npx"` / `args: ["tsx", daemonPath]`.
- RED command: `npx vitest run .pi/extensions/pij/cli.integration.test.ts -t "composes the daemon window from the direct production Node argv"`.
- RED result: expected `/opt/homebrew/Cellar/node/26.3.1/bin/node --import file:///Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/node_modules/tsx/dist/loader.mjs daemon.ts`; received `npx tsx daemon.ts`.
- Preserved output: `docs/plans/391-day3-core/kept-logs/dlg-0030-t001-red.log.txt`.
- The fake-tmux sensor also asserts that the resolved loader is a file URL ending in `tsx/dist/loader.mjs`, exists on disk, and the final production tmux argv contains no `npx`.

## T002 — real outer-pid signal proof

- Added real temp-home launches using exactly `daemonLaunchArgv(DAEMON_BIN)`.
- Each launch sets `PIJ_TEST_HOLD_LOCKS_ON_START=1`, waits for `PIJ_TEST_LOCKS_HELD`, reads `daemon.lock`, and proves the spawned outer pid equals the daemon pid.
- The SIGTERM and SIGHUP cases require `{ code: 0, signal: null }` and removal of both `spine/write.lock` and `spine/events.lock`.
- RED command: `npx vitest run .pi/extensions/pij/daemon.test.ts -t "the production launch makes|the former npx tsx relay"`.
- RED result on the relay argv: both production cases found different outer and daemon pids.
- Preserved output: `docs/plans/391-day3-core/kept-logs/dlg-0030-t002-red.log.txt`.
- The retained relay control signals the outer `npx tsx` process with SIGHUP and proves both held locks remain. On this Node 26/npm 11 machine, an exploratory outer-pid SIGTERM exited 0 and released the locks; the earlier deterministic 143 race remains preserved in the Phase 14 review evidence rather than being falsely claimed as reproduced here.

## Rebases before implementation commit

- Main advanced while the RED tests were uncommitted.
- Preserved the four-file diff at `docs/plans/391-day3-core/kept-logs/dlg-0030-pre-rebase.patch`, restored the tracked files, fetched `origin/main`, rebased, and reapplied the patch.
- First rebased base: `f22b791912f5c3bc37fbfe3377e330c996c20198`.
- Main advanced again before the first commit with the Item 24 merge, including a non-overlapping `daemon.test.ts` change.
- Preserved the five tracked-file diff at `docs/plans/391-day3-core/kept-logs/dlg-0030-pre-final-rebase.patch`, restored it, rebased, and reapplied it without conflict.
- Final rebased base: `71171648d275baffda7b8e62f8c935133a7d9666`.

## T003 — direct Node child and SIGHUP

- `daemonLaunchArgv()` now returns:
  - `cmd`: `/opt/homebrew/Cellar/node/26.3.1/bin/node` (`process.execPath`).
  - `args[0]`: `--import`.
  - `args[1]`: `file:///Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/node_modules/tsx/dist/loader.mjs`, resolved with `createRequire(import.meta.url).resolve("tsx")` and converted to a file URL.
  - `args[2]`: the absolute `daemon.ts` path.
- `ensureDaemonRunning()` passes that builder output directly to `TmuxAdapter.newWindow()`.
- `installDaemonShutdownHandlers()` now installs the same graceful shutdown path for SIGHUP, SIGINT, and SIGTERM.
- Targeted GREEN output: `docs/plans/391-day3-core/kept-logs/dlg-0030-targeted-green-rebased.log.txt` — 6 passed, 208 skipped across the two test files.
- Windows launcher review: `harness/scripts/cli-invocation.ts` contains generic npm/npx invocation helpers and does not derive from or mirror the daemon launch argv; no Windows file changed.

## Mutation evidence

- Relay restoration: changed `daemonLaunchArgv()` back to `cmd: "npx"` / `args: ["tsx", daemonPath]`.
  - RED: the fake-tmux composition test and both production SIGTERM/SIGHUP cases failed.
  - The real-launch failures showed `daemon.lock` pids different from the spawned outer pids.
  - Preserved output: `docs/plans/391-day3-core/kept-logs/dlg-0030-relay-mutation-red.log.txt`.
- SIGHUP removal: removed only `onSignal("SIGHUP", shutdown)`.
  - RED: the real SIGHUP launch exited as `{ code: null, signal: "SIGHUP" }` instead of `{ code: 0, signal: null }`.
  - Preserved output: `docs/plans/391-day3-core/kept-logs/dlg-0030-sighup-mutation-red.log.txt`.
- Both mutations were restored before the GREEN run.

## T004 — final gates

- Complete affected files: `npx vitest run .pi/extensions/pij/cli.integration.test.ts .pi/extensions/pij/daemon.test.ts` passed — 211 tests passed, 3 skipped.
- Final post-rebase targeted proof: `docs/plans/391-day3-core/kept-logs/dlg-0030-targeted-final-rebased.log.txt` — 6 passed, 208 skipped.
- Root TypeScript check: `npx tsc --noEmit -p .` passed after the final rebase.
- Scoped Biome: `npx biome check .pi/extensions/pij/cli.ts .pi/extensions/pij/daemon.ts .pi/extensions/pij/cli.integration.test.ts .pi/extensions/pij/daemon.test.ts` passed after the final rebase.
- Pre-final-rebase full extension suite: 172 files passed, 2 skipped; 4,133 tests passed, 15 skipped.
- Authoritative post-rebase full extension suite: 172 files passed, 2 skipped; 4,152 tests passed, 15 skipped.
- Full-suite output: `docs/plans/391-day3-core/kept-logs/vitest-phase15.log.txt`.
- Detached job output: `/Users/vaughanknight/.pij/pij-jolly-moose/bg-mtcd6dg0-24lt4r.log`.
- `harness checks --quick` passed local-path portability, typecheck, package audit, and snapshots. Its three failures are unchanged baseline conditions:
  - `lint`: existing `osc-7337-producer.ts` Biome findings; that file is byte-unchanged from `origin/main`.
  - `test`: local `pwsh` is absent for `release-age-policy.test.ts`; that test is byte-unchanged from `origin/main`.
  - `windows-compat`: repeats the same existing producer lint.
- Harness output: `docs/plans/391-day3-core/kept-logs/harness-checks-phase15.log.txt`.

## FX-01 — review lows

### P-1 — one launch-argv source

- Replaced the Phase 14 real-SIGTERM test's hand-built `process.execPath --import tsx daemon.ts` command with `daemonLaunchArgv(DAEMON_BIN)`.
- The production launcher, fake-tmux composition test, legacy SIGTERM test, and SIGTERM/SIGHUP/SIGINT real-launch matrix now consume the same builder.

### P-2 — real SIGINT sensor

- Extended the production real-launch matrix to SIGINT.
- Mutation: removed only `onSignal("SIGINT", shutdown)`.
- RED result: the SIGINT case exited as `{ code: null, signal: "SIGINT" }` instead of `{ code: 0, signal: null }`.
- Preserved output: `docs/plans/391-day3-core/kept-logs/dlg-0030-fx01-sigint-red.log.txt`.
- Restored the handler before the GREEN runs.

### P-3 — stale relay comments

- Removed the inert `daemon.ts` shebang: the file mode is `100644`, and the managed launcher passes it to Node rather than executing it.
- Replaced the source comment advertising `npx tsx` with the direct manual form `node --import tsx`.
- Updated the daemon verification-budget comment with the reviewer's direct-launch measurements (446/442/515 ms) and removed the stale `npx` attribution; the 2,500 ms brake is unchanged.

### FX-01 evidence and gates

- Three direct-child spawning cases (SIGTERM, SIGHUP, SIGINT) ran 10 consecutive times: **30/30 passed**.
- Repetition log: `docs/plans/391-day3-core/kept-logs/item32-spawn-x10.log.txt`.
- Complete daemon signal block: 7 passed, 97 skipped.
- Targeted log: `docs/plans/391-day3-core/kept-logs/dlg-0030-fx01-targeted.log.txt`.
- Root TypeScript check passed.
- Scoped Biome passed for `daemon.ts`, `daemon.test.ts`, and `core/daemon/lifecycle.ts`.
- Full extension suite: 172 files passed, 2 skipped; 4,153 tests passed, 15 skipped.
- Full-suite output: `docs/plans/391-day3-core/kept-logs/vitest-phase15-fx01.log.txt`.
- Detached job output: `/Users/vaughanknight/.pij/pij-jolly-moose/bg-mtcdye0y-xg9t7u.log`.
- `harness checks --quick` again passed local paths, typecheck, package audit, and snapshots, with the same three unchanged baseline failures: existing `osc-7337-producer.ts` Biome findings, unavailable local `pwsh` in `release-age-policy.test.ts`, and the Windows check repeating the producer lint.
- Harness output: `docs/plans/391-day3-core/kept-logs/harness-checks-phase15-fx01.log.txt`.

## FX-02 — merge-check red under full-suite load (o-prime), fixed at af84d06; W-1/W-2 applied by the orchestrator at ship

- Red: the relay CONTROL test spawned bare `npx tsx` (cold npm lookup, 5 s marker budget) and, under vitest parallelism, timed out itself and starved two main-owned subprocess tests (`cli.inbox.integration` "appendOnce hard-link race", `cli.integration` "'invalid Codex UUID'…"). Isolation green.
- Fix: the control launches the same relay binary through `createRequire(import.meta.url).resolve("tsx/cli")` with `process.execPath` (no npx), and the marker wait is a 15 s COLD-START CEILING (measured 557–761 ms; the ceiling bounds only the failure case). No serialisation, no vitest config change.
- Reviewer's out-of-vitest measurement (review-01.md § Re-review FX-02): production 581 ms / relay control 557 ms / historical `npx tsx` 3183 ms — npx cost 5.7× and left 1.57× headroom against 5 s on an idle box; the o-prime observed 16–20× stretch under load.
- Evidence (gitignored, kept): `docs/plans/391-day3-core/kept-logs/item32-fx02-full-1.log.txt`, `item32-fx02-full-2.log` (fresh-worktree full runs, 4153/0 each, both main-owned tests named green), `item32-fx02-relay-target.log`.
- W-2 (orchestrator, at ship): the neighbouring 15-FX real-daemon test used the same construct with a 5 s marker / 10 s test timeout — under the observed stretch it would be the next casualty; raised to the same 15 s ceiling (and 30 s test timeout). Rationale recorded here so the constants survive with a reason.
- Pre-existing, not folded: `pij-skill-check` is a load-sensitive slow file (62 s under a full 236-file run vs 40 s), green in isolation at both SHAs.
