# Backpressure Coverage — one-message-one-delivery

**Plan**: [plan.dd.md](../plan.dd.md)
**Basis (plan SHA-256)**: 69bc917fc8bdf9b5446025828df414d0320cb0d1ef443ed2126c4a97bf183a59
**Generated**: 2026-09-01
**Certainty**: Partial

> Advisory only. Selection, not enforcement: the commands below are the evidence plan for this change.

## Existing Sensors

| Sensor | Paved command | Dimension | Found in |
|---|---|---|---|
| Rust completion gate | `CARGO_INCREMENTAL=0 ~/.cargo/bin/cargo run --locked -p pij-testkit --bin pij-gate` | behaviour + architecture-fitness | `crates/README.md`, `crates/testkit/src/bin/gate.rs` |
| Focused extension tests | `just test .pi/extensions/pij/adapters/rust-runtime.test.ts .pi/extensions/pij/adapters/daemon-http.test.ts` | behaviour | `justfile`, `vitest.config.ts` |
| TypeScript type surface | `just typecheck` | maintainability | `justfile` |
| Tmux driver smoke | `just smoke` | integration behaviour | `justfile`, `harness/scripts/smoke.ts` |
| Full signal inventory | `harness checks` | maintainability + behaviour | `.harness/extensions/checks/` |

## Coverage Matrix

| Criterion / failure mode | Phase | Selected proof | Status | Tier | Probe trail |
|---|---|---|---|---|---|
| One live OMP rendering and terminal queue acknowledgement (ac-1) | 1 | BUILD→RUN: add an in-fence live witness scenario/receipt, then run it against the built daemon and inspect the pane plus queue row | BUILDABLE | computational | — |
| Pre-fix OMP duplicate rendering (ac-2) | 1 | — retained live pane and queue-state receipts; no existing command asserts the defect | ABSENT | human-judgement | inspected `harness/scripts/smoke.ts`, adapter tests, daemon tests, and `crates/*/tests`; no one-message OMP scenario exists |
| Failed or absent extension consumption leaves daemon delivery available (ac-3) | 1 | EXTEND→RUN: add daemon queue and failed-injection cases, then focused Vitest plus `pij-gate` | EXTEND | computational | — |
| Old/new runtime skew loses no body and does not double-ack (ac-4) | 1 | EXTEND→RUN: prove the new extension against the already-shipped event, claim, and ack routes; the daemon wire remains unchanged | EXTEND | computational | — |
| s122 composition types zero additional bodies after extension consumption (ac-5) | 1 | BUILD→RUN: compose against the compilable s122 branch and run its tmux-delivery proof plus the s123 live witness | BUILDABLE | computational | — |
| Rust, TypeScript, lint, test, and smoke gates stay green (ac-6) | 1 | RUN: `CARGO_INCREMENTAL=0 ~/.cargo/bin/cargo run --locked -p pij-testkit --bin pij-gate`; `harness checks` | EXISTS | computational | — |
| Rust inbox serialization and TypeScript decoding cannot drift by duplicated field spelling | 1 | EXTEND→RUN: assert one daemon-owned inbox-claim fixture in Rust and consume it in Vitest, then focused Vitest plus `pij-gate` | EXTEND | computational | — |
| Acknowledgement occurs only after successful injection | 1 | EXTEND→RUN: add claim/inject/ack ordering and forced-injection-failure cases to `rust-runtime.test.ts`, then `just test .pi/extensions/pij/adapters/rust-runtime.test.ts` | EXTEND | computational | — |
| Another daemon worker already owns the row | 1 | EXTEND→RUN: extension claim returns empty and suppresses injection while the winning daemon rung retains the body; prove in Rust and Vitest | EXTEND | computational | — |

## Proof Plan (selected)

### Phase 1 — ack seam + duplicate witness

| Proves | Mode | Proof line |
|---|---|---|
| Live single delivery | BUILD | Add and run the live OMP witness; retain pane rendering and terminal queue-row evidence. |
| No silent drop | EXTEND | Add failed-injection and no-consumer cases; run focused Vitest and `pij-gate`. |
| Version skew | EXTEND | Keep `message.pushed` unchanged; prove the new extension claims through the already-shipped inbox endpoint and old extensions see no daemon wire change. |
| Cross-runtime contract | EXTEND | Add one Rust-owned inbox-claim fixture consumed by TypeScript; run focused Vitest and `pij-gate`. |
| s122 compatibility | BUILD | Run the composed live scenario when s122 is compilable; otherwise record the exact unavailable branch/interface receipt allowed by ac-5. |
| Completion gate | RUN | Run `CARGO_INCREMENTAL=0 ~/.cargo/bin/cargo run --locked -p pij-testkit --bin pij-gate` and `harness checks`. |

## Certainty: Partial

Counts (behaviour/architecture rows): 1 RUN · 5 EXTEND · 2 BUILD · 1 ABSENT

Recommended next move: extend the existing Rust/Vitest sensors before changing behavior, then retain the required pre-fix and post-fix live OMP receipts.

## Recommended Phase 0: Establish Backpressure

| Sensor to build/extend | Proves | Suggested form | Paved command it strengthens/exposes |
|---|---|---|---|
| Rust-owned inbox-claim golden fixture | cross-runtime claim/ack compatibility | daemon claim serialization fixture consumed by adapter Vitest | focused `just test …` + `pij-gate` |
| Runtime claim/inject/ack contract cases | ordering, failed injection, existing-daemon skew | extend `rust-runtime.test.ts` | `just test .pi/extensions/pij/adapters/rust-runtime.test.ts` |
| Live OMP witness receipt | exactly one rendering plus terminal queue state | in-fence scenario and captured pane/API evidence | scoped scenario command; full `harness checks` remains the completion gate |

## Closing Verdict

One thing already done automatically: the proof commands and the live-proof gap are recorded beside the plan, so implementation is checked by commands rather than confidence. One thing built with the fix: a shared Rust/TypeScript inbox-claim fixture plus claim-before-inject tests; the unchanged daemon event triggers the extension to pull the authority-owned row, inject it once, then acknowledge it. If those checks pass but the live OMP witness disagrees, the checker is wrong and must be fixed before the product code is accepted.

In summary: focused Vitest, the Rust gate, and `harness checks` prove claim/inject/ack ordering, unchanged wire compatibility, and regression safety. The retained pre-fix duplicate and post-fix OMP transcripts prove the behavior the suites missed; the no-extension transcript proves the body remains available through daemon inbox delivery. The s122 composition remains explicitly pending its pinned green SHA.
