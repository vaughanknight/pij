# Validation — pij-tmux-control-plane-plan

**Verdict**: ✅ VALIDATED WITH FIXES (v1.1.1)
**Target**: `docs/plans/019-pij-tmux-control-plane/pij-tmux-control-plane-plan.md` (Status: READY, Simple, CS-4)
**Validated**: 2026-06-27 · adaptive (lead + 1 critic) · 2 rounds
**Deterministic proof**: PASS — structure intact (1× Business Spec / Planning Seam / Implementation Plan / Status READY); all 14 ACs defined and mapped; 28 tasks, no dangling coverage-map refs; transcript mangle still matches telemetry source (`claude-adapter.ts:60`); prototype paths exist.

**Thesis**: advanced — the plan is grounded, the prototype resolved the load-bearing readiness risk, and the v1.0.0→v1.1.0 revision closed all four HIGH gaps; v1.1.1 hardened the new binding machinery.

## Round 1 (v1.0.0) — 4 HIGH + 2 MED → all CLOSED in v1.1.0
- **F1** binding over-trusted the agent → CLOSED: deterministic transcript-discovery primary (T010/T011), phone-home confirmatory, watchdog (AC-03/04).
- **F2** no pending-descriptor task → CLOSED: T006 writes `(pij-id,paneId,cwd,harness,state:pending)` atomically; daemon dir-watches it (T016).
- **F3** init not idempotent across restart → CLOSED: `initInjectedAt` persisted (T004), rebuilt (T014), asserted (T016/AC-02).
- **F4** pi-target delivery ownership ambiguous → CLOSED & consistent: sender writes target inbox; pi thin receiver is sole pi-inbox consumer; daemon observes pi inboxes, injects only tmux inboxes; claude→pi test (T021/AC-08).
- **F5** no single-instance lock → CLOSED: T015/AC-10.
- **F6** readiness resolved mid-phase, no gate → CLOSED: T008 is an explicit gate freezing the R-01 marker before Group D+.

## Round 2 (v1.1.0) — 3 new MEDIUM in the new binding machinery → FIXED in v1.1.1
| # | Finding | Fix applied (v1.1.1) |
|---|---------|----------------------|
| N1 | Discovery by *newest-mtime* mis-binds when a pre-existing active session shares the cwd (mtime advances on every turn). | Changed key to **new-path appearance** (a jsonl absent at spawn / birthtime), explicitly NOT mtime — AC-03, T010 (with a pre-existing-transcript fixture that must not be chosen), T011, Risks line. |
| N2 | Watchdog "re-inject once" contradicts `initInjectedAt` init-exactly-once. | Watchdog re-sends **only the confirmatory `pij phonehome` line**, `initInjectedAt` untouched — AC-04, T011. |
| N3 | `pij adopt` (AC-14/T023) unverifiable — no post-spawn new-file event for an already-running agent. | Adopt gets **its own discovery** (required `pij phonehome` or pane-start-time disambiguation) — AC-14, T023. |

Re-check (targeted): all `mtime` mentions now negated; no stray "re-inject once" / "same binding as spawn"; version 1.1.1. PASS.

## Consumers
- Immediate consumer = the implement step. STANDALONE otherwise.

## Open (non-blocking, recorded — not gating)
- R-02 exact mid-turn `send-keys` behaviour: confirm by smoke (T020) during implementation.
- Optional **Spawn→bind state machine** workshop if the lifecycle wants formalizing before build.
