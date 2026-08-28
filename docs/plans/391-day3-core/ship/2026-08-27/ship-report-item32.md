# Ship report — item 32 (Phase 15): the production daemon must not die by the tsx relay

**claim**: PR #33 open (`s391/item32-daemon-direct-child` @ `83b484b`, base `74891a2`); cold review APPROVE (lows) → FX-01 (builder-only argv in tests, SIGINT sensor, comments, shebang removed; ×10 spawn run 30/30) → re-review APPROVE (M5 dead + selective; P-1 proven out-of-vitest; shebang never executable on any ref); full suite green. Live proof rides the first daemon restart after merge (o-prime baton): pane process == daemon pid; SIGHUP/SIGTERM to it release both spine locks.

**artifacts**
- PR: https://github.com/vaughanknight/pij/pull/33 (body `docs/plans/391-day3-core/logs/pr-item32-body.md`)
- plan: `docs/plans/391-day3-core/391-day3-core-plan.md` Phase 15 (AC-32)
- packets: `docs/plans/391-day3-core/tasks/phase-15-item-32-daemon-direct-child/{tasks.md,packet-addendum.md,review-brief.md,execution.log.md}` (dlg-0030)
- verdict: `…/phase-15-item-32-daemon-direct-child/review-01.md`
- mutation logs: `docs/plans/391-day3-core/logs/dlg-0030-relay-mutation-red.log`, `dlg-0030-sighup-mutation-red.log`

**shas**: `61d68f1` direct-child launch + SIGHUP · `225f443` FX-01 (as reviewed) · `af84d06` FX-02 relay control via resolved tsx/cli (as re-reviewed, APPROVE) · `83b484b` W-1/W-2 (orchestrator: FX-02 log section; sibling test 15 s ceiling) rebased on `74891a2`

**gates**: `npx vitest run .pi/extensions/pij/` ship run 172 files / 4160 passed / 15 skipped / 0 failed (`docs/plans/391-day3-core/logs/vitest-item32-ship.log`); FX-02 fresh-worktree full runs 4153/0 ×2; spawn tests ×10 = 30/30 (`item32-spawn-x10.log`); o-prime's merge-product check will be the load gate; tsc clean; biome clean; `harness checks --quick` red only on baseline (OSC lint, pwsh, windows-compat).

**observations**
- LIVE PROOF (restart #7, 05:1xZ): daemon pid 69943 = `node --import file:///…/tsx/dist/loader.mjs daemon.ts`, parent = the tmux server — no relay, no npx; both spine locks absent after the stop. AC-32 proven live.
- DL-020 (reviewer): macOS `/tmp` → `/private/tmp` defeats the raw-string run-if-main guard in `daemon.ts` — a daemon launched by a `/tmp` path exits 0 silently; compare realpaths or emit a not-main marker.
- 32-FX (o-prime merge check, before merge): the relay CONTROL test spawned bare `npx tsx` — a cold npm lookup under full-suite parallelism with a 5 s budget — and pushed two main-owned subprocess tests past their budgets (isolation green). Fixed by spawning the relay through the resolved `tsx/cli` path (no npx) with a cold budget; proven by two green full runs in a fresh worktree. Lesson: a NEGATIVE control that launches the old path must not depend on tooling the fix just removed (npx's cache/network lookup).
- The defect was found by the 15-FX cold reviewer reading tsx's own source (F-2) — a review finding that became a shipped-path fix within the same day.
- Review found an unclaimed benefit: the old relay could npx-fetch a DIFFERENT tsx (4.23.12 vs pinned 4.23.0) from a node_modules-less cwd; removed by the absolute loader URL.
- `createRequire(import.meta.url).resolve("tsx")` resolves from the CLI's install, not the cwd — the property the reviewer is asked to prove from a node_modules-less cwd.

**open** (carried): P-4 `bgNotifyArgv()` still uses the tsx CLI relay idiom (out of fence; never signalled). Reviewer's NOT-VERIFIED list: real tmux end-to-end (proven as two halves: fake-tmux composition + real node launch), Windows (`process.execPath` with a space), `pij daemon start` against the real home — the live proof on restart #6/#7 closes the first and third.
