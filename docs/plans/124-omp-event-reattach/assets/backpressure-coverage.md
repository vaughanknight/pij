# Backpressure Coverage — omp-event-reattach

**Plan**: [plan.dd.md](../plan.dd.md)
**Basis (plan SHA-256)**: fb3bd3e2a11ab32779c7924d6ae7119cb1473b90904b8ae5ddad6c5995dac97e
**Generated**: 2026-09-02
**Certainty**: Weak

> Advisory only. Selection, not enforcement.

## Existing Sensors

| Sensor | Paved command | Dimension | Found in |
|---|---|---|---|
| Extension vitest suite | `just test .pi/extensions/pij/adapters/daemon-http.test.ts .pi/extensions/pij/adapters/rust-runtime.test.ts` | behaviour | `justfile`, `vitest.config.ts` |
| TypeScript compiler | `just typecheck` | maintainability | `justfile` |
| Full signal inventory | `harness checks` | behaviour + maintainability | `.harness/extensions/checks/` |
| Tmux smoke | `just smoke` | behaviour | `justfile`, `harness/scripts/smoke.ts` |

## Coverage Matrix

| Criterion / failure mode | Phase | Selected proof | Status | Tier | Probe trail |
|---|---|---|---|---|---|
| Stream drop reconnects with the per-alias cursor; gap frames arrive once; refused cursor falls back live-only with notice (AC3) | 1 | EXTEND→RUN: add fake-daemon drop/replay/refusal cases, then `just test .pi/extensions/pij/adapters/daemon-http.test.ts` | EXTEND | computational | — |
| Rotated key is reread; one auth retry succeeds; repeated auth failure does not loop (AC4) | 1 | EXTEND→RUN: add fake-daemon key-rotation cases, then `just test .pi/extensions/pij/adapters/daemon-http.test.ts` | EXTEND | computational | — |
| Runtime preserves seat id/pane and reuses pushedChain/consumePushed for exactly-once inject→ack | 1 | EXTEND→RUN: add restart/seat/ack cases, then `just test .pi/extensions/pij/adapters/rust-runtime.test.ts` | EXTEND | computational | — |
| Hand-started omp survives a real rs daemon restart; body is inline; spine has pushed→inbox-ack and no pointer (AC1) | 1 | Required live tmux transcript plus spine rows | ABSENT | human-judgement | Inspected `just smoke`, `harness/scripts/smoke.ts`, and extension tests; no paved restart-under-open-omp scenario exists. |
| The same omp's pij_send tool succeeds after restart (AC2) | 1 | Required live tmux transcript | ABSENT | human-judgement | Inspected `just smoke`, `harness/scripts/smoke.ts`, and extension tests; no paved key-rotation client scenario exists. |
| RED-first witnesses, type safety, focused tests, and full repository signals are green (AC5) | 1 | RUN: `just typecheck`; RUN: focused `just test …`; RUN: `harness checks` | EXISTS | computational | — |

## Proof Plan (selected)

### Phase 1: Reconnect + key refresh + live proof

| Proves | Mode | Proof line |
|---|---|---|
| Reconnect, cursor replay, refusal fallback | EXTEND→RUN | Add fake-daemon cases; then `just test .pi/extensions/pij/adapters/daemon-http.test.ts` |
| Key refresh and bounded auth retry | EXTEND→RUN | Add fake-daemon cases; then `just test .pi/extensions/pij/adapters/daemon-http.test.ts` |
| Seat continuity and exactly-once inject→ack | EXTEND→RUN | Add runtime restart case; then `just test .pi/extensions/pij/adapters/rust-runtime.test.ts` |
| Type and repository integrity | RUN | `just typecheck`; `harness checks` |
| Real-client survival and post-restart send | HUMAN | Prime-granted restart window; hand-started tmux omp transcript plus spine rows |

## Certainty: Weak

Counts (behaviour/architecture rows): 1 RUN · 3 EXTEND · 0 BUILD · 2 ABSENT

Recommended next move: proceed with the approved test extensions, then collect the mandatory live-client evidence; the remaining gap is intentionally human-observed rather than represented as a fake command.

## Recommended Phase 0: Establish Backpressure

| Sensor to extend | Proves | Suggested form | Paved command it strengthens |
|---|---|---|---|
| Tmux smoke restart scenario | Future automated coverage of AC1–AC2 | Start omp, restart isolated daemon, send body, assert pane + spine | `just smoke` |

This is a future harness improvement, not added feature scope: prime approved the plan's real-client transcript as the present proof.

## Closing Verdict

One thing already done: the plan's machine-checkable reconnect, replay, key-refresh, seat-continuity, and exactly-once promises now have selected paved checks. If a check passes while the live client still fails, the check is wrong and should be strengthened before treating the code as correct.

One human proof remains: an actual hand-started omp must survive a granted daemon-restart window, show the body inline, show pushed→inbox-ack without a pointer, and successfully use pij_send afterward. Prime has already approved this proof path and requires the transcript.

In summary: focused extension tests, typecheck, and `harness checks` prove the deterministic contracts; the tmux transcript and spine rows prove the real-client contract. Proceed with RED-first test extensions, then request the restart window before the live proof.
