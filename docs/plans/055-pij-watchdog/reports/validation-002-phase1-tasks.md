# Validation Report 002 — Phase 1 tasks dossier (Pure watchdog core)

**Target**: `docs/plans/055-pij-watchdog/tasks/phase-1-pure-watchdog-core/tasks.md`
**Tasks SHA-256**: `5dddb35235fac6a0c69e633ba3f74d578d586b8c954fdfe574d7e70771fe326d`
**Plan pin re-verified**: `pij-watchdog-plan.md` = `14b03626cf3c9ddb942350d40ebb60c1b59a05dcd0c65f206142f3a1a6618345` — **byte-identical to the stated pin, no drift** (safe to judge)
**Backpressure basis**: `backpressure-coverage.md` basis SHA = `14b03626…` — same plan version, consistent
**Validator**: downstream consistency check (plan + code context already held), read-only
**Date**: 2026-07-17

## Verdict

✅ **VALIDATED** — 0 critical, 0 high, 0 medium. One LOW documentation imprecision noted below (non-blocking, changes no task action).

The dossier is a faithful, testable, purity-correct expansion of plan v1.0.1 Phase 1. Every plan task 1.1–1.7 maps 1:1 to T001–T007 with no invented product scope and no dropped scope; the D1/D2/D3/D4/D7 semantics are carried into Done-When wording accurately; purity constraints are stated correctly against the real source layout; and nothing contradicts the seven binding constraints or the backpressure Proof Plan.

## Validation Contract

- **Purpose / outcome**: Expand plan Phase 1 into an executable, tests-first task list so Phase 2 daemon wiring is thin composition over a proven pure core.
- **Promise**: Each plan Phase-1 task becomes an actionable task with a testable Done-When, real paths, correct domain, and faithful decision semantics — implementable without re-reading the plan.
- **Proof target**: Implementation-readiness (a tasks dossier).
- **Upstream**: `pij-watchdog-plan.md` v1.0.1 (§ Phase 1 tasks 1.1–1.7, D1–D8, Domain Manifest); `backpressure-coverage.md` (Proof Plan Phase 1).
- **Consumers**: the implement verb (Phase 1) → then Phase 2 (`WatchdogManager`, CLI) consumes the pure surface (`effectiveWatchdog`, `isFireDue`, `evaluateResponse`, `buildWatchdogTurn`, `captureSlice`/`shouldCapture`, `applyCompactPause`, `WatchdogSidecar`).
- **Position**: pure module `core/watchdog.ts` + additive `types.ts` surface; no exported behaviour lands before Phase 2 wires it.
- **Constraints / non-goals**: pure (no fs/tmux/clock — `nowMs` a parameter); no daemon imports; additive-only `types.ts`; `binding.ts` untouched (D6); the seven brief constraints.
- **Sources**: the tasks file, plan v1.0.1, backpressure-coverage.md, and live source (`binding.ts`, `daemon/loop.ts`, `state.ts`, `types.ts`, `readiness.ts`, `justfile`).

## Faithful-expansion ledger (plan 1.x → tasks Txxx)

| Plan Phase-1 task | Tasks entry | Semantics carried | Verdict |
|---|---|---|---|
| 1.1 tests: sidecar defaults + tiers | T001 | D1 absent⇒enabled@1_200_000 ms; D2 self=verb-only, compact=auto-resume-on-working-transition, exempt=never-fires+excluded | FAITHFUL |
| 1.2 `WatchdogSidecar` + `effectiveWatchdog` | T002 | additive beside `WatchSubscription` (types.ts:224 ✓); zero daemon imports | FAITHFUL |
| 1.3 fire scheduler `isFireDue` | T003 | activity-anchored, never skips during freeze, no drift; `nowMs` param | FAITHFUL |
| 1.4 unresponsive `evaluateResponse` | T004 | D7 typed input-availability, paneless⇒event-advance-only; 2 silent fires⇒stalled; D4 daemon-injected text excluded | FAITHFUL |
| 1.5 self-teaching turn builder | T005 | AC-02 verbs verbatim + etiquette + ordinal; D7 capture-n/a note for paneless | FAITHFUL |
| 1.6 capture policy `captureSlice` | T006 | D3 tail-only, 40 lines ∧ 4096 B, ceiling 200/16384, anomaly-only gating | FAITHFUL |
| 1.7 `applyCompactPause` | T007 | shared pure hook both P2 seams call; idempotent; stronger claim not downgraded | FAITHFUL |
| — (no plan equiv) | T008 phase gate | `just typecheck ∧ test ∧ lint` | ADDED — legitimate gate, backed by Backpressure Proof Plan Phase 1; not invented product scope |

No dropped scope; no invented scope. T008 is a standard tests-green gate, not new product behaviour.

## Fresh-proof ledger (claims verified against live source)

