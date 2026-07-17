# Backpressure Coverage — first-class daemon-owned watchdogs

**Plan**: [pij-watchdog-plan.md](./pij-watchdog-plan.md)
**Basis (plan SHA-256)**: 14b03626cf3c9ddb942350d40ebb60c1b59a05dcd0c65f206142f3a1a6618345
**Generated**: 2026-07-17
**Certainty**: Partial

> Advisory only. Never blocks, never gates, no scores. (Advisory backpressure survey.)
> Selection, not enforcement: nothing here executes at phase end — the proof lines
> below are what the plan's owner folds into each criterion's "done when".

## Existing Sensors (inventory)

| Sensor | Paved command | Dimension | Found in |
|--------|---------------|-----------|----------|
| typecheck | `just typecheck` | maintainability | root justfile |
| unit/integration suite (vitest) | `just test` | behaviour | root justfile + `vitest.config.ts` |
| lint (biome) | `just lint` | maintainability | root justfile |
| tmux e2e driver | `just smoke` | behaviour | root justfile + `harness/scripts/smoke.ts` |
| local-path portability | `just local-path-check` | maintainability | root justfile |
| composite merge gate | `just self-check` | behaviour+maintainability | root justfile |
| runnable signal inventory | `harness checks` (`--quick` skips smoke) | all | `.harness/extensions/checks/` |
| boot readiness | `harness boot` | behaviour | `.harness/extensions/boot/` |

No architecture-fitness sensor exists anywhere in the repo (no dependency-cruiser/ArchUnit/CodeQL — probe: globbed `.dependency-cruiser.*`, `codeql/`, `*.ruleset` at root + `.pi/` + `harness/`; no match).

## Coverage Matrix

| Criterion / failure mode | Phase | Selected proof | Status | Tier | Probe trail |
|--------------------------|-------|----------------|--------|------|-------------|
| AC-01 universal default fire | 1→2 | EXTEND→RUN: add scheduler + manager cases (tasks 1.1/1.3, 2.1) then `just test` | EXTEND | computational | — |
| AC-02 self-teaching body | 1 | EXTEND→RUN: snapshot case (task 1.5) then `just test` | EXTEND | computational | — |
| AC-03 pause/resume verbs | 2 | EXTEND→RUN: CLI cases (task 2.7) then `just test` | EXTEND | computational | — |
| AC-04 compact auto-pause both seams | 1→2 | EXTEND→RUN: both-path cases (tasks 1.7, 2.5) then `just test` | EXTEND | computational | — |
| AC-05 blind fire through freezes | 1→2 | EXTEND→RUN: frozen-peer fake scenario (tasks 1.3, 2.4) then `just test` | EXTEND | computational | — |
| AC-06 deterministic unresponsive + shared latch | 1→2 | EXTEND→RUN: derivation + latch cases incl. paneless fixture (tasks 1.4, 2.4) then `just test` | EXTEND | computational | — |
| AC-07 cost-bounded capture | 1→2 | EXTEND→RUN: cap boundary cases (tasks 1.6, 2.6) then `just test` | EXTEND | computational | — |
| AC-08 first-class exemption | 1→2 | EXTEND→RUN: tier cases (tasks 1.1, 2.7) then `just test` | EXTEND | computational | — |
| AC-09 isolated temp-daemon proof | 3 | BUILD→RUN: task 3.1 builds the proof harness, paving `just watchdog-proof` (proposed name) | BUILDABLE | computational | — |
| AC-10 delivery-split parity | 2 | EXTEND→RUN: fake-port split cases (task 2.1) then `just test` | EXTEND | computational | — |
| End-to-end etiquette loop in real tmux | 3 | EXTEND→RUN: add watchdog scenario to `harness/scripts/smoke.ts` (task 3.2) then `just smoke` | EXTEND | computational | — |
| Ports/pure-core boundary discipline (new watchdog code stays adapter-free) | 1–2 | — (code review; no arch sensor exists repo-wide) | ABSENT | inferential | globbed `.dependency-cruiser.*`, `codeql/`, `*.ruleset`, archunit across root + `.pi/` + `harness/` — no match |
| Tick-cost regression on large fleets (plan Risk) | 2 | — (no perf sensor; observed at review + proof log) | ABSENT | inferential | no bench/perf harness signature at any root (`**/bench*`, `*.bench.*` — no match) |

