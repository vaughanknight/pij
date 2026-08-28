# Phase 14: 15-FX — item 15's real-SIGTERM child test flakes (tsx relay race) — tasks dossier
**Plan**: § Phase 14, AC-31 · **Branch/PR**: `s391/item15fx-sigterm-relay` off `main` · **Domain**: daemon test harness only
**Evidence**: o-prime 23:5xZ — `daemon.test.ts` "the real daemon SIGTERM path releases write.lock and events.lock in a temp home" flaked 1/7 on s392's fresh-main runs (143 vs 0). No raw log survives (s392's reviewer ran it in a torn-down worktree — E22 miss on their side). Surviving record: `/Users/vaughanknight/GitHub/pij-worktrees/s392-day3-codex-doctrine/docs/plans/392-day3-codex-doctrine/reviews/item-29b-t001-wiring-refold-reconfirm.md` lines 246-248 (READ ONLY, other stream's worktree — do not write there): first run `{code:143}` vs `{code:0}`, then 2×75 passed; isolated 2× passed; main full-file 2×70 passed. So the flake rate is low (≈1/200): T001's loop must KEEP EVERY RUN'S OUTPUT to a file (`docs/plans/391-day3-core/kept-logs/sigterm-probe/run-NNN.log.txt`), cap at 60 runs, stop at the first red, report N and paste the red output verbatim into execution.log.md. 0/60 is a valid, reportable outcome.
### Executive Briefing
- **Purpose**: the test spawns `node <tsx/cli> daemon.ts` (`:46-47`, `:2119`). tsx's CLI is a relay process that forwards SIGTERM to the real node child; the relay's exit status races the inner child's `exit(0)` (`daemon.ts:1816-1819`). The daemon is not racy (handlers installed before the `PIJ_TEST_LOCKS_HELD` marker, `daemon.ts:1840-1849`).
- **Goals**: ✅ AC-31 daemon as the DIRECT child (`--import tsx`, precedent `adapters/channel.test.ts:155`); 20/20 green; failure log kept.
- **Non-Goals**: ❌ any `daemon.ts` change · ❌ loosening the assertion to accept 143 · ❌ retries/re-runs inside the test.
### Pre-Implementation Check
| File | Exists? | Notes |
|---|---|---|
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/daemon.test.ts` | yes | `TSX_CLI`/`DAEMON_BIN` `:46-47`; spawn `:2119`; assertion `{code:0, signal:null}` |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/adapters/channel.test.ts` | yes (READ ONLY) | `--import tsx` precedent `:155` |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/daemon.ts` | yes (OFF LIMITS) | run-if-main guard `:1840` — probe that `--import tsx <file>` satisfies `import.meta.url === file://argv[1]` before editing |
### Tasks
| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | PROBE on base: loop `npx vitest run .pi/extensions/pij/daemon.test.ts -t "releases write.lock and events.lock"` up to 60×, each run's stdout+stderr to `docs/plans/391-day3-core/kept-logs/sigterm-probe/run-NNN.log.txt`, stop at first red; record N + the red output verbatim in execution.log.md; also probe the run-if-main guard under `--import tsx` with a one-liner | test | execution.log.md | counts recorded (even if 0/20) | AC-31 |
| [ ] | T002 | IMPL: `spawn(process.execPath, ["--import", "tsx", DAEMON_BIN], …)`; drop `TSX_CLI` if unused elsewhere; assertions unchanged; 20× → 20/20 | test | `daemon.test.ts` | 20/20 | if the guard does not fire under `--import`, STOP and report — E22 quarantine (`it.skip` with the named reason + link) is the fallback, not a retry |
| [ ] | T003 | GATE full vitest via `pij bg` + tsc + biome; report per schema with the root-cause line | — | | 0 fail | AC-10 |
