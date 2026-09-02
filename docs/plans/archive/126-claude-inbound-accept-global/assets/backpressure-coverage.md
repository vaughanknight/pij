# Backpressure Coverage — claude-inbound-accept-global

**Plan**: [plan.dd.md](../plan.dd.md)
**Basis (plan SHA-256)**: e111e558459e9b277ccd4801b6b1a76d3fd95409ed38737894ab50869ada5bcc
**Generated**: 2026-09-02
**Certainty**: Partial

> Advisory only. Selection, not enforcement.

## Existing Sensors

| Sensor | Paved command | Dimension | Found in |
|---|---|---|---|
| Rust workspace tests | `cargo test --workspace` | behaviour | `Cargo.toml` |
| Harness checks | `harness checks` | maintainability + existing behaviour | `.harness/extensions/checks/extension.ts` |
| Live tmux proof | plan AC3 procedure | end-to-end behaviour | `plan.dd.md` |

## Coverage Matrix

| Criterion / failure mode | Phase | Selected proof | Status | Tier | Probe trail |
|---|---|---|---|---|---|
| AC1 settings creation, preservation, backup, idempotency, malformed refusal | 1 | EXTEND→RUN: add focused `pij-harnesses` tests, then `cargo test -p pij-harnesses claude_settings` | EXTEND | computational | — |
| AC2 daemon boot change event and second-boot no-op | 1 | EXTEND→RUN: add daemon integration coverage, then `cargo test -p pij-daemon claude_inbound` | EXTEND | computational | — |
| AC3 hand-started Claude receives a real inbound turn without `--settings` | 1 | RUN: execute the isolated-daemon tmux procedure in AC3 and capture transcript + spine rows | EXISTS | human-judgement | — |
| AC4 doctor output and project gates | 1 | RUN: `cargo test --workspace`; RUN: `harness checks`; RUN: `target/debug/pij-rs doctor claude-inbound` | EXISTS | computational | — |
| Transport frame remains unchanged | 1 | RUN: review the scoped diff; RUN: `cargo test -p pij-transport` | EXISTS | computational | — |

## Proof Plan (selected)

### Phase 1: Ensure + hook + doctor + live proof

1. EXTEND→RUN: focused settings tests, then `cargo test -p pij-harnesses claude_settings`.
2. EXTEND→RUN: daemon boot integration, then `cargo test -p pij-daemon claude_inbound`.
3. RUN: isolated-daemon AC3 procedure with tmux transcript and spine evidence.
4. RUN: `cargo test --workspace` and `harness checks`.
5. RUN: `target/debug/pij-rs doctor claude-inbound` for both discovered homes.

## Certainty: Partial

Counts (behaviour/architecture rows): 3 RUN · 2 EXTEND · 0 BUILD · 0 ABSENT.
Recommended next move: add the two focused cases first, then implement against their red failures.

## Recommended Phase 0: Establish Backpressure

| Sensor to extend | Proves | Suggested form | Paved command |
|---|---|---|---|
| `pij-harnesses` unit suite | AC1 | five tempdir cases | `cargo test -p pij-harnesses claude_settings` |
| `pij-daemon` integration suite | AC2 | boot twice against temp HOME + FakeSpine | `cargo test -p pij-daemon claude_inbound` |

## Closing Verdict

One thing I already did: selected the exact commands and live procedure that will prove each promise, so acceptance rests on observed behaviour rather than confidence. One thing approved by prime: add the two focused tests before implementation; if those checks later pass while the real client fails, the checks are wrong and must be fixed first. In summary: targeted Rust tests prove settings and daemon idempotency, workspace and harness gates protect the composed branch, and the no-settings tmux run proves the user-visible path; the only remaining human judgement is confirming the captured Claude transcript is a genuine inbound user turn.
