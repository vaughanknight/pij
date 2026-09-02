# Backpressure Coverage — rs tap supersedes legacy

**Plan**: [plan.dd.md](../plan.dd.md)
**Basis (plan SHA-256)**: 9b4ccecbf3acb5c055438208540b21cf85ddd8deae8434a3dc58f057425b5dfa
**Generated**: 2026-09-02
**Certainty**: Weak

> Advisory only. Never blocks, never gates, no scores.
> Selection, not enforcement: the proof lines below must be run and receipted.

## Existing Sensors

| Sensor | Paved command | Dimension | Found in |
|---|---|---|---|
| Boot baseline | `harness boot --json` | maintainability + TS behaviour | harness CLI |
| Full repository gate | `harness checks` | TS maintainability + Vitest + tmux smoke | `.harness/extensions/checks/` |
| Rust workspace tests | — | Rust behaviour | Cargo workspace; no paved recipe/sensor |
| Isolated rs daemon live run | — | end-to-end behaviour | plan AC1/AC3/AC4/AC6; no paved scenario |

## Coverage Matrix

| Criterion / failure mode | Phase | Selected proof | Status | Tier | Probe trail |
|---|---|---|---|---|---|
| Legacy-tapped pane receives the full typed body (AC1) | 1 | BUILD→RUN: add focused Rust contract cases, then a paved Rust test recipe; retain the isolated dev-daemon real-client transcript | BUILDABLE | computational + human-judgement | — |
| Pre-fix witness is red (AC2) | 1 | Run the historical control at `dd450381` and retain its transcript; no current-tree command can prove historical failure | ABSENT | human-judgement | inspected root `justfile`, `.harness/extensions/checks/`, Cargo workspace, and plan assets; no historical-control scenario exists |
| Foreign pipe remains untouched and refusal logs once (AC3) | 1 | BUILD→RUN: focused tmux/observer tests plus isolated daemon foreign-pipe log-count transcript | BUILDABLE | computational | — |
| Tap deferral names `tap-unowned` and drains after claim (AC4) | 1 | BUILD→RUN: delivery integration test covering queued receipt and one-send queued→delivered transition | BUILDABLE | computational | — |
| Gates and blast radius (AC5) | 1 | RUN: `harness checks`; RUN by explicit ruling: `~/.cargo/bin/cargo test --workspace`, `~/.cargo/bin/cargo clippy --workspace -- -D warnings`, `~/.cargo/bin/cargo fmt --check`; inspect the scoped diff and operator-home mtimes | BUILDABLE | computational | — |
| Human-typing veto is bounded, observable, and exactly-once (AC6) | 1 | BUILD→RUN: fake gate veto→clear integration test and state/receipt assertion; retain isolated socket live transcript | BUILDABLE | computational + human-judgement | — |

## Proof Plan (selected)

### Phase 1: Build + prove

| Proves | Mode | Proof line |
|---|---|---|
| AC1, AC3, AC4, AC6 contracts | BUILD→RUN | pave and run focused Rust workspace tests covering legacy/foreign tap ownership, typed reasons, bounded retry, visibility, and dedupe |
| AC1, AC3, AC4, AC6 integration | HUMAN | run the plan's isolated dev daemon against hand-started real clients while production legacy and rs daemons remain untouched |
| AC2 historical control | HUMAN | reproduce on `dd450381` and retain the queued/no-body transcript |
| AC5 repository baseline | RUN | `harness checks` |
| AC5 Rust quality | RUN BY RULING | run and receipt the three explicit `~/.cargo/bin/cargo` commands in AC5; no harness widening |

## Certainty: Weak

Counts (behaviour/architecture rows): 0 RUN · 0 EXTEND · 4 BUILD · 1 ABSENT
Recommended next move: run the prime-approved explicit Cargo receipts plus the isolated live/historical transcripts; Rust sensor work is out of scope.

The existing gate can prove the TypeScript and legacy harness remain healthy, but it cannot currently prove this Rust-only change. Historical red and real-client delivery still require retained transcripts.

## Deferred Harness Improvement

Prime ruled Rust sensors out of plan 133 and is filing the missing canonical gate coverage in the requirements register. This plan uses explicit Cargo test, clippy, and fmt receipts instead.

## Closing Verdict

One thing already done automatically: the exact proof split is recorded here, so the phase cannot confuse a green TypeScript gate with proof of the Rust delivery contracts. Prime approved explicit Cargo receipts and ruled canonical Rust sensors out of scope. If a selected check passes while the live witness fails, the check is wrong and must be strengthened before the code is accepted.

In summary: focused Rust tests plus isolated real-client transcripts prove the delivery behavior, while `harness checks` protects the existing TS/harness surface. Historical red remains a retained human-run control. No further approval is pending for the proof plan.