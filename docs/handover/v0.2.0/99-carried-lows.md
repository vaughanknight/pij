# 99 — Carried lows from merged s391 items (recorded, not fixed; each with its pointer)

**Item id / stream at handover:** carried findings from items 15, 16, 31, 32 (all merged) · s391-day3-core
**Status at v0.2.0 (tag `d120c53`):** open, non-blocking; every one was accepted by the o-prime at merge with the reason below
**Size estimate:** S each (minutes to an hour) · **Order / dependencies:** none; batch them into one "hygiene" PR

## 1. Why this exists
Cold reviews of the merged PRs left low/info findings the o-prime ruled acceptable to ship. They are real, small, and would otherwise be lost in review files. Source verdicts: `docs/plans/391-day3-core/tasks/phase-*/review-01.md` on the merged branches (now on `main` only via the PR history — the review files were never merged; they live in the s391 worktree and are quoted here with the finding ids).

## 2. What is ruled
- Item 15 G-3 → **accepted as an AC-20 amendment** (o-prime, PR #27 merge): on the `events.lock` zero-budget bail in `adapters/spine-store.ts` (reclaim branch) the reclaim receipt is dropped — `reclaimIfDead` has already removed the lock but the deadline check returns before the receipt is appended. Fails safe (the lock is gone); the audit line is lost. Not to be "fixed in passing" (item 31 packet note).
- Everything else below: fix when touching the file, or as one hygiene PR.

## 3. Where the code is (at tag `d120c53`)
| # | Finding | File / line at d120c53 | What must change |
|---|---|---|---|
| 15 G-3 | reclaim receipt dropped on zero-budget `events.lock` bail | `.pi/extensions/pij/adapters/spine-store.ts` — the `reclaimIfDead` branch that returns `err` before the critical section (grep `reclaims`) | append the reclaim note before returning, or document the gap in the spine (AC-20 amendment says: leave) |
| 15 G-1/G-2 | production-resident test hooks `PIJ_TEST_HOLD_LOCKS_ON_START` (`daemon.ts holdSignalTestLocks`) and `interleaveReviveMarkerForTest` (`cli.ts`) do not guard that `PIJ_HOME` is a scratch dir; with the env set a live daemon can never write its own spine | `daemon.ts` (grep `holdSignalTestLocks`), `cli.ts` (grep `interleaveReviveMarkerForTest`) | one-line guard each: refuse unless `PIJ_HOME` is under `os.tmpdir()`/mkdtemp |
| 15 G-4 | CLI requeue warning unsensored | `cli.ts` revive/un-retire path (grep `requeue`) | a test asserting the stderr line |
| 15 G-6 | three `FsRegistry` construction sites still silent on descriptor-lock reclaim | `.pi/extensions/pij/index.ts` (two), `telegram/index.ts` (one) — grep `new FsRegistry(` | route through the central factory that logs reclaims (`createDaemonRegistry` / the CLI warning factory) |
| 15 G-7 | `fs-registry.ts` prints "locks are never stolen … remove the file manually: <path>" immediately AFTER reclaiming and deleting that file | `adapters/fs-registry.ts` (grep `remove the file manually`) | make the message conditional on the reclaim NOT having happened |
| 16 H-1 | archive-read sensor fixture ticks an empty home, so the `lifecycleNoticeRecipient` path (stalled / provider-failure) is unsensored for archive reads | `daemon.test.ts` fixture (grep `noticeRegistryView` sensor) | register one stalled seat with an unavailable recipient in that fixture |
| 16 H-3 | a cleanly dissolved parent logs as bare `absent` (indistinguishable from a bogus id) | `core/binding.ts resolveNoticeRecipient` → `recipientCandidate` states | classify `dissolved` from the archive tier only when the sweep already holds it — or keep `absent-or-archived` wording |
| 16 H-6 | `resolveNoticeRecipient` rebuilds its id→descriptor map per call — 503 ms @ 4000 dead seats, one-shot per death event | `core/binding.ts resolveNoticeRecipient` | build the map once per sweep and pass it in |
| 16 F-4 | bind-refusal and needs-human diagnostics still go to the spawner while the outcome notice goes to the parent (declared boundary) | `core/daemon/loop.ts reportBindRefusal`, needs-human relay (grep `flaggedHuman`) | route via `resolveNoticeRecipient` like the others |
| 31 P-2 | the 60 s sustained-liveness CLEAR window is load-bearing (item 31 M-1 proved it) but undocumented | `core/daemon/watchdog-manager.ts reportSustainedLiveness` (`Math.min(cfg.intervalMs, STALE_AFTER_MS)`), `docs/how/pij-watchdog.md` | one paragraph in the doc |
| 32 P-4 | `bgNotifyArgv()` still uses the tsx CLI relay idiom (never signalled; low) | `cli.ts` (grep `bgNotifyArgv`) | use `daemonLaunchArgv`-style direct child |
| 32 W-3 | relay-control exit assertion is a tautology on the exercised path (`expect(129).toBe(129)` when the relay dies by SIGHUP) | `daemon.test.ts` relay control | assert on the lock-leak + pid split only, or on `signal` |
| 32 W-5 | `probeRealDaemonSignal` declares `"SIGHUP" | "SIGTERM"` but `it.each` passes `"SIGINT"` — tsc silent (param widened) | `daemon.test.ts` | widen the type to the three signals |
| DL-020 | macOS `/tmp` → `/private/tmp` defeats the raw-string run-if-main guard (`daemon.ts` `import.meta.url === file://argv[1]`): a daemon launched by a `/tmp` path exits 0 silently | `daemon.ts` (grep `import.meta.url ===`) | compare `realpath`s, or print a marker on the not-main branch |

## 4. Acceptance
One hygiene PR; each row gets its own test or a stated "comment-only". Mutants: G-1/G-2 — unset the scratch guard → the guard test RED; H-1 — revert the fixture → the archive-read sensor stays green (proving it was blind) then RED after; W-5 — tsc catches a wrong signal literal.

## 5. Live verification
Not needed except G-1/G-2 (a live daemon with the env var set must refuse to start, not wedge).

## 6. Risks / gotchas
E40 (the mutant must hit code no existing test drives) — H-1 is exactly a fixture that made a sensor blind; E34 — G-6's factories exist because a sensor must prove the layer it drives.

## 7. Open questions for the human
None.
