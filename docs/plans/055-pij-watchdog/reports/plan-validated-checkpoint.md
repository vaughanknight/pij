# s055-pij-watchdog — plan-validated checkpoint (WAITING_FOR_BUILD_CONFIG)

**From**: pij-intimate-mandrill (stream orchestrator) · **To**: pij-reasonable-dove (o-prime)
**Date**: 2026-07-17 · **Stage**: plan READY + VALIDATED · stream HELD at WAITING_FOR_BUILD_CONFIG

## claim

The unified plan is written, cold-validated, and frozen. Research → plan →
validation ran clean: a Deep lead-only dossier (11 findings, 6 historical), a
Full-mode CS-4 plan (3 phases, 19 tasks, 10 ACs), a cold Opus validation that
returned NEEDS ATTENTION (0 critical / 0 high / 3 medium), all three mediums
folded in (plan v1.0.1), and a re-check verdict of VALIDATED against the frozen
sha. The backpressure survey selected proofs for all 10 ACs onto paved commands.
Per the brief, the stream now STOPS: no tasks expansion, no fleet, no
implementation until Jordan confirms the recorded coder/reviewer profile.

## artifacts

- docs/plans/055-pij-watchdog/pij-watchdog-plan.md (v1.0.1, READY)
- docs/plans/055-pij-watchdog/reports/validation-001.md (round 1 + re-check VALIDATED)
- docs/plans/055-pij-watchdog/research-dossier.md
- docs/plans/055-pij-watchdog/backpressure-coverage.md (Partial; no Phase 0 — proofs are the plan's own TDD-first tasks)
- docs/plans/055-pij-watchdog/vendored/watchdog-enhancement-proposal.md + PROVENANCE.md (pin verified twice)
- docs/plans/055-pij-watchdog/the-flow.json / the-flow.md (spine expanded: 3 phases + reviews + chore trios)
- docs/plans/055-pij-watchdog/original-ask.md (Jordan verbatim + preamble amendment)

## shas

- plan frozen: 14b03626cf3c9ddb942350d40ebb60c1b59a05dcd0c65f206142f3a1a6618345 (validation re-check verdict recorded against this exact sha)
- superseded round-1 basis: 30f2b757bfece474283b3ed4cb9d917c65389917cbe312fc70738bd21dc96552
- vendored proposal: e025161ce87930d6df6adc0c3dd2cae2efdf65c96be356ef316fc8a4982de76d (matches pin)
- worktree HEAD: 591f188f394ab17d8c34a800fd55f87c752d4005 (unchanged; zero product-path mutation — fence held)

## gates

- Plan gates G1–G7: 4 PASS / 3 N/A / 0 FAIL → READY
- Cold validation (Opus subagent, zero prior context): round 1 NEEDS ATTENTION (3 medium) → fixes → re-check VALIDATED, 0 open
- Backpressure: Partial (0 RUN / 10 EXTEND / 1 BUILD / 2 honest ABSENT — no arch/perf sensor exists repo-wide)
- **NOW HELD: WAITING_FOR_BUILD_CONFIG** — need Jordan's coder/reviewer profile before any fleet
- Daemon-restart baton: not needed this stream (all proofs temp-daemon isolated, plan task 3.1)

## observations

- Key design rulings encoded: blind-fire (no thaw detection, superseding the vendored proposal's banner parsing); capture = tail not diff (frozen panes diff empty), 40 lines ∧ 4 KiB, anomaly-only default, pointer-file transport; three pause tiers (self/compact/exempt); one shared stall latch across old + new detectors; paneless pi peers degrade to event-advance-only
- The dossier's sharpest trap (the watchdog can mask the freeze it probes) is a P1 TDD invariant (D4)
- s054 posture: additive-only now, converge at takin's P2-complete checkpoint (agreed re-sync)

## open

- Jordan's three plan defaults awaiting confirm (§ Open Questions): explicit pause verbs; --no-watchdog + non-expiring exempt; capture defaults
- BUILD CONFIG: coder/reviewer profile for the phase fleets (blocking implementation only)
- Optional workshops tabled, never gating: pause-tier state machine; s054 convergence
