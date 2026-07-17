# s055-pij-watchdog — Phase 2 checkpoint (daemon manager + CLI surface COMPLETE)

**From**: pij-intimate-mandrill · **To**: pij-reasonable-dove (o-prime)
**Date**: 2026-07-17 · **Stage**: P2 done + reviewed + committed; P3 next (isolated proof, parity & docs — baton-gated daemon proofs are temp-daemon only)

## claim

Phase 2 landed via the ruled fleet. The daemon now owns first-class watchdogs:
WatchdogManager with descriptor-anchored scheduling (b36edf0 honored — no
event-stream reads anywhere, verified by reviewer grep + my own), watchdog-
owned stall episodes that only typed recovery can clear, D4 attribution
covering BOTH transition edges and guarding descriptor persistence itself,
both compact-pause seams (tmux router + pi onInbound), bounded on-fire
captures (always/anomaly), FsWatchdogStore, the `pij watchdog` verb family
with D2 tier strength (pause cannot downgrade exempt), and `spawn
--no-watchdog`. Cross-model review: FIX_REQUIRED (3 critical / 2 high, with
runtime reproductions) → APPROVE across two rounds; both Dim-0 attribution
mutations now RED. First fleet run under doctrine Seq 444 — the fix packet
carried /builder 6 implement direct-jump and the coder executed it cleanly.

## artifacts

- .pi/extensions/pij/{core/daemon/watchdog-manager.ts,+.test.ts,adapters/watchdog-store.ts} (new), daemon.ts/router.ts/session.ts/core/cli.ts/spawn.ts/types.ts/index.ts/cli.ts (additive) — commit de6789a
- tasks/phase-2-daemon-manager-cli-surface/{tasks.md,execution.log.md} — honest RED→fix history incl. per-finding dispositions
- .flow-pair ledger: dlg-0002, diff-0002, review-dlg-0002.md (2 rounds), fix-0002, worker reports
- .harness/records/retro/2026-07-17/002-055-pij-watchdog-p2.md — P2 drain (1 entry, fixed-now)
- Drain fix — commit ff64d91: flow-pair-mutate multi-arg join (variadic *test_cmd degraded to bare npx → false mutation verdicts; hit by reviewer AND coder; proven RED 1/27 → GREEN 27/27 with the previously-failing form)

## shas

- worktree HEAD: ff64d91 (9d3b034 orchestrator records → de6789a feature → ff64d91 drain fix) on s055/pij-watchdog
- plan pin unchanged: 14b03626cf3c9ddb942350d40ebb60c1b59a05dcd0c65f206142f3a1a6618345

## gates

- just typecheck / test (2072 passed, 11 skipped) / lint: green (reviewer-independent + my re-run)
- Review: APPROVE round 2; Dim-0 both axes RED/restored-GREEN (reviewer + my end-to-end re-run)
- SW-6: core/daemon/loop.ts ZERO diff across the whole phase; daemon.ts additive-minimal (verified reviewer + orchestrator)
- Orchestrator sanity pass: suite 27/27 re-run; guards verified at daemon.ts:253-257 (pane attribution ahead of persistence) + core/cli.ts:868-871 (exempt rejection)

## cross-stream

- Seq 442/444/447 all honored: b36edf0 constraint relayed mid-build and confirmed in coder report; doctrine Seq 444 applied at fix-0002 (first packet after ruling); build-against ref advanced to 647076a (contract fields unchanged) — convergence rebase targets 647076a, drift through you
- P2 was the SW-6 overlap window; it closed with zero loop.ts contact

## open

- P3 next: temp-daemon isolated proofs (AC-09; daemon restarts stay baton-gated — proofs only, no restart), smoke scenario, docs/how/pij-watchdog.md, s054 convergence note (task 3.4)
- Jordan's three plan defaults still standing unopposed (pause verbs / --no-watchdog exemption / 40-line-4KiB anomaly-only capture) — P3 documents them
- Reviewer pij-tame-takin warm for P3; coder is Jordan's peer, reused
