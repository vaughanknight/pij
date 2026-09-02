# Backpressure Coverage — baseline-red-tests

**Plan**: [plan.dd.md](../plan.dd.md)
**Basis (plan SHA-256)**: c0ff2fd4bda28a2b7fad34ca4a7dbfba8cf305693be3d039572c1ac47051098d
**Generated**: 2026-09-02
**Certainty**: Strong

> Advisory only. Selection, not enforcement.

## Existing Sensors

| Sensor | Paved command | Dimension | Found in |
|---|---|---|---|
| npm resolution integration test | `just test harness/scripts/npm-resolution-policy.integration.test.ts` | behaviour | `harness/scripts/` |
| worktree unit test | `just test .pi/extensions/pij/core/worktree.test.ts` | behaviour | `.pi/extensions/pij/core/` |
| full Vitest suite | `just test` | behaviour | root `justfile` |
| full deterministic gate | `harness checks` | maintainability + behaviour | `.harness/` |

## Coverage Matrix

| Criterion / failure mode | Phase | Selected proof | Status | Tier | Probe trail |
|---|---|---|---|---|---|
| Fresh-worktree suite is green | 1 | RUN: fresh worktree with canonical `node_modules` symlink, then `just test` | EXISTS | computational | — |
| Any skip names a verified machine condition | 1 | RUN: targeted npm integration test output plus `just test` output | EXISTS | computational | — |
| ENOTEMPTY fix has a red-first witness | 1 | RUN: pre-fix `just test .pi/extensions/pij/core/worktree.test.ts`, then the same command post-fix | EXISTS | computational | — |
| Composed branch passes repository gates | 1 | RUN: `harness checks` | EXISTS | computational | — |

## Proof Plan (selected)

### Phase 1: Build + prove

| Proves | Mode | Proof line |
|---|---|---|
| npm replay behavior | RUN | `just test harness/scripts/npm-resolution-policy.integration.test.ts` |
| worktree teardown behavior | RUN | `just test .pi/extensions/pij/core/worktree.test.ts` |
| fresh-worktree baseline | RUN | `just test` in a tmux pane with transcript captured |
| repository-wide completion | RUN | `harness checks` |

## Certainty: Strong

Counts (behaviour/architecture rows): 4 RUN · 0 EXTEND · 0 BUILD · 0 ABSENT
Recommended next move: start building; the required proofs already exist.

## Closing Verdict

One thing I already did automatically: selected the exact repository commands that prove each promise, so completion is decided by repeatable output rather than confidence. One thing that needs no additional approval: every machine-checkable promise already has a paved proof, and no human-judgement row remains. If a check passes but the observed behavior disagrees, fix the check first and then the code so the mistake cannot recur.

In summary: the two targeted tests, a fresh-worktree `just test` transcript, and `harness checks` prove the plan. No human judgement remains; proceed with implementation and run those commands.
