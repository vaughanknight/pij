# Fix false "💀 exited (quota)" on a live, working session

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-06-28
**Status**: READY
**Spec source**: unified (this file)
**Queued**: do AFTER plan-022 codex build lands + reviews (shared files: `daemon.ts`, `core/state.ts`, `core/binding.ts`)

## Business Specification

### Research Context

Found live during the plan-022 flow-pair dogfood. The whole-life creator-notify shipped by **plan 023 (fail-loud-model)** — specifically the provider-failure peek `PijDaemon.pushProviderFailure` (`daemon.ts:175`, the FIX-A / DL-005 path) — pushed a terminal `💀 … has exited (reason: quota). The session is dead and will not recover.` for a coder that was **alive and actively progressing** (`pid` alive, `lastEventAt` advancing every few seconds, `state === "working"`, footer `✽ Schlepping…`). The session had hit a **transient** rate-limit that the harness retried through. Full root-cause + evidence: `docs/plans/019-pij-tmux-control-plane/control-plane-feedback.md` § Fourth run.

### Summary

Make the provider-failure death signal **fail loud only when truly terminal**. Today `pushProviderFailure` classifies death from pane scrollback text alone (`classifyDeathReason`, `state.ts:84`), and `QUOTA_RE` (`state.ts:75`) matches the **retryable** class (`429`/`overloaded`/`529`/`rate_limit_exceeded`) — exactly the text a harness prints then auto-retries through. The fix adds **liveness corroboration** (don't declare death while the session is demonstrably progressing), **splits transient vs terminal** quota patterns, **reconciles** a stale `failureReason` away on recovery, and **softens the wording** until non-recovery is proven — all without regressing the real Case-3 the peek exists for (a worker stuck idle on a fatal error).

### Goals

- A session whose `pid` is alive AND `lastEventAt` is advancing AND `state === "working"` is **never** reported as `💀 exited / will not recover`.
- A **transient** rate-limit (`429`/`overloaded`/`529`) the harness retries through produces **no** death notice and **no** sticky `failureReason`.
- A genuinely **stuck-idle-on-fatal-error** session (Case-3) still fires exactly one creator notice — no regression.
- A `failureReason` set on a session that later resumes emitting events is **cleared** (liveness reconciliation).

### Non-Goals

- **No auto-heal / restart / fallback-model** — inherits plan 023's stance; truly-dead stays a human decision.
- No change to the authoritative **dead branch** (`!pidAlive`, `daemon.ts:135`) — it is correct.
- No new death taxonomy values; no change to `pij models` / spawn-time validation (plan 023 scope).

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|----------------------|
| pij-control-plane | existing | **modify** | Liveness-corroborate + reconcile the provider-failure peek in the daemon |
| pij-messaging | existing | **modify** | Split transient vs terminal in the pure death-reason classifier; soften the notice text |

No NEW domains.

### Testing Strategy

- **Approach**: Full TDD on the pure seams (classifier + the peek's decision), which already have fakes in the existing daemon/state/binding tests.
- **Focus areas**: `classifyDeathReason` transient/terminal split; `pushProviderFailure` liveness gate (fires only when not-progressing); reconcile-on-recovery clears `failureReason` + the `provider-failure` latch; `buildDeadNotice` wording.
- **Mock usage**: the existing port fakes (tmux capture-pane, registry, clock, channel) in `daemon.test.ts` / `loop.test.ts`; pure unit tests for `state.ts` / `binding.ts`.
- **Mutation discipline**: the gate test must flip RED when the liveness condition is reverted (a working+progressing session must NOT fire).

### Documentation Strategy

- **Location**: a History row in `docs/domains/pij-control-plane/domain.md`; mark the § Fourth run finding resolved in `019/control-plane-feedback.md`.

### Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=1, D=0, N=0, F=0, T=1
- **Confidence**: 0.9
- **Assumptions**: the existing `lastEventAt` + `state` descriptor fields (shipped by 023's liveness work) are reliable enough to corroborate progress — they are, per the working|idle|done work (task #11).
- **Phases**: 1 (Simple).

### Acceptance Criteria

- **AC-01**: a session with `pid` alive, `state === "working"`, and `lastEventAt` newer than the stale threshold does **not** trigger `pushProviderFailure` even when the captured pane matches `QUOTA_RE` (transient retry). (Unit/fake test.)
- **AC-02**: `classifyDeathReason` returns a **non-fatal** result for transient-only patterns (`429`/`overloaded`/`529`/`rate_limit_exceeded` with no terminal marker) and **`quota`** only for the terminal subclass (`insufficient credit|balance|billing|prepaid|payAsYouGo`). (Pure test.)
- **AC-03**: a stuck-idle-on-fatal session (`pid` alive, NOT working, `lastEventAt` stale, terminal pattern) still fires exactly one creator notice — Case-3 unregressed. (Fake test.)
- **AC-04**: a descriptor carrying `failureReason` that subsequently advances `lastEventAt` / flips to `working` has `failureReason` and the `provider-failure` latch **cleared** on the next tick. (Fake test.)
- **AC-05**: the non-terminal/ambiguous notice wording no longer asserts "has exited … will not recover" until non-recovery is corroborated. (Assertion on `buildDeadNotice` / new notice.)
- **AC-06**: full suite green — no regression to dead/stalled branches or claude/copilot/codex bind. (`harness checks`.)

### Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| R-1 over-tightening the gate re-opens Case-3 (a real fatal error now goes unreported) | Low | High | AC-03 explicitly pins Case-3; the gate keys on not-working+stale, which Case-3 satisfies by definition. |
| R-2 transient/terminal regex split mis-buckets a real provider's wording | Low | Medium | conservative split — keep `429/overloaded/529` transient; only credit/billing/insufficient stays terminal; "unknown" never fires (unchanged). |
| R-3 file collision with the live plan-022 codex coder | Medium (timing) | Low | **queued** — start only after the codex build lands + reviews. |

### Open Questions

None blocking.

### Workshop Opportunities

None — contained bug fix with a clear root cause.

### Clarifications

#### Session 2026-06-28
- **Workflow Mode** → Simple (single phase; tighten one decision path + classifier).
- **Sequencing** → queued after plan-022 codex build (shared files).

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | root cause + fix direction established live |
| G2 | Constitution | N/A | no `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | no `docs/project-rules/architecture.md` |
| G4 | ADR Compliance | N/A | no `docs/adr/` |
| G5 | Structure | PASS | all required sections present |
| G6 | Testing Alignment | PASS | TDD — RED tests precede impl; ACs measurable |
| G7 | Domain Completeness | PASS | both domains existing; Manifest covers every file |

### Summary

Add a liveness gate to `pushProviderFailure` so a death notice fires only when the session is **not progressing**; split the quota classifier into transient (non-fatal) vs terminal; clear a stale `failureReason` + latch when a session recovers; and soften the notice wording. Mirror the stalled-branch's existing corroboration (`isWorking` + event-age vs `STALE_AFTER_MS`) so the change is minimal and consistent.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/state.ts` | pij-messaging | internal | split `QUOTA_RE` transient vs terminal in `classifyDeathReason` (pure) |
| `.pi/extensions/pij/core/state.test.ts` | pij-messaging | internal | classifier transient/terminal cases |
| `.pi/extensions/pij/core/binding.ts` | pij-messaging | contract | soften `buildDeadNotice` wording for non-corroborated reasons |
| `.pi/extensions/pij/core/binding.test.ts` | pij-messaging | internal | wording assertion |
| `.pi/extensions/pij/daemon.ts` | pij-control-plane | internal | liveness gate in `pushProviderFailure`; reconcile-on-recovery clears `failureReason` + `provider-failure` latch |
| `.pi/extensions/pij/daemon.test.ts` | pij-control-plane | internal | gate + Case-3 + reconcile fake-port tests |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `pushProviderFailure` (`daemon.ts:175`) fires on pane scrollback alone — no liveness check — so a working, progressing session is declared terminally dead. | Gate the `isFatal` fire on not-progressing (mirror stalled branch: `state !== "working"` AND `lastEventAt` stale past `STALE_AFTER_MS`). |
| 02 | High | `QUOTA_RE` (`state.ts:75`) lumps retryable (`429`/`overloaded`/`529`) with terminal (`credit`/`billing`/`insufficient`); the retryable class is what harnesses retry through. | Split: retryable → non-fatal (or fatal-only-when-stuck); terminal subclass → `quota`. |
| 03 | Medium | `failureReason` + the `provider-failure` latch are sticky — never cleared when a session recovers. | On a tick where a flagged session has advanced `lastEventAt` / is `working`, clear `failureReason` and drop the `provider-failure` latch entry. |
| 04 | Low | `buildDeadNotice` (`binding.ts:146`) asserts "has exited … will not recover" for any reason. | Use corroborated wording; reserve "will not recover" for `!pidAlive` or stuck-and-confirmed. |

### Implementation

**Objective**: the provider-failure death signal fires only when the session is genuinely not recovering; transient retries are silent; stale flags self-heal.
**Testing Approach**: Full TDD on the pure classifier + the peek decision (existing fakes); `harness checks` for regression.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Test: `classifyDeathReason` — transient-only pane (`429`/`overloaded`/`529`/`rate_limit_exceeded`) → non-fatal; terminal pane (`insufficient credit`/`billing`/`balance`) → `quota` | pij-messaging | `core/state.test.ts` | RED | Finding 02; AC-02 |
| [ ] | T002 | Impl: split `QUOTA_RE` into transient vs terminal in `classifyDeathReason` (keep "unknown" behaviour) | pij-messaging | `core/state.ts` | T001 green; suite green | AC-02 |
| [ ] | T003 | Test: `pushProviderFailure` does NOT fire when `pid` alive + `state==="working"` + `lastEventAt` fresh (transient pattern present); DOES fire when not-working + stale + terminal pattern (Case-3) | pij-control-plane | `daemon.test.ts` | RED; mutation: reverting the gate flips the no-fire case | Finding 01; AC-01, AC-03 |
| [ ] | T004 | Impl: add liveness gate to `pushProviderFailure` (mirror stalled-branch corroboration: `isWorking` + event-age vs `STALE_AFTER_MS`) before the fatal fire | pij-control-plane | `daemon.ts` | T003 green | AC-01/03 |
| [ ] | T005 | Test: a descriptor with `failureReason` set that advances `lastEventAt`/flips to working has `failureReason` + `provider-failure` latch cleared next tick | pij-control-plane | `daemon.test.ts` | RED | Finding 03; AC-04 |
| [ ] | T006 | Impl: reconcile-on-recovery — clear `failureReason` + drop the latch entry when a flagged session shows progress | pij-control-plane | `daemon.ts` | T005 green | AC-04 |
| [ ] | T007 | Test+Impl: soften `buildDeadNotice` wording for non-corroborated reasons (reserve "will not recover" for authoritative death) | pij-messaging | `core/binding.ts`, `core/binding.test.ts` | RED→green | Finding 04; AC-05 |
| [ ] | T008 | Docs: History row in pij-control-plane domain; mark `019/control-plane-feedback.md` § Fourth run resolved | pij-control-plane | `docs/domains/pij-control-plane/domain.md`, `docs/plans/019-pij-tmux-control-plane/control-plane-feedback.md` | both updated | |
| [ ] | T009 | Gate: full `harness checks` green (typecheck→lint→test→smoke→pkg-audit→snapshots) | pij-control-plane | — | clean | AC-06 |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T003, T004 | daemon fake test |
| AC-02 | T001, T002 | state pure test |
| AC-03 | T003, T004 | daemon fake test (Case-3) |
| AC-04 | T005, T006 | daemon fake test |
| AC-05 | T007 | binding test |
| AC-06 | T009 | full suite |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| R-1 gate re-opens Case-3 | Low | High | AC-03 pins it; gate keys on not-working+stale |
| R-2 regex mis-bucket | Low | Medium | conservative split; unknown unchanged |
| R-3 collision w/ codex coder | Medium | Low | queued after plan-022 lands |
