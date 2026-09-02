# Backpressure Coverage — claude-session-start-adopt

**Plan**: [plan.dd.md](../plan.dd.md)
**Basis (plan SHA-256)**: `151200a981b25780824581308f25160f7517ba3ae828cff238cf11003afc57b1`
**Generated**: 2026-09-02
**Certainty**: Partial

> Advisory only. Selection, not enforcement.

## Existing Sensors

| Sensor | Paved command | Dimension | Found in |
|---|---|---|---|
| Rust harness tests | `cargo test -p pij-harnesses` | behaviour | `crates/harnesses/` |
| TypeScript gate | `just typecheck` | maintainability | `justfile` |
| Unit suite | `just test` | behaviour | `justfile` |
| Tmux driver smoke | `just smoke` | behaviour | `harness/driver/`, `harness/scripts/smoke.ts` |
| Full signal inventory | `harness checks` | behaviour / maintainability | `.harness/extensions/checks/` |

## Coverage Matrix

| Criterion / failure mode | Phase | Selected proof | Status | Tier | Probe trail |
|---|---|---|---|---|---|
| AC1 auto-adopt, consent, and first inbound turn in a real Claude client | 1 | Capture `assets/live-auto-seat.md` from an isolated daemon and hand-started Claude; then `harness checks` | ABSENT | human-judgement | Searched root, `crates/*`, and `harness/` for Claude/tmux smoke coverage; existing smoke has no hand-started Claude SessionStart scenario. |
| AC2 repeat hook execution does not mint two pane owners | 1 | Extend Rust installer/idempotence tests; then `cargo test -p pij-harnesses`, plus isolated live transcript | EXTEND | computational | — |
| AC3 non-tmux Claude starts silently and logs the skip | 1 | Add the script no-tmux case; then its shell test and isolated live transcript | EXTEND | computational | — |
| AC4 additive settings mutation, backup, no-op, malformed refusal | 1 | Add installer cases; then `cargo test -p pij-harnesses` | EXTEND | computational | — |
| AC5 `/pij ready` remains a no-op after auto-adopt; repository gates stay green | 1 | Isolated live transcript; then `harness checks` | EXTEND | computational | — |
| Hook stdout leaks into Claude session start | 1 | Script tests assert empty stdout; isolated live transcript confirms no visible error | EXTEND | computational | — |

## Proof Plan (selected)

### Phase 1: Hook + installer + live proof

| Proves | Mode | Proof line |
|---|---|---|
| AC2, AC4 | EXTEND→RUN | Add the installer/idempotence cases; then `cargo test -p pij-harnesses`. |
| AC3, stdout silence | EXTEND→RUN | Add script checks for missing `TMUX_PANE`, unavailable daemon, and empty stdout; run the script test. |
| AC1, AC2, AC3, AC5 | HUMAN | Capture the required hand-started Claude transcript and spine rows against an isolated daemon in `assets/live-auto-seat.md`. |
| Repository regression surface | RUN | `harness checks`. |

## Certainty: Partial

Counts (behaviour/architecture rows): 1 RUN · 5 EXTEND · 0 BUILD · 1 ABSENT

Recommended next move: extend the existing Rust/script tests first, then run the required isolated live proof and full signal inventory.

## Recommended Phase 0: Establish Backpressure

| Sensor to extend | Proves | Suggested form | Paved command it strengthens |
|---|---|---|---|
| `pij-harnesses` tests | AC2 and AC4 | Add additive JSON, preservation, backup, malformed, and repeat cases | `cargo test -p pij-harnesses` |
| Hook script checks | AC3 and stdout silence | Exercise no-tmux and unavailable-daemon exits with isolated environment | phase-local script test |

## Closing Verdict

One thing I already did automatically: selected the commands and live evidence that will prove each promise, so completion is based on receipts rather than confidence. One thing already requires no new surface: extend the existing Rust and script tests, run `cargo test -p pij-harnesses`, then run `harness checks`. The real-client promise still needs the exact human-visible proof the plan demands: a hand-started Claude in tmux with nothing typed, backed by isolated-daemon transcript and spine rows; no current command can substitute for that observation. If a check passes but the live client contradicts it, fix the check first, then the code.

In summary: automated tests can prove settings preservation, idempotence, silent failure, and regressions; the hand-started Claude behavior remains a required live judgement. Approval to proceed with that split was received in the prime's ruling.
