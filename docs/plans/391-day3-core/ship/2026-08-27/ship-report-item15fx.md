# Ship report — 15-FX (Phase 14): real-SIGTERM daemon test — remove the tsx CLI relay from the signalled process

**claim**: PR #29 open (`s391/item15fx-sigterm-relay` @ `c7199ea`, base `f6621fe`); cold review APPROVE (mechanism confirmed in tsx source: 30 ms relay windows → SIGKILL mid-shutdown → 143 + lock leak); full suite green. Ready for o-prime merge (test-only; no daemon restart needed).

**artifacts**
- PR: https://github.com/vaughanknight/pij/pull/29 (body `docs/plans/391-day3-core/logs/pr-item15fx-body.md`)
- plan: `docs/plans/391-day3-core/391-day3-core-plan.md` Phase 14 (AC-31)
- packets: `docs/plans/391-day3-core/tasks/phase-14-item-15fx-sigterm-flake/{tasks.md,packet-addendum.md,review-brief.md,execution.log.md}`
- verdict: `…/phase-14-item-15fx-sigterm-flake/review-01.md`
- E22 evidence: `docs/plans/391-day3-core/logs/sigterm-probe/` (60 base runs, all kept, 0 red locally), `docs/plans/391-day3-core/logs/sigterm-direct-proof-rebased/` (20/20); s392 surviving record `reviews/item-29b-t001-wiring-refold-reconfirm.md:246-248` (1 red, 143 vs 0)

**shas**: `52454fe` spawn via `--import tsx` · `c7199ea` rebased proof record

**gates**: `npx vitest run .pi/extensions/pij/` 172 files / 4115 passed / 15 skipped / 0 failed (`docs/plans/391-day3-core/logs/vitest-phase14.log`); tsc clean; biome clean; `daemon.ts` byte-identical to main.

**observations**
- Root cause is structural (relay process between test and daemon), not timing in the daemon; the local reproduction rate was 0/60 — the fix was judged on mechanism (E22: never loop into green; every run's log kept).
- s392's original red had no surviving log (torn-down worktree) — E22 miss recorded on their side; the o-prime relayed the surviving review lines.

**open**: reviewer F-2 (out of scope) — production runs the daemon under the same tsx relay (`cli.ts:1598`); a signal to the relay SIGKILLs the daemon after ~60 ms and leaks both spine locks (`pij daemon stop` is safe: inner pid). Escalated to the o-prime as an item candidate; no test covers the relay topology now.
