# s055-pij-watchdog — Phase 1 checkpoint (pure watchdog core COMPLETE)

**From**: pij-intimate-mandrill · **To**: pij-reasonable-dove (o-prime)
**Date**: 2026-07-17 · **Stage**: P1 done + reviewed + committed; P2 next (daemon surface — SW-6 overlap window opens at its dispatch)

## claim

Phase 1 landed via the ruled fleet (coder pij-wilful-ladybug + reviewer
pij-tame-takin, both gpt-5.6-sol xhigh). The pure watchdog core exists,
TDD-proven: default-on config, three pause tiers, activity-anchored fire
scheduling, delivered-but-no-output stalled derivation with TYPED watchdog
attribution (the D4 self-masking guard — review round 1 caught a real hole
here, fixed and mutation-verified in round 2), self-teaching turns, bounded
capture policy, shared compact-pause hook. Cross-model review: FIX_REQUIRED →
APPROVE across two rounds with real mutation evidence. All gates green
including `harness checks` 8/8. Two commits on s055/pij-watchdog.

## artifacts

- .pi/extensions/pij/core/watchdog.ts + watchdog.test.ts (new), types.ts (additive) — commit bb863b0
- docs/plans/055-pij-watchdog/reviews/review.phase-1.md (2-round review, mutation evidence)
- docs/plans/055-pij-watchdog/tasks/phase-1-pure-watchdog-core/{tasks.md,execution.log.md} (T001–T008 all [x], honest history)
- .flow-pair/runs/2026-07-17T01-03-56Z…/ (ledger: dlg-0001, rev-0001, fix-0001, learn-0001/0002, roster)
- .harness/records/retro/2026-07-17/001-055-pij-watchdog-p1.md (6 drained observations, Jordan-ruled dispositions)
- Drain fixes (Jordan in-pane rulings) — commit bf056a7: de-flaked release-age pwsh probe (s048 surface, ruled); pkg audit now report-only (write-back behind --write); flow-pair-mutate suite passthrough; AGENTS.md worktree pi-spawn trap doc; governance evidence-path fix

## shas

- worktree HEAD: bf056a7 (bb863b0 = feature, bf056a7 = drain fixes) on s055/pij-watchdog
- plan pin unchanged: 14b03626cf3c9ddb942350d40ebb60c1b59a05dcd0c65f206142f3a1a6618345

## gates

- just typecheck / test (2045 passed) / lint: green · harness checks 8/8
- Review: APPROVE (round 2) with Dim-0 mutation evidence both rounds
- Orchestrator sanity pass: held (guard verified at watchdog.ts:102; reviewer repro re-run)

## observations

- MACHINE-WIDE: pi worktree spawns die at boot from global-link/project extension conflicts (DL-003) — cost 3 spawns + a Jordan hand-spawn; workaround (spawn from main checkout + pivot) proven with the reviewer and documented in AGENTS.md; real fix candidates listed there
- harness checks was MUTATING .pi/packages.yaml mid-audit (DL-005) — now report-only by default; other streams' workers stop inheriting dirty diffs
- Pane footer beats model self-report for canaries (INS-001) — ladybug self-reported the wrong model; footer was truth; validates s055's own capture thesis
- Fleet lessons banked as prompt-lab candidates: learn-0001 (packets must demand bookkeeping artifacts) + learn-0002 (mutation via explicit suite)

## open

- P2 dispatch = first daemon.ts/loop.ts touch → I will notify you AT THAT MOMENT for the SW-6 overlap timestamp (per your rules; second-lander-rebases acknowledged)
- Jordan's three plan defaults still standing unopposed (pause verbs / exemption / capture defaults) — P2 builds to them
- Reviewer pij-tame-takin (spawnedByUs) kept warm for P2; coder is Jordan's peer, reused on his say
