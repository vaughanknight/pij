# Compensating review packet — Plan 059 Phase 3 keystone

**Reviewer**: `pij-reasonable-dove` (orchestrator backstop; accept-bias acknowledged, not independent)
**Candidate hash**: `6cc07dcfc3546182afd3d1e52bf19c04b248775f550344446c41a6955533a560`
**Worktree/base**: `/Users/jordanknight/pi-hacking/pij-worktrees/round-detection-state` · `fb1bfbd1f617e9b4111c3c0f965b5fe9ffa8d80a`
**Mode**: read-only; no restart/runtime mutation.

## Read first

- `reports/phase-3-ready.md`
- `tasks/phase-3-death-observability/execution.log.md`
- New core/store: `core/spawn-expectation.ts`, `adapters/spawn-expectation-store.ts`, `core/daemon/death-reconciler.ts` and paired tests.
- Wiring: `core/session.ts`, `core/focus.ts`, `cli.ts`, `index.ts`, `daemon.ts`, `core/cli.ts` and paired tests.

## Keystone questions

1. Does any owned teardown kill/dissolve before durable close intent, or claim requested terminal truth before successful/idempotent absence observation?
2. Does every peer launch family persist a spawn-id expectation before launch and clean only its own failed attempt?
3. Can a descriptor and expectation produce two alerts after partial bind/correlation failure?
4. Can malformed time/probe failure become `unrequested`, immortal pending, a cause claim, or a daemon tick crash?
5. Are PID-missing, pane-missing, deadline expiry, and unavailable evidence distinct and temporally honest?
6. Does first-sweep/restart behavior stay historical and duplicate-free while subsequent observations are live?
7. Can Pi reload/new/resume/fork create false terminal history, or can quit disappear silently?
8. Are state/list/human projections and docs complete and legacy-compatible?
9. **Adjudicate explicitly**: terminal/notice latch is persisted before delivery (at-most-once across ticks/restart, but a failed channel delivery can lose the notice). Terminal evidence remains durable. Accept this tradeoff or require a delivery-state refinement; exactly-once is not claimed.

## Evidence

- Final hardening RED: 7/395 failed, then focused 395/395 GREEN.
- Detector regressions 61/61.
- Full suite 3,078 pass / 1 unchanged cleanup timeout / 11 skip; candidate+clean-base exact proof green.
- Quick checks all seven runnable sensors PASS.
- Lead reversible mutations RED: expiry evidence, spawn correlation, historical flag, requested terminal persistence.
- Review independence remains unavailable per prior provider/fd record; genuine cross-provider review is still a convergence-time gate if machine capacity recovers.

Return `P3 COMPENSATING APPROVE` or `P3 COMPENSATING FIX_REQUIRED` with material evidence only.
