# Baton book
**Writer**: pij-3vetx8 (o-prime; single writer) · **Updated**: 2026-07-11T08:42:00Z
Request: `pij send pij-3vetx8 "baton-request <baton> — <purpose>"`. Grants are pushed. One holder; the book binds the o-prime too.

| Baton | Resource + free probe | Holder | Since | Purpose | Queue |
|---|---|---|---|---|---|
| daemon-restart | The machine-wide pij daemon (restart interrupts delivery for EVERY live peer, all repos) · probe: `pij daemon status` | — free | — | — | — |
| git-index | This repo's staging area + local commits · probe: `git diff --cached --quiet` exits 0 | — free | — | — | — |
| push-main | `git push` to main (shared trunk) · probe: no unpushed release-bearing commits | — free | — | — | — |
| cli-ts-window | `.pi/extensions/pij/cli.ts` edit window (SW-3 serialized surface) · probe: `git diff --name-only .pi/extensions/pij/cli.ts` empty | **pij-aa756x (s037)** — pushed 11:26Z after s036's commit closed its hold | 2026-07-11T11:26Z | T004 polling change; FIRST ACT (ruled): bin bridge cli.ts:1959 vs reshaped wait-follow union | — |

**Standing rules (adopted day one from INC-004, run-01)**: commits are pathspec-mandatory (`git commit -- <paths>`, never bare); a commit-slot (announce→ack→commit→confirm) applies while any other seat has an apply window open; docs edits during a held git-index are unstaged-only and disclosed.

## Grant log

_Append only: ISO · baton · holder · action — note._

```text
- 2026-07-11T08:42:00Z · book seeded, all batons free.
- 2026-07-11T10:25:00Z · cli-ts-window · pij-1khprxk (s036) · RECOGNIZED (retroactive) — pre-grant probe for s037's request found s036's uncommitted fence-era wiring; hold recorded, not newly granted. s037 QUEUED; closure = s036's commit (E-16: compile + targeted tests at close).
- 2026-07-11T11:15:00Z · daemon-restart · pij-1khprxk (s036) · GRANTED — T011 live-verify window (<10 min, pre-staged E2E: define→request→pushed grant→scratch holder death→ONE sweep alert→reclaim→teardown). Pre-grant: daemon running pid 75408; machine-wide heads-up broadcast to pij-1ca01u5, pij-uec99o, s037 (notify-not-ask). Return evidence: command outputs + alert capture.
- 2026-07-11T12:14:00Z · git-index · pij-aa756x (s037) · RETURNED — commit e66df61 o-prime-verified (HEAD ✓, tsc errors 0 ✓, former reds 52/52 green ✓, index empty ✓); cli-ts-window CLOSED per E-16 + FREED; named-error exclusion EXPIRED; s036 fence-scoped concession LIFTED.
- 2026-07-11T12:52:00Z · push-main · pij-3vetx8 (o-prime) · SELF-GRANTED — the keeper requests, logs, and returns like anyone else. Purpose: the ruled single consolidated push (both ships + governance snapshot). Pre-grant probes: both ship reports verified; s036 flow at ship node; gates green per reports; no competing git activity.
- 2026-07-11T12:46:00Z · git-index · pij-1khprxk (s036) · RETURNED — 953258a verified pattern (single file, lint 0 errors). FREE.
- 2026-07-11T12:45:00Z · push-main · ARMED — gate 1 (o-prime deconfliction) CLEARED for both ships; gate 2 (Jordan typed `PUSH MAIN`) VERIFIED at s037 rulings.md:58, scoped to the single consolidated push AFTER s036's ship report. Veto window open in the o-prime's pane.
- 2026-07-11T12:40:00Z · git-index · pij-1khprxk (s036) · GRANTED — one-line lint fix-commit on watcher.test.ts (full-checks caught a dropped space; <2 min hold).
- 2026-07-11T12:30:00Z · git-index · pij-1khprxk (s036) · RETURNED — 9a85852 verified (1 file, rituals/batons.md, 69 lines; gate-before-commit output attached). Both look-notes folded (self-grant story, INC-004 cite, exemplars pointer — o-prime read the shipped text). Baton FREE.
- 2026-07-11T12:24:00Z · git-index · pij-1khprxk (s036) · GRANTED — T014 land (batons.md ritual rewrite, approved draft + 2 folded notes, single-file pathspec, gate-before-commit, <5 min pre-staged hold).
- 2026-07-11T12:22:00Z · git-index · pij-1khprxk (s036) · RETURNED — b412f7d o-prime-verified (1 file, watcher.test.ts only, index clean). Ruling #8 CLOSED: deflake over removal, 5/5 pre-recorded greens. Baton FREE.
- 2026-07-11T12:14:00Z · git-index · pij-1khprxk (s036) · GRANTED (queued request served) — deflake pathspec commit (watcher.test.ts, ruling #8); pre-grant: index empty ✓, HEAD green ✓.
- 2026-07-11T11:58:00Z · git-index · pij-aa756x (s037) · GRANTED — commit slot per verified manifest (index empty, APPROVE + Dim-0 on disk); this commit closes cli-ts-window per E-16 and restores GLOBAL suite green (expires the named-error exclusion + s036's fence-scoped concession).
- 2026-07-11T11:26:00Z · daemon-restart · pij-1khprxk (s036) · RETURNED — hold <4 min; o-prime verified: daemon pid 75408→14681 running; E2E evidence at reports/live-verify-window.md (define→request→grant w/ blockedTimeMs→holder death→exactly ONE sweep alert→evidenced reclaim→lease freed; reclaim notice to dead holder honestly unverified). First full cycle of the primitive UNDER the book that specified it.
- 2026-07-11T11:26:00Z · git-index · pij-1khprxk (s036) · RETURNED — commit 1813803 verified (33 files, pathspec-limited, addendum file included); index probe clean; residual dirt attributed to s037 scope + benign churn. cli-ts-window CLOSED per E-16 (unified-0 additive proof cited) and PUSHED to s037.
- 2026-07-11T11:15:00Z · git-index · pij-1khprxk (s036) · GRANTED (ordered AFTER the restart window) — phase-1 pathspec-limited commit of its fence incl. NEWLY-GRANTED addendum file `.pi/extensions/pij/orchestration-notice.integration.test.ts` (action-derived, o-prime verified exists). Pre-grant probe: index empty ✓; review round-3 APPROVE verified at reviews/review.phase-1.dlg-0001.md:181 w/ byte-identical mutation restores. The commit CLOSES cli-ts-window per E-16; window then pushes to s037 (first act: bin bridge cli.ts:1959).
```
