# Validation — pij-tmux-control-plane-plan

**Verdict**: ✅ VALIDATED WITH FIXES (v1.2.0)
**Target**: `docs/plans/019-pij-tmux-control-plane/pij-tmux-control-plane-plan.md` (Status: READY, Simple, CS-4)
**Validated**: 2026-07-11 · adaptive (lead + independent critic)

## Validation Contract

- **Purpose**: restore Plan 019's identity-first promise after a full machine restart.
- **Promise**: the same Pi native session, or the same exact external `(harness, harnessSessionId)`, recovers the same `pij-id` while pane/PID/cwd/lifecycle are replaceable attachment data.
- **Proof target**: implementation-ready plan amendment, not implemented behavior.
- **Consumers**: T029 / Build H and its AC-15 tests.
- **Constraints**: no heuristic newest-artifact lookup may establish restart identity; no duplicate identity may be minted; different native sessions remain different peers.
- **Sources**: Plan 019 original ask + AC-12/14; Plan 031 join-key work; current `discovery.ts`, `session.ts`, `binding.ts`, `index-state.ts`, `fs-registry.ts`, `cli.ts`, and `index.ts`.

## Deterministic proof

- PASS — required unified-plan sections present.
- PASS — 29 unique task ids; T029 present.
- PASS — 15 acceptance criteria; every AC has exactly a coverage-map row; AC-15 maps to T029.
- PASS — `harness flow render --check` reports no drift; Build H is on the spine after Build G.
- PASS — `harness checks --quick`: typecheck, lint, test, package audit, and snapshots green; smoke intentionally skipped by the quick gate.

## Findings adjudicated and fixed in v1.2.0

| # | Finding | Plan repair |
|---|---------|-------------|
| F1 | External adopt had no authoritative restart session-id input; newest transcript/session-state can select another live client. | AC-15/T029 now require `adopt --session-id <native-id>` (authoritative harness env equivalent); heuristics are initial-adopt fallback only. |
| F2 | `IndexState` keyed only by bare native id and silently overwrote duplicates, contradicting the exact tuple and fail-loud promise. | Finding 09/T029 now require exact `(harness,harnessSessionId)` cardinality: zero claims, one reuses, many returns ambiguity; `index-state.ts` is in scope. |
| F3 | A lookup-then-random-allocation race could mint duplicates. | Zero matches now claim one deterministic tuple-derived pij-id, so concurrent claims converge; a derived-id collision fails loudly. Atomic filesystem replacement remains the descriptor write seam. |
| F4 | Pi used only a 32-bit derived slug and `PijSession.boot` could drop durable descriptor fields. | Finding 10/T029 now require persisting `harness:"pi"` + exact native id, collision-checking the derived id, and preserving durable fields while refreshing runtime fields. |
| F5 | Pure fixtures could not prove full-restart persistence. | T029/coverage now require a temp-`PIJ_HOME` integration that discards and reconstructs registry/index instances, then proves reuse, attachment refresh, history preservation, ambiguity/collision handling, and no duplicate descriptors. |

## Thesis and consumers

**Thesis**: advanced — the amendment now treats the harness-native session as durable identity and the process/pane as replaceable presence, matching the original Plan 019 promise.

**Consumers**: T029 and the generated Build H flight-plan node have the exact authority, cardinality, persistence, collision, and fresh-process proof needed to implement AC-15 without another identity-design decision.

## Residual boundary

Deleting both the live descriptor and every durable binding record is outside AC-15; a normal full-machine restart preserves `PIJ_HOME`. Implementation behavior remains unproven until T029 lands and its fresh-process integration passes.
