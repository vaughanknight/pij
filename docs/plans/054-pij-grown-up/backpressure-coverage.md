# Backpressure Coverage — pij grows up

**Plan**: [pij-grown-up-plan.md](./pij-grown-up-plan.md)
**Basis (plan SHA-256)**: 7a46a9a0bef2b940dd3f98e13f4feee5da8408c14a420395665a170db279c09c
**Generated**: 2026-07-16
**Certainty**: Partial

> Advisory only. Never blocks, never gates, no scores. (Advisory backpressure survey.)
> Selection, not enforcement: the proof lines below are what the plan's owner folds into each criterion's "done when".

## Existing Sensors (inventory)

| Sensor | Paved command | Dimension | Found in |
|--------|---------------|-----------|----------|
| typecheck | `just typecheck` | maintainability | root justfile |
| unit/integration suite (vitest, incl. two-peer smoke) | `just test` (targeted: `npx vitest run <path>`) | behaviour | root vitest.config.ts + `.pi/extensions/pij/**/*.test.ts` |
| lint/format | `just lint` | maintainability | root |
| boot composite (typecheck→test) | `harness boot` | behaviour | `.harness/extensions/boot/` |
| full pre-ship gate | `harness checks` / `just self-check` | behaviour+maintainability | root + CI (`.github/workflows/ci.yml`) |
| skill surface gate (mutation-proven) | `just pij-skill-check` | behaviour (skill) | root |
| import-boundary sensor (agents precedent) | `just test` via `core/agents/boundary.test.ts` | architecture-fitness | `.pi/extensions/pij/core/agents/` |

## Coverage Matrix

