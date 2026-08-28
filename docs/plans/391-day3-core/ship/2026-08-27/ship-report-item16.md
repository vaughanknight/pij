# Ship report — item 16 (Phase 7): creator notices route to the current parent (parentId → spawnedBy, liveness-aware)

**claim**: PR #28 open (`s391/item16-watchdog-parent-route` @ `02909d6`, base `e6a55e8`); cold review APPROVE-WITH-FINDINGS → FX-01 (F-1 dead-parent regression, F-2 sensor) → re-review APPROVE-WITH-FINDINGS (G-1/G-2 mediums) → FX-02 → re-review APPROVE-WITH-FINDINGS (all closed; lows carried); full extension suite green after rebase. Ready for o-prime merge (rides daemon restart #7).

**artifacts**
- PR: https://github.com/vaughanknight/pij/pull/28 (body `docs/plans/391-day3-core/kept-logs/pr-item16-body.md`)
- plan: `docs/plans/391-day3-core/391-day3-core-plan.md` Phase 7 (AC-21)
- packets: `docs/plans/391-day3-core/tasks/phase-7-item-16-watchdog-parent-route/{tasks.md,packet-addendum.md,fix-01.md,review-brief.md,execution.log.md}`
- verdicts: `…/phase-7-item-16-watchdog-parent-route/review-01.md` (round 1 + `## Re-review FX-01` + `## Re-review FX-02`); packets `fix-01.md`, `fix-02.md`
- rulings: `docs/plans/391-day3-core/rulings.md` (item 16 rows: fence widenings ×3, FX authorisation, verdict, FX-01)

**shas**: `528a0f1` route to current parent · `0f10d7c` recipient from the persisted descriptor (coder self-validate race) · `cc96eca` docs · `4a70a26` FX-01 live-recipient resolver + F-2 sensor · `b16d18a` FX-02 hot-only view + bounded summary · `02909d6` H-2 doc fix (rebased stack; pre-rebase SHAs as reviewed)

**gates**
- `npx vitest run .pi/extensions/pij/` at 4a70a26: 171 files / 4093 passed / 15 skipped / 0 failed — `docs/plans/391-day3-core/kept-logs/vitest-phase7-fx01.log.txt`; rebased run: 172 files / 4115 passed / 15 skipped / 0 failed — `docs/plans/391-day3-core/kept-logs/vitest-item16-rebased.log.txt`
- tsc clean · biome clean on changed .ts
- Dim-0: round 1 — 10 mutations, 9 RED, 1 survivor (F-2) → FX-01 kills it; re-review FX-01 — 20 mutations, 17 RED; re-review FX-02 — 16 mutations, 15 RED, 1 survivor (H-1: fixture gap on the daemon.ts:1144 path, not a shipped defect)
- known-red unchanged: `release-age-policy.test.ts` (pwsh), OSC-7337 lint baseline

**observations**
- DL-014: the phase manifest named `binding.ts` + `daemon.ts`; the `spawnedBy` gates also lived in `core/daemon/loop.ts` (×3) and `death-reconciler.ts` — three fence widenings mid-RED. A planning-time `git grep spawnedBy .pi/extensions/pij/core/daemon` enumerates them.
- Coder self-validate (validate-v2 on its own commit) caught a real race (tick snapshot vs persisted re-link) before review — worth keeping as a coder-side step.
- DL-015/DL-016: copilot composer wedge (stale injected line) and `/compact` semantics — `--body-file` delivers it as prose; even `cmd:compact` waits in copilot's queue until a turn boundary (`Ctrl-Q` → `s` runs it).
- DL-017: my fix-01 rule ("one operator line per withheld notice") collided with task #34's count-not-N aggregation (`daemon.ts:828`) and passed coder + sanity; the cold reviewer executed N=1000 and caught it (G-1). FX-02 folds withheld notices into the existing summary. Packet-authored log rules must name the aggregation they join.
- G-2: the first FX-01 cut added an unthrottled archive scan (`listTerminal`) to the 600 ms tick for zero routing effect (+77 ms @4000 archived) — caught by measurement in re-review; removed in FX-02.
- Legacy stall notices fire every ~2 min on any seat inside a long tool call (AC-29, item 31).

**open** (recorded, not fixed here)
- F-4 (low, declared boundary): bind-refusal and needs-human diagnostics still go to the spawner while the outcome notice goes to the parent.
- F-5 → item 31 AC-30: sensor notices are still signed as the observed seat.
- H-1 (low): archive-read sensor fixture ticks an empty home, so the `lifecycleNoticeRecipient` path (stalled/provider-failure) is unsensored for archive reads — register one stalled seat in `daemon.test.ts:1596-1609`.
- H-3 (low): a cleanly dissolved parent logs as bare "absent" (FX-01 said "dissolved"); routing identical.
- H-6 (info): `resolveNoticeRecipient` rebuilds its map per call — 503 ms @4000 dead seats, one-shot per death event.
- Absent-from-registry recipients are now withheld (+ one log line) where base delivered into a void — documented; o-prime to confirm the policy.