## Proof Plan (selected)

### Phase 1: Pure watchdog core
| Proves | Mode | Proof line |
|--------|------|------------|
| AC-01/02/04/05/06/07/08 core semantics | EXTEND→RUN | add tasks 1.1–1.7 cases; then `just test` |
| type surface | RUN | `just typecheck` |

### Phase 2: Daemon manager + CLI surface
| Proves | Mode | Proof line |
|--------|------|------------|
| AC-01/03/04/05/06/07/08/10 wired | EXTEND→RUN | add tasks 2.1–2.7 cases; then `just test` |
| no daemon-test regressions | RUN | `just test` (existing daemon suites) |

### Phase 3: Isolated proof, parity & docs
| Proves | Mode | Proof line |
|--------|------|------------|
| AC-09 (and AC-01..08 live) | BUILD→RUN | task 3.1 builds the temp-daemon proof harness; then `just watchdog-proof` (proposed) |
| end-to-end etiquette | EXTEND→RUN | task 3.2 adds the smoke scenario; then `just smoke` |
| merge gate | RUN | `just self-check` · `harness checks` |

## Certainty: Partial

Counts (behaviour/architecture rows): 0 RUN · 10 EXTEND · 1 BUILD · 2 ABSENT
Recommended next move (per-task lookup, advisory): extensions first — which this plan already encodes structurally (TDD-first task ordering puts every EXTEND case before its implementation; the one BUILD is task 3.1).

All ten acceptance criteria carry EXTEND or BUILD proofs onto already-paved commands (`just test`, `just smoke`) — nothing is unprovable, but none of the new cases exist yet, so certainty is Partial until Phase 1/2 tests land. The two ABSENT rows are review-tier by honest necessity (no arch/perf sensor exists repo-wide — a repo gap, not a plan gap).

## Recommended Phase 0: Establish Backpressure (build or extend)

No separate Phase 0 is recommended: every extension is already a first-class, tests-first task inside the plan's phases (1.1–1.7, 2.1, 3.2), and the one genuine build (the temp-daemon proof harness) is already task 3.1 — mandated by the stream's baton constraint, not optional. Standing repo-level candidates (out of this plan's scope, noted for the harness loop): an architecture-fitness sensor for the ports/pure-core split; a perf/bench probe for daemon tick cost.

## Closing Verdict

How will we know this work is actually done? Every promise in this plan — the twenty-minute default, the self-teaching turns, compact auto-pause, blind fire through freezes, the deterministic stalled verdict, the capped pane captures, the exemptions — gets proven by commands, not opinions: new test cases folded into the suite everyone already runs (`just test`), a watchdog scenario in the existing tmux smoke, and one new thing we have to build — an isolated temp-daemon proof harness, because the live daemon is restart-gated and we deliberately never touch it to prove this.

One thing I already did, automatically: wrote the how-to-prove-it lines above into this coverage artifact, pinned to the exact plan version they were selected against — whoever picks this up later sees exactly which green output vouches for which promise, even after this conversation is gone.

One thing worth saying plainly rather than asking: the plan already carries every extension as a tests-first task, so no re-plan is needed to fold these in — the proofs and the plan are already the same document. Two things no command will judge: whether the new code keeps the repo's clean ports/pure-core split (there is no architecture checker in this repo — a reviewer's eyes carry that), and whether the daemon tick stays cheap on big fleets (no perf probe exists; the proof log observes it once). If the checks pass but a human still says it's not done, the checks are wrong — we fix them first, then the code.

In summary: when `just test`, `just smoke`, and the new temp-daemon proof run green, every machine-checkable promise in this plan is kept; the ports-discipline and tick-cost questions remain human review calls, named above; the recommended next move is simply to build Phase 1 tests-first as the plan already orders — no approval needed beyond the build-config gate the stream is already holding at.
