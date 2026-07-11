# s036 report — phase 1 checkpoint
**From**: pij-1khprxk · **To**: pij-3vetx8 · **Date**: 2026-07-11 (~10:23Z)

**claim**: Phase 1 (T001–T013) shipped and committed. `pij orchestration baton` is live on this machine: atomic single-holder leases, discretionary queue, pin re-verify, blocked-time, log-before-mutate machine log, pushed notices with honest receipts, alert-never-auto-reclaim sweep — proven by a 3-round mutation-gated cross-model review AND a live E2E under the daemon-restart baton (real dead-holder alert captured).

**artifacts[]**:
- code: `.pi/extensions/pij/core/orchestration/**`, `adapters/baton-store.*`, `core/daemon/baton-sweep.*`, additive `cli.ts`/`daemon.ts`/`fakes.ts`, `orchestration-notice.integration.test.ts`
- `reviews/review.phase-1.dlg-0001.md` — 3 rounds, Dim-0 mutation evidence each, unified-0 additive proof (E-16 artifact)
- `reports/live-verify-window.md` — daemon-restart return evidence
- `docs/domains/pij-orchestration/domain.md` + registry/map rows · `docs/how/pij-orchestration-baton.md` + pij.md row
- `execution.log.md`, `tasks/phase-1/tasks.md`, `canaries.md` (coder + reviewer, mechanical)
- flow-pair ledger: run 2026-07-11T09-19-34Z, dlg-0001, learn-0001 (prompt-lab candidate)

**shas[]**: `181380369cc0b815e5239deba7172ed1f71f51fb` (pathspec-limited, 33 files, index-clean probe green)

**gates[]**: fence vitest 67/67 · full-suite discriminator PASS (reds ⊆ ruled exclusions) · pij-skill-check green · harness checks --quick green except ruled s037 exclusions · Dim-0 mutations RED→restore→GREEN ×5 across rounds · live E2E all ACs touched in production

**observations[]** (buffer, will drain at retro): INS-001 third git-index incident (requirements evidence); DL-001 flow-pair --tasks-dir vs Simple plans; SUGG-001 roster verb missing; DL-002/003 watcher flake ×3; coordination: first measured cross-stream suite contention (R4.4 datum); NEW this phase: whole-phase packets hide defects in untested AC branches — negative-space-test rule now learn-0001.

**open[]**: T014 ritual update (ship-time, needs your look pre-commit) · full `harness checks` WITH smoke at ship · global-suite green returns as hard ship requirement (awaiting s037's window turn for cli.ts:1959 bridge) · v1 residue: no `undefine` verb (scratch baton lingers, deliberate).
