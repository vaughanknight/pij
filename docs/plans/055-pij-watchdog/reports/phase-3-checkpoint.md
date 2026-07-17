# s055-pij-watchdog — Phase 3 checkpoint (ALL PHASES COMPLETE — at ship gate)

**From**: pij-intimate-mandrill · **To**: pij-reasonable-dove (o-prime)
**Date**: 2026-07-17 · **Stage**: P1+P2+P3 done + reviewed + committed; nav at SHIP (push/PR await Jordan's confirms)

## claim

The stream's build is complete. Phase 3 proved all ten acceptance criteria
against a temp daemon (disposable PIJ_HOME, live daemon untouched — baton rule
held absolutely) with ZERO skips, and shipped discoverability. Two things of
note happened on the way:

1. **The proof harness caught a real P2 defect** two cross-model review rounds
   and 27 unit tests had missed: watcher stalled-notices bypassed the shared
   episode latch (one per due fire instead of one per episode). Fixed as
   fix-0003 (episode guard in manager RuntimeState; mode:always untouched),
   reviewed APPROVE with exact-guard mutation evidence, committed 27dceeb.
2. **Review round 1 on the proofs themselves came back FIX_REQUIRED (0C/3H/1M,
   all proof-strength)** — takin sabotaged the runner adversarially and found
   assertions that passed vacuously (zero-byte captures; missing negatives on
   the attributed-transition edges; pij watchdog list never invoked; pi
   compact order unasserted). fix-0004 made all four load-bearing; round 2
   APPROVE with both sabotages RED and byte-identical restoration.

## artifacts

- proofs/run-proofs.ts (sha fc10a1a1…c8d) + reports/proof-log.md — AC-01..10 PASS, 0 skips (AC-09)
- harness/scripts/smoke.ts watchdog scenario — deterministic, tmux-gated; just smoke 10/10
- docs/how/pij-watchdog.md + skills/pij/SKILL.md row + docs/domains contracts — reviewer-verified exact vs shipped behavior; Jordan's three ruled defaults explicit
- reports/s054-convergence-note.md — pinned 647076a / Seq 442+447
- Commits since P2 checkpoint: 27dceeb (fix-0003) · 82ea289 (records) · 50a657a (P3 feature) · ff53f75 (P3 drain + recovery). HEAD ff53f75, tree clean.

## gates

- just self-check PASS (typecheck, lint, full suite 2073/11 skipped, Windows stages, smoke, report-only pkg audit, snapshots) · harness checks 8/8 · local-path-check PASS
- Reviews: dlg-0003 two rounds → APPROVE; proof-integrity gate = adversarial sabotage evidence, runner restored byte-identical each time
- Fences held stream-wide: core/daemon/loop.ts zero-diff (SW-6), .pi/packages.yaml byte-identical, no events.ndjson activity evidence, real ~/.pij never touched

## needs-jordan (surfaced, non-blocking for ship)

- **flow-pair learn verb defect (blocking-severity tooling, outside my fence)**:
  it numbers candidates per-delegation with NO existing-file check and
  clobbered tracked prompt-lab candidates TWICE this stream (learn-0001 in
  bf056a7 — found by audit; learn-0003 today — caught by coder fence). Both
  originals recovered (learn-0003 restored, learn-0006 re-homed) + my
  candidate re-homed (learn-0005). Fix descriptor in retro 003: next-free-
  ordinal scan + refuse-to-overwrite in skills/flow-pair/lib. Wants a ruling:
  fix in this stream's PR, a follow-up task, or hand to another stream.

## next

- /builder 8 ship: push + PR each behind Jordan's explicit confirm (worktree
  branch s055/pij-watchdog vs main; squash per worktree doctrine)
- Post-flight harvest chore fires at ship
- Convergence: rebase target s054/pij-grown-up @ 647076a at the agreed
  re-sync through you; drift → through you
- Teardown at stream end: reviewer pij-tame-takin (spawnedByUs) only; coder is
  Jordan's peer
