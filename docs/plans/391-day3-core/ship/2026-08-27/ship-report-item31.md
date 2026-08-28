# Ship report — item 31 (Phase 13): watchdog projection = live fire clock · "unknown" never delivered · stall threshold ≥ seat interval · sensor-signed notices

**claim**: PR #31 open (`s391/item31-watchdog-projection` @ `307b845`, base `f9e9b1f`); cold review FIX_REQUIRED (M-1: sustained-liveness window widened out of scope, unsensored) → FX-02 (revert + sensor + lows) → re-review APPROVE (7 mutations; 60 s clear window pinned above and below; info P-1..P-3 bookkeeping); full extension suite green. Rides daemon restart #6 (o-prime baton; corrected from #7) — live proof: `pij watchdog status pij-ready-perosteck` "next due" in the future and advancing; no "watchdog unknown" bubbles to the prime; no "gone quiet" on a 20-min standby seat inside its interval; notices `from_id` = `pij-daemon`/`pij-watchdog`.

**artifacts**
- PR: https://github.com/vaughanknight/pij/pull/31 (body `docs/plans/391-day3-core/logs/pr-item31-body.md`)
- plan: `docs/plans/391-day3-core/391-day3-core-plan.md` Phase 13 (AC-27, AC-28, AC-29, AC-30; two o-prime amendments folded)
- packets: `docs/plans/391-day3-core/tasks/phase-13-item-31-watchdog-projection/{tasks.md,packet-addendum.md,review-brief.md,execution.log.md}` (dlg-0029)
- verdict: `…/phase-13-item-31-watchdog-projection/review-01.md`

**shas**: `16d02db` implementation · `98cce88` evidence record · `30ab8d6` FX-02 (liveness clear-window restored + long-interval sensor; subjectId pinned; s097 comment/anchor restored; pij#161 reversal recorded)

**gates**: `npx vitest run .pi/extensions/pij/` 172 files / 4129 passed / 15 skipped / 0 failed after rebase (`docs/plans/391-day3-core/logs/vitest-item31-rebased.log`; 4123 at 30ab8d6 in `vitest-phase13-fx02.log`); tsc clean; biome clean; four packet mutants RED (coder) — reviewer's Dim-0 in the verdict. `harness checks` red only on baseline (OSC lint, pwsh, windows-compat, plan-055 smoke proof — reproduced on clean main, DL-018).

**observations**
- DL-018: the watchdog smoke sensor (`run-proofs.ts --smoke`) was red on clean main (unawaited `daemon.tick()`), masked by the pwsh/OSC baseline reds; o-prime folded a fix into this item; the fold was STOPPED at the third distinct pre-existing drift (unawaited ticks → FsChannel-vs-sqlite → first-turn body vs pointer path) and escalated as candidate item 33; partial patch + three red logs kept. Encode candidate: a "sensor red since <sha>" report so baseline reds cannot hide a newly dead sensor.
- Item 31 grew twice mid-flight by o-prime amendment (AC-29, AC-30) — both folded before dispatch; packet regenerated three times (dlg-0024→0026→0029) as line anchors moved under item 16's merge. A packet compiled before the preceding item merges needs an anchor refresh — cheap, but easy to forget.
- DL-019: the one guard on the sustained-liveness window used `intervalMs: 100`, where the old (`min(interval, 60 s)`) and new (`max(60 s, interval)`) expressions are arithmetically identical — a sensor that cannot sense; the reviewer's revert-mutation found it. Threshold seams need fixtures on both sides of every floor.
- The stall-notice noise this item fixes cost this orchestrator ~12 turns over the day (every long tool call of the coder/reviewer tripped the 60 s detector).

**open** (info, not fixed): P-2 the 60 s sustained-liveness CLEAR window is load-bearing (M-1 proved it) but undocumented — pre-existing; add one sentence to `docs/how/pij-watchdog.md` in a later docs pass. Item 33 owns the plan-055 smoke proof.
