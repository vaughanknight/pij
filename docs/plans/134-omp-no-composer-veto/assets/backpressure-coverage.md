# Backpressure Coverage — omp/pi no composer veto

**Plan**: [plan.dd.json](../plan.dd.json)
**Basis (plan SHA-256)**: da5ad9f360c738394722d626c46210b46c598edcd201145cd177bdfa0d496a9e
**Generated**: 2026-09-02
**Certainty**: Partial

> Advisory only. Selection, not enforcement: the commands below are the chosen proof; live-client observations remain required where no automated sensor can model the real composer/event stream.

## Existing Sensors

| Sensor | Paved command | Dimension | Found in |
|---|---|---|---|
| daemon Rust tests | `~/.cargo/bin/cargo test -p pij-daemon delivery::tests` | behaviour | `crates/daemon/src/delivery/mod.rs` |
| Rust workspace tests | `~/.cargo/bin/cargo test --workspace` | behaviour | `Cargo.toml` |
| Rust lint | `~/.cargo/bin/cargo clippy --workspace -- -D warnings` | maintainability | plan AC5 |
| Rust format | `~/.cargo/bin/cargo fmt --check` | maintainability | plan AC5 |
| full repository checks | `harness checks` | behaviour + maintainability | `.harness/extensions/checks/extension.ts` |
| tmux smoke | `just smoke` | behaviour | `justfile` |

## Coverage Matrix

| Criterion / failure mode | Phase | Selected proof | Status | Tier | Probe trail |
|---|---|---|---|---|---|
| Working omp receives without a composer veto (AC1) | 1 | Live dev-daemon OMP transcript + timestamps; `pij-rs send` must not return `human-typing` | ABSENT | human-judgement | inspected Rust workspace tests, `just smoke`, and delivery tests; no existing real-OMP mid-turn scenario exercises a dev daemon |
| Omp/Pi never calls the interaction gate (AC2) | 1 | EXTEND→RUN: add a counting-gate regression to delivery tests; then `~/.cargo/bin/cargo test -p pij-daemon delivery::tests` | EXTEND | computational | — |
| Claude/Copilot/Codex retain the human composer veto (AC3) | 1 | RUN: existing socket politeness regression plus live Claude draft proof; `~/.cargo/bin/cargo test -p pij-daemon first_attempt_socket_delivery_obeys_the_same_politeness_gate_as_retries` | EXISTS | computational + human-judgement | — |
| Sender gets still-queued and delivered-late notices (AC4) | 1 | EXTEND→RUN: add scheduler and CLI notice tests; then `~/.cargo/bin/cargo test --workspace`; live Claude/sender transcript remains required | EXTEND | computational + human-judgement | — |
| No regressions or static defects (AC5) | 1 | RUN: `harness checks`; `~/.cargo/bin/cargo test --workspace`; `~/.cargo/bin/cargo clippy --workspace -- -D warnings`; `~/.cargo/bin/cargo fmt --check` | EXISTS | computational | — |

## Proof Plan (selected)

### Phase 1: u1 then u2

| Proves | Mode | Proof line |
|---|---|---|
| AC1 | LIVE | Hand-started OMP against the dev daemon receives the mid-turn ruling with no `human-typing` outcome; preserve transcript and timestamps. |
| AC2 | EXTEND→RUN | Add an Omp/Pi zero-interaction-call regression; then `~/.cargo/bin/cargo test -p pij-daemon delivery::tests`. |
| AC3 | RUN + LIVE | `~/.cargo/bin/cargo test -p pij-daemon first_attempt_socket_delivery_obeys_the_same_politeness_gate_as_retries`; then preserve a live Claude draft-veto transcript. |
| AC4 | EXTEND→RUN + LIVE | Add scheduler/CLI tests; run `~/.cargo/bin/cargo test --workspace`; preserve sender notice and late-delivery transcript. |
| AC5 | RUN | `harness checks`; `~/.cargo/bin/cargo test --workspace`; `~/.cargo/bin/cargo clippy --workspace -- -D warnings`; `~/.cargo/bin/cargo fmt --check`. |

## Certainty: Partial

Counts (behaviour/architecture rows): 2 RUN · 2 EXTEND · 0 BUILD · 1 ABSENT

Recommended next move: extend the existing Rust delivery and CLI test sensors while implementing; retain the required real-client transcripts for the event-stream and composer behaviours those tests cannot faithfully replace.

## Recommended Phase 0: Establish Backpressure

| Sensor to extend | Proves | Suggested form | Paved command it strengthens |
|---|---|---|---|
| daemon delivery tests | AC2 | fake interaction gate/capture counter for Omp and Pi | `~/.cargo/bin/cargo test -p pij-daemon delivery::tests` |
| workspace Rust tests | AC4 | deterministic queued/late notice scheduler and CLI rendering cases | `~/.cargo/bin/cargo test --workspace` |

## Closing Verdict

One thing I already did automatically: selected the exact Rust and harness commands that will prove the machine-checkable promises, so completion is based on repeatable results rather than confidence. The implementation must teach the existing delivery tests that Omp/Pi cannot touch the composer gate and teach the workspace tests the sender-notice lifecycle; no new test runner is needed. Real OMP and Claude sessions still need human-visible transcripts because no current automated sensor reproduces both extension-stream buffering and a live composer draft. If a check passes but the live proof contradicts it, fix the check first, then the code.

In summary: focused delivery tests prove the u1 branch, workspace tests prove the notice lifecycle, and the full cargo plus harness gates defend regressions. Human judgement remains for the live OMP/Claude transcripts. The approved next move is to extend those existing tests in the feature work, then run the selected commands and capture the live evidence.