| Claim in tasks.md | Checked against | Result |
|---|---|---|
| `evaluateWatchdog` lives in `binding.ts` (spawn phone-home, untouched) | `core/binding.ts:257` | CONFIRMED |
| `WatchSubscription` sidecar precedent at `types.ts:224` | earlier grep — `types.ts:224 export interface WatchSubscription` | CONFIRMED |
| `state.ts` `STALE_AFTER_MS`/`liveness()`/`isStalled()`/`classifyDeathReason`; `"stalled"` in `DeathReason` | `core/state.ts` (read in val-001) | CONFIRMED |
| `readiness.ts` `BUSY_RE` defines "output" | `core/readiness.ts:62-63` | CONFIRMED |
| `state.test.ts`/`binding.test.ts` conventions exist to copy | `ls` | CONFIRMED both present |
| `core/watchdog.ts` does not yet exist (create) | `ls` → No such file | CONFIRMED (no on-disk clash) |
| `just typecheck` ∧ `test` ∧ `lint` (T008) + smoke/self-check/local-path-check (backpressure) | `justfile:73,76,84,95,103,141` | CONFIRMED all recipes real |

## Purity-constraint audit (ask item 3)

- **No daemon imports**: stated (line 108) and enforced in T002 Done-When ("zero imports from daemon/**"). ✓
- **`nowMs` as parameter (no clock reads)**: stated (105–107); the two functions that need "now" take it — `isFireDue(cfg, lastFireAt, lastEventAt, nowMs)` (T003), `applyCompactPause(sidecar, nowMs)` (T007). The clockless functions (`evaluateResponse`, `buildWatchdogTurn`, `captureSlice`) correctly take none. ✓
- **`types.ts` additive-only**: stated (110), Pre-Impl Check, and T002. ✓
- **`binding.ts` untouched (D6)**: stated (111), Non-Goals (23), Pre-Impl Check (29). ✓

## Task-table quality (ask item 2)

- **Done-When testable**: all eight are observable/executable (failing-suite existence; named green cases; `just` commands; verbatim-string assertions in T005; boundary cases incl. multibyte in T006; idempotency/downgrade in T007). ✓
- **Tests-first (Hybrid TDD)**: T001 writes the failing tier/default suite before any implementation; T002–T007 are "Tests+impl" (test-first within each) — exactly the plan's own 1.1 / 1.3–1.7 shape. Ordering chain T001→…→T008 preserves TDD-first. ✓
- **Paths real**: `core/watchdog.ts` (create), `core/watchdog.test.ts` (create), `core/types.ts` (modify) — all correct absolute paths. ✓
- **Domain assignment vs Manifest**: every Phase-1 task is `pij-messaging`, matching the plan Domain Manifest rows for `watchdog.ts`, `watchdog.test.ts`, and `types.ts`. (The `watchdog-manager.ts` = pij-control-plane rows are Phase 2, correctly absent here.) ✓

## Binding-constraint & backpressure cross-check (ask item 4)

No contradiction. Phase 1 is pure functions with no I/O, so push-not-poll holds trivially (the fire→response diagram attributes firing to the P2 daemon). No thaw/limit-banner logic (T004 keys on delivered fires + output observation). WS-6 vocabulary respected (T004 composes with the existing `"stalled"`, Context Brief line 98). Capture policy matches D3. Exemption is first-class (T001). Backpressure Proof Plan Phase 1 names "tasks 1.1–1.7 cases; then `just test`" + `just typecheck`; T008's `typecheck ∧ test ∧ lint` is a compatible superset — no conflict, and both artifacts pin the same plan SHA `14b03626…`.

## Finding

### L1 — Duplication-scan note mis-attributes `WATCHDOG_TIMEOUT_MS` to `binding.ts` (LOW, confidence high)
- **location**: tasks.md line 34 ("the only 'watchdog' symbols are binding.ts `evaluateWatchdog`/`WATCHDOG_TIMEOUT_MS`")
- **proof**: `evaluateWatchdog` is in `core/binding.ts:257`, but `WATCHDOG_TIMEOUT_MS = 20_000` is defined in `core/daemon/loop.ts:408`, not `binding.ts`.
- **impact**: None on task action — both files are out of Phase-1 scope (binding.ts untouched per D6; loop.ts is Phase-2 territory), and the scan's conclusion (no on-disk clash for the new `watchdog.ts`; spawn-scoped symbols respected not duplicated) is correct regardless. Purely a prose accuracy nit.
- **smallest_fix**: In line 34, attribute `WATCHDOG_TIMEOUT_MS` to `daemon/loop.ts` (or say "binding.ts `evaluateWatchdog` + loop.ts `WATCHDOG_TIMEOUT_MS`"). Left unrepaired here per the "modify nothing else" instruction.
- **contract_ref**: Pre-Implementation Check / duplication scan.

## Thesis

**Advanced.** The dossier fulfils its Promise: a faithful, testable, purity-correct Phase-1 expansion that an implementer can execute without re-reading the plan. Target proof = actual proof — every load-bearing layout and command claim was verified against live source and the `justfile`. The single finding is LOW and action-neutral.

## Consumers

Phase 2 (`WatchdogManager`, CLI verbs) consumes the pure surface this phase defines; the signatures named here (`effectiveWatchdog`, `isFireDue`, `evaluateResponse` with a typed input-availability shape, `applyCompactPause`, `WatchdogSidecar`) match the plan's Phase-2 task references (2.1–2.7). No forward-compatibility break. 7/7 binding constraints preserved.
