# Ship report — item 33 (Phase 16): plan-055 watchdog smoke proof resurrected

**claim**: PR #__ open (`s391/item33-watchdog-smoke-proof` @ `<sha>`, base `<main>`); cold review `<verdict>`; full extension suite green; `watchdog-smoke: green` on head. Not pre-tag; closes the release-notes known gap.

**artifacts**
- PR: https://github.com/vaughanknight/pij/pull/__ (body `docs/plans/391-day3-core/kept-logs/pr-item33-body.md`)
- plan: `docs/plans/391-day3-core/391-day3-core-plan.md` Phase 16 (AC-33)
- packets: `docs/plans/391-day3-core/tasks/phase-16-item-33-watchdog-smoke-proof/{tasks.md,packet-addendum.md,review-brief.md,execution.log.md,logs/}` (dlg-0031)
- verdict: `…/phase-16-item-33-watchdog-smoke-proof/review-01.md`
- drift evidence: `docs/plans/391-day3-core/kept-logs/smoke-red.log.txt`, `smoke-red-2.log`, `smoke-red-3.log`, `run-proofs-partial.patch`

**shas**: `cf80e80` WIP checkpoint (rebased) · `785550b` restore live smoke proof (base `bf1827c`)

**gates**: `npx vitest run .pi/extensions/pij/` 172 files / 4160 passed / 15 skipped / 0 failed (`docs/plans/391-day3-core/kept-logs/vitest-phase16.log.txt`); tsc clean; biome clean; smoke runner: `watchdog-smoke: green` with `baseline-red[pwsh]` / `baseline-red[OSC]` on their own lines (`tasks/phase-16-…/logs/smoke-runner-final-rebased-2.log`); fire-path mutation → `smoke first fire was not queued` (`logs/sensor-mutation-red-final.log`), restored green (`logs/sensor-restored-green-final.log`); 13 full-proof runs kept (`logs/run-*.log`)

**observations**
- Three masked drifts in one sensor, each revealed by fixing the previous — a dead sensor decays in layers; the baseline reds (pwsh/OSC) hid all of them. The unmaskable `watchdog-smoke:` line is the encode.
- DL-020 (reviewer, item 32): `/tmp` → `/private/tmp` defeats the daemon's raw-string run-if-main guard — proofs must run from a realpath cwd.

**open**: `<from the verdict>`
