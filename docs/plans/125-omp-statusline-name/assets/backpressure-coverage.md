# Backpressure Coverage — omp-statusline-name

**Plan**: [plan.dd.md](../plan.dd.md)
**Basis (plan SHA-256)**: `0ebf3f91cb656c8c1e21c3eeb802670ecf7caf67b78464fe165c58f052cfd5c4`
**Generated**: 2026-09-02
**Certainty**: Partial

> Advisory only. Selection, not enforcement: the proof lines below must still be run.

## Existing Sensors

| Sensor | Paved command | Dimension | Found in |
|---|---|---|---|
| Focused Vitest | `just test .pi/extensions/pij/core/session-name.test.ts` | behaviour | `justfile:84-86` |
| TypeScript compiler | `just typecheck` | maintainability | `justfile:74-75` |
| Full signal inventory | `harness checks` | behaviour + maintainability | `.harness/engineering-harness.md:28-40` |
| Tmux driver smoke | `just smoke` | integration | `justfile:95-97`, `harness/driver/` |

## Coverage Matrix

| Criterion / failure mode | Phase | Selected proof | Status | Tier | Probe trail |
|---|---|---|---|---|---|
| Retry stops after readback success; permanent failure notices once (AC3) | 1 | EXTEND→RUN: add fake-driven cases to the existing Vitest surface, then `just test .pi/extensions/pij/core/session-name.test.ts` | EXTEND | computational | — |
| Both daemon generations share the helper and OMP always gets fallback status (AC2/AC3) | 1 | EXTEND→RUN: cover the shared helper contract, then `just test .pi/extensions/pij/core/session-name.test.ts`; verify call-site wiring in cross-model review | EXTEND | computational + inferential | — |
| Type surface and full repository remain healthy (AC4) | 1 | RUN: `just typecheck`; RUN: `harness checks` | EXISTS | computational | — |
| Ten real OMP footers visibly show their pij ids (AC1) | 1 | Ten back-to-back hand-started OMP tmux captures in `assets/live-footers.md` | ABSENT | human-judgement | Searched `just smoke`, `harness/driver/`, Vitest config, and CI inventory; no existing statusline-name witness scenario |
| Forced native-name miss still shows status and one visible notice (AC2) | 1 | Helper fake proof plus one hand-started forced-miss OMP transcript in `assets/live-footers.md` | ABSENT | human-judgement | Searched `just smoke`, `harness/driver/`, Vitest config, and CI inventory; no existing runtime hook that forces OMP's native bridge to fail |

## Proof Plan (selected)

### Phase 1: Retry + fallback + live 10/10 proof

| Proves | Mode | Proof line |
|---|---|---|
| Retry/failure contract | EXTEND→RUN | Add the helper cases, then `just test .pi/extensions/pij/core/session-name.test.ts` |
| Static and repository integrity | RUN | `just typecheck` and `harness checks` |
| Actual OMP rendering | human witness | Capture the forced-miss transcript and 10/10 hand-started footer witnesses in `assets/live-footers.md`; close every window |

## Certainty: Partial

Counts (behaviour/architecture rows): 2 RUN · 2 EXTEND · 0 BUILD · 0 ABSENT. The visible-client rows remain explicit human judgement and are excluded from the machine-checkable count.

Recommended next move: extend the existing Vitest sensor first, then implement against the red cases; retain the already-planned live tmux witnesses for the real rendering surface.

## Recommended Phase 0: Establish Backpressure

| Sensor to extend | Proves | Suggested form | Paved command strengthened |
|---|---|---|---|
| Core Vitest suite | bounded retries, readback success, unconditional status, exactly-once notice | fake-driven unit cases in `session-name.test.ts` | `just test .pi/extensions/pij/core/session-name.test.ts` |

## Closing Verdict

One thing I already did automatically: selected the exact existing commands that will prove the helper and repository stay correct, so those claims rest on repeatable output rather than opinion. One thing already required by the plan still needs human eyes: the actual OMP footer and forced-failure notice must be seen in hand-started tmux clients because no current command observes that rendering surface. If a selected command passes but a reviewer finds the behaviour wrong, fix the checker first and then the code so the same miss cannot recur.

In summary: focused Vitest, typecheck, and `harness checks` will prove the machine-checkable retry and fallback contract; the 10/10 footers and forced-miss notice still require the ruled live-client captures. The approved next move is the existing task: add the red helper cases, then build and run both proof tiers.
