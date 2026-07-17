# Validation Report 003 — Phase 2 tasks dossier (Daemon manager + CLI surface)

**Target**: `docs/plans/055-pij-watchdog/tasks/phase-2-daemon-manager-cli-surface/tasks.md`
**Tasks SHA-256**: `3cc84a586fd72288b5c1a5f0e20b35c4e809951dc39dd2efff5c2aca6befa455`
**Plan pin re-verified**: `pij-watchdog-plan.md` = `14b03626cf3c9ddb942350d40ebb60c1b59a05dcd0c65f206142f3a1a6618345` — **byte-identical, no drift** (safe to judge)
**Phase 1 status**: COMPLETE — `core/watchdog.ts` exists (final API), review.phase-1.md records the 2-round FIX_REQUIRED→APPROVE cycle
**Validator**: downstream consistency check (plan + code + Phase-1 artifacts read), read-only
**Date**: 2026-07-17

## Verdict

❌ **NEEDS ATTENTION** — 0 critical, 0 high, 1 medium.

The dossier is a faithful, testable expansion of plan v1.0.1 Phase 2 with the validation-001 M1/M3 fixes correctly carried, the Prior Phase Context matching the real `watchdog.ts` exports and review CRITICAL-1 lesson exactly, and the SW-6 cross-stream rule threaded into both T003 and the Context Brief. The single MEDIUM is a store-file **location/domain** mistag that risks dropping an fs adapter into the pure-core directory; a hedge in the same row mitigates it but the named path and domain tag should be corrected.

## Validation Contract

- **Purpose / outcome**: Wire the proven pure watchdog core into the daemon fabric (fire/pause/derive/capture) and expose the `pij watchdog …` verbs — so the universal supervision promise becomes live.
- **Promise**: Every plan Phase-2 task (2.1–2.7) + the M1/M3 plan fixes become actionable tasks with testable Done-Whens, real paths, correct domains, faithful decision semantics, and an accurate handoff from the completed Phase 1.
- **Proof target**: Implementation-readiness (a tasks dossier).
- **Upstream**: plan v1.0.1 (§ Phase 2 tasks 2.1–2.7, D5/D7/D8, Domain Manifest, validation-001 M1/M3); Phase-1 outputs (`core/watchdog.ts`, review.phase-1.md, execution.log.md); backpressure Proof Plan Phase 2.
- **Consumers**: the implement verb (Phase 2) → Phase 3 (temp-daemon proof) consumes the wired surface.
- **Position**: mounts `WatchdogManager` in the daemon tick; adds `FsWatchdogStore`; hooks compact at both seams; wires stalled through the shared latch; adds CLI verbs + a `--json` watchdog block.
- **Constraints / non-goals**: SW-6 (minimal `daemon.ts` diff, `loop.ts` untouched, second-lander-rebases — spine Seq 436); additive-only `types.ts`; no `system_state` invention; no thaw/limit parsing; no live-daemon restart.
- **Sources**: the tasks file, plan v1.0.1, `core/watchdog.ts`, review.phase-1.md, live source (`daemon.ts`, `adapters/watch-store.ts`, `core/session.ts`, `core/daemon/watch.ts`), the `adapters/` listing.

## Item-by-item findings against the ask

### 1. Faithful expansion of plan 2.1–2.7 (+ M1/M3) — PASS

| Plan Phase-2 task | Tasks entry | Verdict |
|---|---|---|
| 2.1 fake-port manager tests (reconcile, fire→deliver split AC-10, pre-bind skip, dispose) | T001 | FAITHFUL |
| 2.2 `FsWatchdogStore` + `WatchdogManager` | T002 | FAITHFUL (store location = the MEDIUM below) |
| 2.3 mount in `daemon.ts tick()`, pre-injection capture, `lastWatchdogFireAt` via `writeMerged`, exclude fires from `paneSig` | T003 | FAITHFUL |
| 2.4 stalled wiring, shared latch (D8), recovery clears, broaden doc comment | T004 | FAITHFUL — M3 carried ("SHARED whole-life latch (`this.pushed`)") |
| 2.5 compact auto-pause both seams (tmux router; pi `session.ts onInbound`) | T005 | FAITHFUL — M1 carried (`core/session.ts` named) |
| 2.6 watcher captures, anomaly gating, pointer + head, per-watcher policy | T006 | FAITHFUL — D7 paneless n/a line carried |
| 2.7 CLI verbs + `--no-watchdog` + `--json` block | T007 | FAITHFUL |
| — (gate) | T008 | ADDED — legitimate tests-green gate (Proof Plan Phase 2), not invented scope |

No dropped scope; no invented product scope. T007 adds `core/spawn.ts` for the `--no-watchdog` flag — a reasonable seam (spawn-arg parsing lives there) that the plan folded under the cli.ts row; not invented scope.

### 2. Prior Phase Context vs real Phase-1 artifacts — PASS (accurate)

Every export the brief lists (lines 31–37) exists in `core/watchdog.ts` with the exact signature:
`effectiveWatchdog` (l.15), `applyWatchdogResume` (l.36), `applyWorkingTransition` (l.42), `applyCompactPause` (l.47), `isFireDue(cfg,lastFireAt,lastEventAt,nowMs)` (l.61), `evaluateResponse(inputs)` (l.96), `buildWatchdogTurn(id,ordinal,cfg)` (l.114), `shouldCapture`/`captureSlice` (l.138/162), `DEFAULT_/MAX_CAPTURE_*` (l.133–136), `DEFAULT_WATCHDOG_INTERVAL_MS` (l.6). The `*WasWatchdog` attribution triple is real: `eventAdvanceWasWatchdog` (l.91), `changeWasWatchdog` (l.83), `workingTransitionWasWatchdog` (l.84). No invented or missing export.

