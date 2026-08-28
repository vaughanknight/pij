# Phase 14 execution log

## T001 — base probe

- Branch: `s391/item15fx-sigterm-relay`
- Base and probe HEAD: `e6a55e81163a8f95e7302f536f8423035ad7e99b`
- Command: `npx vitest run .pi/extensions/pij/daemon.test.ts -t "releases write.lock and events.lock"`
- Result: **0 failures in 60 runs — not reproduced locally**.
- Per-run output is preserved under `docs/plans/391-day3-core/logs/sigterm-probe/run-001.log` through `run-060.log`; `docs/plans/391-day3-core/logs/sigterm-probe/summary.txt` records `failed_run=0`.
- Historical failure retained by the packet: the tsx CLI relay sometimes exits with code 143 after forwarding SIGTERM, racing the inner daemon's handled exit code 0.

## Run-if-main guard probe

- Command: `node --import tsx docs/plans/391-day3-core/logs/sigterm-run-if-main-probe.ts`
- Preserved output: `docs/plans/391-day3-core/logs/sigterm-run-if-main-probe.log`
- Result:

```json
{"importMetaUrl":"file:///Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/docs/plans/391-day3-core/logs/sigterm-run-if-main-probe.ts","argv1":"/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/docs/plans/391-day3-core/logs/sigterm-run-if-main-probe.ts","guardMatches":true}
```

The `--import tsx <script>` form keeps `process.argv[1]` equal to the executed script, so the daemon's run-if-main guard remains valid.

## T002 — direct-child implementation

- Replaced `spawn(process.execPath, [TSX_CLI, DAEMON_BIN], ...)` with `spawn(process.execPath, ["--import", "tsx", DAEMON_BIN], ...)`.
- Removed the now-unused `createRequire` import and `TSX_CLI` resolution.
- Kept the exit assertion `{ code: 0, signal: null }` and both lock-removal assertions unchanged.
- Root cause: the old test signalled tsx's CLI relay, whose default SIGTERM exit could race the inner daemon's handled exit 0; the new test signals the daemon process directly.
- Proof command: 20 fail-fast runs of `npx vitest run .pi/extensions/pij/daemon.test.ts -t "releases write.lock and events.lock"`.
- Result: **20/20 passed**.
- Per-run output is preserved under `docs/plans/391-day3-core/logs/sigterm-direct-proof/run-001.log` through `run-020.log`; `docs/plans/391-day3-core/logs/sigterm-direct-proof/summary.txt` records `failed_run=0`.

## Post-rebase proof

- Fetched `origin/main` and rebased after Item 16 merged.
- Rebased implementation commit: `52454fe`.
- Repeated the fail-fast 20-run direct-child proof after the rebase.
- Result: **20/20 passed**.
- Per-run output is preserved under `docs/plans/391-day3-core/logs/sigterm-direct-proof-rebased/run-001.log` through `run-020.log`; `docs/plans/391-day3-core/logs/sigterm-direct-proof-rebased/summary.txt` records `failed_run=0`.

## T003 — final gates

- Full extension suite via `pij bg`: **172 files passed, 2 skipped; 4,115 tests passed, 15 skipped**.
- Full-suite output: `docs/plans/391-day3-core/logs/vitest-phase14.log`.
- Root TypeScript check: `npx tsc --noEmit -p .` passed.
- Scoped Biome: `npx biome check .pi/extensions/pij/daemon.test.ts` passed.