| Criterion / failure mode | Phase | Selected proof | Status | Tier | Probe trail |
|--------------------------|-------|----------------|--------|------|-------------|
| AC-01 project CRUD/link | 1 | EXTEND→RUN: add platform spec files (tasks 1.1/1.3/1.5); then `just test` | EXTEND | computational | — |
| AC-02 spine append + exact filters | 1 | EXTEND→RUN: spec cases in 1.3/1.5; then `just test` | EXTEND | computational | — |
| AC-03 append-only attributed events + replay idempotence | 1–2 | EXTEND→RUN: crash/replay/dup cases in 1.3; then `just test` | EXTEND | computational | — |
| Phantom-peer regression (new top-level `~/.pij` file) | 1 | EXTEND→RUN: explicit regression case in 1.3; then `just test` | EXTEND | computational | — |
| core/platform purity (no pi/daemon imports) — architecture drift | 1 | EXTEND→RUN: clone `core/agents/boundary.test.ts` pattern for `core/platform/`; then `just test` | EXTEND | computational | — |
| AC-04 runtime-axis vocabulary incl. `starting`/`stopped`/`unknown` | 2 | EXTEND→RUN: daemon `tick()` single-step cases (2.6); then `just test` | EXTEND | computational | — |
| AC-05 per-assignment states + worst-first badge | 2 | EXTEND→RUN: 2.3 cases; then `just test` | EXTEND | computational | — |
| AC-06 unverified-done flip | 2 | EXTEND→RUN: 2.3/2.8 cases; then `just test` | EXTEND | computational | — |
| AC-07 anomaly queries + parent alert (logic) | 2 | EXTEND→RUN: 2.8 tick/latch cases; then `just test` | EXTEND | computational | — |
| AC-07 live daemon push (deployed) | ship | BUILD→RUN: ship-checklist live demo after daemon-restart baton (task 4.6); paved as a scripted two-peer probe | BUILDABLE | computational (deferred to ship by R3 fence) | — |
| AC-08 tree enforcement/caller-parent/cycles | 3 | EXTEND→RUN: 3.1–3.3 cases (double as issue-#20 regression); then `just test` | EXTEND | computational | — |
| AC-09 node card fields + contextMax join + `unknown` | 2 | EXTEND→RUN: 2.5/2.7 cases; then `just test` | EXTEND | computational | — |
| AC-09 real terminal-open (`tmux select-window`) | ship | BUILD→RUN: live tmux probe in the 4.6 checklist (scripted) | BUILDABLE | computational (deferred to ship) | — |
| AC-10 byte-stable spine render | 4 | EXTEND→RUN: 4.1 pure-render cases; then `just test` | EXTEND | computational | — |
| AC-11 legacy descriptor load + suite green | 2 | RUN: `just test` (existing suite IS the sensor, today) | EXISTS | computational | — |
| AC-12 skill route intact | 4 | RUN: `just pij-skill-check` | EXISTS | computational | — |
| AC-12 docs actually sufficient for a UI author | 4 | — (review judgement) | ABSENT | human-judgement | prose quality has no sensor by nature; reviewed at phase review R4 — globbed `**/*.schema.json`, doc linters: none |

## Proof Plan (selected)

### Phase 1: Platform store
| Proves | Mode | Proof line |
|--------|------|------------|
| AC-01/02/03 + phantom-peer + purity | EXTEND→RUN | specs land via TDD tasks 1.1/1.3/1.5 (+ boundary-test clone); then `just test` |

### Phase 2: Node truth
| Proves | Mode | Proof line |
|--------|------|------------|
| AC-04/05/06/07(logic)/09(fields)/11 | EXTEND→RUN (AC-11: RUN today) | specs via 2.1–2.8; then `just test` |

### Phase 3: Enforced tree
| Proves | Mode | Proof line |
|--------|------|------------|
| AC-08 | EXTEND→RUN | specs via 3.1–3.3; then `just test` |

### Phase 4: Governance contract
| Proves | Mode | Proof line |
|--------|------|------------|
| AC-10/12 | EXTEND→RUN + RUN | 4.1 render specs → `just test`; `just pij-skill-check` |
| AC-07/09 live pieces | BUILD→RUN | 4.6 ship checklist: post-baton scripted two-peer + tmux probes |

## Certainty: Partial

Counts (behaviour/architecture rows): 2 RUN · 12 EXTEND · 2 BUILD · 1 ABSENT
Recommended next move (per-task lookup, advisory): the EXTEND gaps are already embedded as this plan's TDD test-first tasks — start building Phase 1; the 2 BUILD rows are correctly parked in the 4.6 ship checklist.

Rationale: nearly every behaviour criterion rides the existing vitest suite via spec cases the plan's own TDD tasks create; only the two live-deployment proofs wait for the ship baton, and one docs-quality row is legitimately human.

## Recommended Phase 0: Establish Backpressure (build or extend)

No separate Phase 0 needed — every EXTEND row is already a first-class test task inside its phase (the plan is TDD-ordered by ruling). The two BUILD rows live in task 4.6 (ship checklist) by design, fenced by R3.

| Sensor to build/extend | Proves | Suggested form | Paved command it strengthens/exposes |
|------------------------|--------|----------------|--------------------------------------|
| extend import-boundary pattern to `core/platform/` | architecture purity of the new store core | clone `core/agents/boundary.test.ts` | `just test` (same command, stronger) |
| scripted live two-peer + tmux probe | AC-07 push, AC-09 terminal-open, post-deploy | small script in 4.6 checklist, run post-baton | paved at ship |

## Closing Verdict

How will we know this work is actually done? Almost everything this plan promises can be proven by commands we already run. One thing I already did, automatically: I wrote the how-to-prove-it lines above so every promise names the command whose green output proves it — commands, not opinions, and written where the work lives so anyone picking this up later sees it. The plan is test-first by Jordan's own ruling, so the "extensions" these proofs need are simply the test tasks already in each phase — when `just test` and `just pij-skill-check` pass at the end of Phase 4, every machine-checkable promise is kept. Two things genuinely can't be proven until ship: that the *deployed* daemon really pushes an anomaly alert to a parent, and that a node's stored tmux address really opens its window — both live behind the machine-wide restart baton, so they sit in the ship checklist as scripted probes, deliberately. And one thing no command can judge: whether the platform documentation is actually good enough for a UI author — that stays with human review at the last phase. If any check goes green while a human says "not done," we fix the check first, then the code.

In summary: `just test` + `just pij-skill-check` will prove all twelve acceptance criteria's logic as the TDD tasks land; the two live-deployment proofs and one docs-quality judgement remain, parked respectively in the ship checklist and the Phase-4 review. Recommended next move: start building Phase 1 — no separate Phase 0, and no plan edit is needed since the proofs are already the plan's own test tasks. No approval is being requested beyond proceeding.