The daemon-supplied-attribution gotcha (lines 38–42) matches review CRITICAL-1 exactly: Round 1 flagged `workingTransition` accepted unconditionally (self-masking hole); the fix added typed `workingTransitionWasWatchdog`; the lesson is "a busy transition caused by delivering the watchdog turn is watchdog-attributable" — quoted verbatim in the brief and threaded into T003 ("the daemon knows what it injected — a busy transition right after its own `sendText` is watchdog-attributable"). Accurate carry.

### 3. Pre-Implementation Check paths vs real tree — one mistag (the MEDIUM)

- `core/session.ts` ~line 376 pi compact seam: **CONFIRMED** — `onInbound` at `session.ts:352`, `this.ports.pi.compact()` at `session.ts:376`. The "~line 376" reference is exact.
- `daemon.ts`, `router.ts`, `index.ts`, `cli.ts`, `types.ts`, `state.ts` all exist as claimed.
- Store-file suggestion: **NOT sensible as named** — see M1 below.

### 4. SW-6 constraint carried into T003 + Context Brief — PASS

T003 Notes tag "SW-6" and its clause "keep the daemon.ts diff MINIMAL (SW-6)" with Done-When "diff review confirms no unrelated daemon.ts churn". Pre-Impl row for daemon.ts is tagged "⚠ SW-6 | SMALLEST possible diff (s054 P2 concurrently edits this file … second lander rebases)". Context Brief (lines 112–116) states the rule in full: names spine Seq 436, "s054 P2 is concurrently editing `daemon.ts` + `core/daemon/loop.ts`", "do NOT touch `core/daemon/loop.ts` at all", "second lander rebases". No Phase-2 task path names `loop.ts` — consistent. Correctly carried.

### 5. Done-Whens testable · tests-first · domains vs Manifest — PASS

- **Testable**: all eight Done-Whens are observable (RED suite existence T001; named green fake scenarios T002/T004/T005/T006; verbatim-verb coherence + `--help` envelope T007; `just` gate T008). T004's "exactly one notice even when both detectors trip" and T005's "self-pause/exempt never downgraded" are concrete assertions.
- **Tests-first**: T001 writes the failing fake-port suite before T002 implements — Hybrid TDD preserved (mirrors `watch.test.ts`). Chain T001→…→T008 intact.
- **Domain vs Manifest**: T001/T003/T006 = pij-control-plane; T004 daemon.ts+types.ts = pij-control-plane+pij-messaging; T005 router.ts+session.ts = pij-control-plane+pij-messaging; T007 cli.ts+spawn.ts = pij-messaging — all match the plan Domain Manifest rows (`watchdog-manager.ts`/`daemon.ts`/`router.ts` = pij-control-plane; `types.ts`/`session.ts`/`cli.ts` = pij-messaging). The one exception is the store file (not in the Manifest), whose tag is the MEDIUM.

## Finding

### M1 — `FsWatchdogStore` is named into the pure-core dir; the repo's store convention is `adapters/` (MEDIUM, confidence high)
- **location**: tasks.md line 55 (Pre-Impl: "`.pi/extensions/pij/core/watchdog-store.ts` … pij-messaging ✓") and T002 path ("…/core/watchdog-store.ts (or beside FsWatchStore)")
- **proof**: The cited pattern donor `FsWatchStore` lives at `.pi/extensions/pij/adapters/watch-store.ts`; every `Fs*Store` in the repo (`baton-store.ts`, `focus-store.ts`, `watch-store.ts`) sits in `adapters/`, and `find core/ -name "*store*"` returns nothing. An `Fs*Store` performs fs I/O, so it is an adapter, not pure core — placing it at `core/watchdog-store.ts` (tagged pij-messaging) contradicts the ports/pure-core discipline this plan and Phase-1 review guard, and the convention is unambiguous.
- **impact**: An implementer following the named path/domain literally drops an I/O adapter into the pure-core directory. The backpressure survey records there is NO architecture-fitness sensor repo-wide (`backpressure-coverage.md` — ABSENT row), so this tasks doc is the only guardrail; a review might miss it. The in-row hedge ("or beside FsWatchStore … find where `FsWatchStore` lives and sit beside it") points the right way and lowers, but does not remove, the risk.
- **smallest_fix**: Name the store `.pi/extensions/pij/adapters/watchdog-store.ts` (domain pij-control-plane, infra — beside `watch-store.ts`); keep the `WatchdogStorePort` interface in `core/daemon/` beside the manager, matching how `WatchStorePort` (in `core/daemon/watch.ts`) pairs with `FsWatchStore` (in `adapters/`).
- **contract_ref**: Pre-Implementation Check / T002 / Domain Manifest.

## Thesis

**Advanced.** The dossier fulfils its Promise: a faithful, testable Phase-2 expansion that carries the M1/M3 plan fixes, hands off accurately from the completed Phase 1 (exports + CRITICAL-1 lesson verified against real source), and honors the binding SW-6 rule. Target proof = actual proof — every load-bearing claim (exports, seam line, store convention, `loop.ts` avoidance) was checked against live source. The one MEDIUM is a location/domain tightening, not a scope or correctness defect.

## Consumers

Phase 3 (temp-daemon proof, smoke, docs) consumes the wired surface; the verbs T007 ships match `buildWatchdogTurn`'s taught commands (`pij watchdog pause/resume`, `watchdog.ts:116–118`) — the tasks doc even asserts that coherence (AC-02↔AC-03). No forward-compatibility break; 7/7 binding constraints preserved.

## Open decision

None requiring human judgment. M1 is a mechanical path/domain correction; left unrepaired here per the "modify nothing else" instruction.
