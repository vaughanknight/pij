# Backpressure Coverage — seat-session-identity

**Plan**: [plan.dd.md](../plan.dd.md)
**Basis (plan SHA-256)**: 9e058beb1ef9e9bb4abb757e43022738f2671eed8df78a83d75c5bbbd0763a8f
**Generated**: 2026-09-02
**Certainty**: Partial

> Advisory only. Selection, not enforcement.

## Existing Sensors

| Sensor | Paved command | Dimension | Found in |
|---|---|---|---|
| TypeScript typecheck | `just typecheck` | maintainability | `justfile` |
| TypeScript unit/integration suite | `just test` | behaviour | `justfile`, `vitest.config.ts` |
| Full TypeScript/tmux gate | `harness checks` | behaviour + maintainability | `.harness/extensions/checks/extension.ts` |
| Rust crate tests | not paved; targeted `cargo test -p …` only | behaviour | Cargo workspace |
| Live isolated identity proof | plan-specific | integration | plan AC1–AC4 |

## Coverage Matrix

| Criterion / failure mode | Phase | Selected proof | Status | Tier | Probe trail |
|---|---|---|---|---|---|
| Persist and expose harness session (AC1) | 1 | EXTEND→RUN: add store/daemon tests, run targeted Cargo tests, then isolated live omp+claude proof | EXTEND | computational | — |
| Legacy+rs union, rs-first null-fill, legacy field names, dedupe, and `--here` scope (AC2) | 1 | EXTEND→RUN: add Vitest cases for same-id null-fill and cross-repo rs exclusion under `--here`, then `just test` and isolated `pij sessions --json` | EXTEND | computational | — |
| rs and legacy whoami shapes (AC3) | 1 | EXTEND→RUN: add Vitest cases, then `just test` and isolated live commands | EXTEND | computational | — |
| flowspace3 resolves rs transcripts (AC4) | 1 | BUILD→RUN: compose isolated daemon/client fixture, then run `flowspace3 conversation ingest --pij <seat>` for omp and claude | BUILDABLE | computational | — |
| Every behavior has a pre-fix witness (AC5) | 1 | RUN: retained RED outputs plus targeted Cargo/Vitest green outputs | EXISTS | computational | — |
| Migration 0011 / schema 10→11 lands before s122 | 1 | EXTEND→RUN: migration up/down test plus composed Cargo workspace tests; s122 owns any later renumber | EXTEND | computational | — |
| Full repo regression | 1 | RUN: `harness checks` | EXISTS | computational | — |

## Proof Plan (selected)

### Phase 1: Persist + expose + union + consumer proof

| Proves | Mode | Proof line |
|---|---|---|
| Rust persistence, migration, projections, rs session rows | EXTEND→RUN | Add RED-first store/daemon cases; run `cargo test -p pij-store` and `cargo test -p pij-daemon`. |
| TS routing, rs-first null-fill union/dedupe, `--here` scope, whoami, registration payload | EXTEND→RUN | Add RED-first Vitest cases including same-id null-fill and other-repo exclusion under `--here`; run `just test <target files>`, then `just test`. |
| Live identity and consumer integration | BUILD→RUN | Start only an isolated rs daemon; hand-start omp+claude in tmux; capture `pij-rs list`, `pij sessions --json`, both `whoami --json` generations, and two flowspace3 ingests. |
| Whole-tree regression | RUN | `harness checks`. |

## Certainty: Partial

Counts: 2 RUN · 4 EXTEND · 1 BUILD · 0 ABSENT.

Recommended next move: implement the named test extensions and isolated live proof with the feature; do not restart the production daemon.

## Recommended Phase 0: Establish Backpressure

| Sensor to build/extend | Proves | Suggested form | Paved command it strengthens/exposes |
|---|---|---|---|
| Rust workspace gate | Cargo coverage cannot be omitted from completion | add a `just` recipe and checks sensor in a follow-up if prime approves | proposed `just test-rs` |
| Isolated identity scenario | AC1–AC4 without touching production | reusable isolated daemon/client driver | proposed plan-specific smoke command |

## Closing Verdict

One thing already done: the plan now names the exact tests, full gate, and isolated live commands that must agree before this change is accepted. One thing needing owner judgment later: whether the Rust and isolated identity proofs should become permanent paved harness commands; this delivery will run them directly without expanding scope. If a deterministic check passes but the live proof disagrees, fix the check first, then the code.

In summary: targeted Cargo and Vitest tests prove persistence and row-shape behavior, `harness checks` proves the existing whole-tree surface, and isolated omp+claude plus flowspace3 runs prove the consumer seam. No production-daemon restart is permitted; permanent paving is a follow-up decision for prime.