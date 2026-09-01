# Backpressure Coverage — tmux full-body delivery

**Plan**: [plan.dd.md](../plan.dd.md)
**Basis (plan SHA-256)**: `4c7bbd66b15f5e62af47310ff8f79876c2e5063d61aa7c933a6fec9e88ef43f3`
**Generated**: 2026-09-01
**Certainty**: Partial

> Advisory only. Selection, not enforcement: the commands and live witnesses below are the evidence required by the plan.

## Existing Sensors

| Sensor | Paved command | Dimension | Found in |
|---|---|---|---|
| Rust workspace gate | `CARGO_INCREMENTAL=0 cargo run --locked -p pij-testkit --bin pij-gate` | maintainability, architecture, behaviour | `crates/README.md`, `crates/testkit/src/bin/gate.rs` |
| Tmux adapter integration tests | Rust workspace gate above | behaviour | `crates/tmux/tests/adapter.rs` |
| Delivery policy and service tests | Rust workspace gate above | behaviour | `crates/core/src/delivery.rs`, `crates/daemon/src/delivery/mod.rs`, `crates/daemon/src/pointer/worker.rs` |
| Repository signal inventory | `harness checks` | maintainability, behaviour | `.harness/extensions/checks/` |
| Tmux-driven smoke | `just smoke` | behaviour | `harness/driver/`, `harness/scripts/smoke.ts` |

## Coverage Matrix

| Criterion / failure mode | Phase | Selected proof | Status | Tier | Probe trail |
|---|---|---|---|---|---|
| OMP and another socketless pane receive the full framed body without inbox pull | 1 | BUILD→RUN: exercise registered live OMP and copilot/codex panes with `pij send`; retain pane captures in plan assets | BUILDABLE | computational | — |
| A 3000+ byte body survives tmux submission intact | 1 | EXTEND→RUN: add a real-tmux adapter regression and run the Rust workspace gate; repeat with the live pane witness | EXTEND | computational | — |
| Composer content vetoes immediate and drain delivery | 1 | EXTEND→RUN: add first-attempt and drain regressions, then run the Rust workspace gate; retain a live composer-hold capture | EXTEND | computational | — |
| Shared framing supplies exactly one head and tail | 1 | EXTEND→RUN: assert the daemon submits `pij_core::framing::frame_message` output, then run the Rust workspace gate | EXTEND | computational | — |
| Socket-capable seats still prefer socket delivery | 1 | RUN: existing socket delivery tests through the Rust workspace gate | EXISTS | computational | — |
| Complete repository remains green | 1 | RUN: Rust workspace gate and `harness checks` | EXISTS | computational | — |

## Proof Plan (selected)

### Phase 1 — body rung + hazard proof + live witness

| Proves | Mode | Proof line |
|---|---|---|
| Full body reaches socketless panes | BUILD | Capture registered OMP plus copilot/codex pane delivery showing one complete framed turn and no pointer/inbox prompt. |
| Large body integrity | EXTEND | Add the real-tmux 3000+ byte submit regression; then `CARGO_INCREMENTAL=0 cargo run --locked -p pij-testkit --bin pij-gate`. |
| Typing veto | EXTEND | Add immediate and drain-path composer regressions; run the Rust gate and a live composer-hold witness. |
| One shared frame | EXTEND | Assert exact shared framing output at both daemon paths; then run the Rust gate. |
| Socket precedence | RUN | `CARGO_INCREMENTAL=0 cargo run --locked -p pij-testkit --bin pij-gate`. |
| Whole-repo health | RUN | `harness checks`. |

## Certainty: Partial

Counts (behaviour/architecture rows): 2 RUN · 3 EXTEND · 1 BUILD · 0 ABSENT.

Recommended next move: extend the existing Rust tests while implementing, then collect the live pane receipts before review.

## Recommended Phase 0: Establish Backpressure

| Sensor to build/extend | Proves | Suggested form | Paved command it strengthens/exposes |
|---|---|---|---|
| Real-tmux large-submit regression | Byte-intact 3000+ bodies | Extend `crates/tmux/tests/adapter.rs` | Rust workspace gate |
| Delivery path regressions | Immediate/drain framing, veto, socket precedence | Extend existing daemon/core test modules | Rust workspace gate |
| Live multi-harness witness | Actual OMP and copilot/codex pane behaviour | Repro commands plus captured pane output in plan assets | Manual live witness; candidate future `just smoke` scenario |

## Closing Verdict

One thing already selected automatically: the Rust workspace gate defends policy, framing, receipts, socket precedence, formatting, lint, architecture, and tests in one command. If it passes but a live pane still fails, the checker is incomplete; extend the checker before accepting the code.

One thing still requires live evidence: a registered OMP pane and a second socketless harness must receive a complete framed turn, a 3000+ byte body must remain intact, and a non-empty composer must prevent submission. Those observations cannot be replaced by a green fake.

In summary: the Rust gate proves the implementation contracts and repository health; live pane captures prove the actual tmux boundary. Extend the existing tests during implementation and retain the named live receipts before review.
