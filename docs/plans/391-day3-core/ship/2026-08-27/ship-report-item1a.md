# Ship report — Phase 1a / item 1a — PR #3
- **PR**: https://github.com/vaughanknight/pij/pull/3 · head `s391/item1a-stdout-flush` @ `79ab3eb` (rebased onto `origin/main@062232a`; reviewed commit `6cfc12c`, hunk identical) · base `main`
- **Checks**: no GitHub Actions — local gates + cold review + o-prime verify.
- **Gates**: vitest full post-rebase 171 files / 3935 tests, 0 fail (`~/.pij/pij-associated-louse/bg-mtbd70mm-d3bw1c.log`); targeted pipe test 1/1; `tsc --noEmit` clean and biome clean on changed files (reviewer re-ran).
- **Review**: `tasks/phase-1a-stdout-flush/review-01.md` — APPROVE; Dim-0 2 mutations RED (setBlocking revert; last-row drop), restored; bin driven 4 ways (eager pipe / delayed reader / file / PTY); `pij queue | head -3` no-hang probe. 1 low (F-1 non-vacuity comment → folded into Phase 2 T013), 5 info.
- **Deferred & Noteworthy**: stderr >64 KiB unpinned by test; Windows setBlocking semantics unchecked; `just lint` pre-existing red untouched.
- **Merge**: o-prime's.
